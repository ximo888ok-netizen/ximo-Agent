/**
 * callDeepSeekStreamOnce — 单次流式请求，不含重试逻辑
 *
 * 从 api.ts 提取，api.ts 仅保留 retry wrapper 和兼容接口。
 */

import type { ToolDefinition, ReasoningEffort } from '@shared/types'
import { collectToolCalls } from './context'
import type { StreamHandlers, SingleCallResult } from './types'
import { normaliseUsage } from '@shared/cache'
import type { NormalizedUsage } from '@shared/cache'
import type { ProviderCapabilities } from './provider'
import { buildRequestBody } from './api-request-builder'

/**
 * emitted 标志：任何 reasoning/text/tool_call chunk 已发出则为 true。
 * 中断时由上层 callDeepSeekStream 决定是否重放。
 */
export async function callDeepSeekStreamOnce(
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: { role: string; content: string; tool_calls?: unknown; tool_call_id?: string; reasoning_content?: string }[],
  tools: ToolDefinition[] | undefined,
  thinkingMode: boolean,
  reasoningEffort: ReasoningEffort,
  temperature: number,
  maxTokens: number,
  handlers: StreamHandlers,
  emittedRef: { value: boolean },
  caps?: ProviderCapabilities
): Promise<SingleCallResult> {
  const { onChunk, signal } = handlers

  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`

  const body = buildRequestBody(
    model, messages, tools, thinkingMode, reasoningEffort, temperature, maxTokens, caps
  )

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      return { finishReason: 'stop', content: '', reasoningContent: '', toolCalls: [], emitted: false }
    }
    const msg = e instanceof Error ? e.message : String(e)
    return { finishReason: 'error', content: '', reasoningContent: '', toolCalls: [], error: `网络请求失败：${msg}`, emitted: false }
  }

  if (!response.ok) {
    let errText = ''
    try {
      errText = await response.text()
      const errJson = JSON.parse(errText)
      errText = errJson?.error?.message || errText
    } catch { /* keep raw */ }
    return { finishReason: 'error', content: '', reasoningContent: '', toolCalls: [], error: `API 请求失败 (${response.status})：${errText || response.statusText}`, emitted: false }
  }

  if (!response.body) {
    return { finishReason: 'error', content: '', reasoningContent: '', toolCalls: [], error: 'API 返回了空响应体。', emitted: false }
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  let content = ''
  let reasoningContent = ''
  const toolCallsAcc = new Map<number, { id: string; name: string; arguments: string }>()
  let normalizedUsage: NormalizedUsage | undefined

  // ── 空闲看门狗 ──
  const IDLE_TIMEOUT_MS = 60_000
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  const resetIdleTimer = (): void => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      reader.cancel().catch(() => {})
    }, IDLE_TIMEOUT_MS)
  }
  resetIdleTimer()
  const clearIdleTimer = (): void => {
    if (idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
  }

  try {
    while (true) {
      resetIdleTimer()
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      let lineEnd: number
      while ((lineEnd = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, lineEnd).trim()
        buffer = buffer.slice(lineEnd + 1)

        if (!line || line.startsWith(':')) continue
        if (!line.startsWith('data:')) continue

        const data = line.slice(5).trim()
        if (data === '[DONE]') {
          const tcArray = collectToolCalls(toolCallsAcc)
          if (tcArray.length > 0) {
            return { finishReason: 'tool_calls', content, reasoningContent, toolCalls: tcArray, usage: normalizedUsage, emitted: emittedRef.value }
          }
          return { finishReason: 'stop', content, reasoningContent, toolCalls: [], usage: normalizedUsage, emitted: emittedRef.value }
        }

        try {
          const json = JSON.parse(data)
          const choice = json.choices?.[0]
          const delta = choice?.delta

          if (delta?.content) {
            content += delta.content
            emittedRef.value = true
            onChunk({ content: delta.content })
          }
          if (delta?.reasoning_content) {
            reasoningContent += delta.reasoning_content
            emittedRef.value = true
            onChunk({ reasoningContent: delta.reasoning_content })
          }

          if (delta?.tool_calls) {
            emittedRef.value = true
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              if (!toolCallsAcc.has(idx)) {
                toolCallsAcc.set(idx, { id: tc.id ?? '', name: '', arguments: '' })
              }
              const acc = toolCallsAcc.get(idx)!
              if (tc.id) acc.id = tc.id
              if (tc.function?.name) acc.name += tc.function.name
              if (tc.function?.arguments) acc.arguments += tc.function.arguments
            }
          }

          if (json.usage) {
            normalizedUsage = normaliseUsage(json.usage)
            onChunk({
              usage: {
                promptTokens: normalizedUsage.promptTokens,
                completionTokens: normalizedUsage.completionTokens,
                totalTokens: normalizedUsage.totalTokens,
                promptCacheHitTokens: normalizedUsage.cacheHitTokens,
                promptCacheMissTokens: normalizedUsage.cacheMissTokens
              }
            })
          }

          if (choice?.finish_reason) {
            const fr = choice.finish_reason
            const tcArray = collectToolCalls(toolCallsAcc)

            if (fr === 'tool_calls' || tcArray.length > 0) {
              return { finishReason: 'tool_calls', content, reasoningContent, toolCalls: tcArray, usage: normalizedUsage, emitted: emittedRef.value }
            }
            if (fr === 'stop') {
              return { finishReason: 'stop', content, reasoningContent, toolCalls: [], usage: normalizedUsage, emitted: emittedRef.value }
            }
            if (fr === 'length') {
              return { finishReason: 'length', content, reasoningContent, toolCalls: [], usage: normalizedUsage, emitted: emittedRef.value }
            }
          }
        } catch {
          // 不完整的 JSON，跳过
        }
      }
    }
    clearIdleTimer()
    const tcArray = collectToolCalls(toolCallsAcc)
    if (tcArray.length > 0) {
      return { finishReason: 'tool_calls', content, reasoningContent, toolCalls: tcArray, usage: normalizedUsage, emitted: emittedRef.value }
    }
    return { finishReason: 'stop', content, reasoningContent, toolCalls: [], usage: normalizedUsage, emitted: emittedRef.value }
  } catch (e) {
    clearIdleTimer()
    if ((e as Error).name === 'AbortError') {
      return { finishReason: 'stop', content, reasoningContent, toolCalls: [], usage: normalizedUsage, emitted: emittedRef.value }
    }
    const msg = e instanceof Error ? e.message : String(e)
    return { finishReason: 'error', content, reasoningContent, toolCalls: [], usage: normalizedUsage, error: `流式读取中断：${msg}`, emitted: emittedRef.value }
  }
}
