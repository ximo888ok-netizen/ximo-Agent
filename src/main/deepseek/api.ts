import type { ChatRequest, StreamChunk, TestResult, ToolDefinition, ReasoningEffort } from '@shared/types'
import { errorResult, collectToolCalls, sanitizeContent } from './context'
import type { StreamHandlers, SingleCallResult } from './types'
import { normaliseUsage } from '@shared/cache'
import type { NormalizedUsage } from '@shared/cache'

// ---------- 常量 ----------

/** 流式连接断开最大重试次数 — 重放便宜是因为 prompt cache 命中 */
const MAX_STREAM_RECONNECTS = 3

/**
 * 将应用层 ReasoningEffort 映射为 DeepSeek API 支持的 reasoning_effort 值。
 * 'ultra' 是应用层自定义等级（工程范式 + 监督审查），API 层等价于 'max'。
 */
export function toApiEffort(effort: ReasoningEffort): 'off' | 'high' | 'max' {
  return effort === 'ultra' ? 'max' : effort
}

// ---------- 底层：单次流式 API 调用（不含重试） ----------

/**
 * callDeepSeekStreamOnce — 单次流式请求，不含重试逻辑
 *
 * emitted 标志：任何 reasoning/text/tool_call chunk 已发出则为 true。
 * 中断时由上层 callDeepSeekStream 决定是否重放。
 */
async function callDeepSeekStreamOnce(
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
  emittedRef: { value: boolean }
): Promise<SingleCallResult> {
  const { onChunk, signal } = handlers

  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`

  // 净化所有消息内容，移除不可见字符防止 API JSON 解析失败
  const sanitizedMessages = messages.map((m) => ({
    ...m,
    content: sanitizeContent(m.content)
  }))

  const body: Record<string, unknown> = {
    model,
    messages: sanitizedMessages,
    stream: true,
    max_tokens: maxTokens,
    stream_options: { include_usage: true }
  }

  // A4 工具 schema 已由 chat-handler.ts 在调用前完成字典序归一化排序，此处直接使用
  if (tools && tools.length > 0) {
    body.tools = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }))
    body.tool_choice = 'auto'
  }

  if (!thinkingMode || reasoningEffort === 'off') {
    body.temperature = temperature
  } else {
    body.enable_thinking = true
    body.reasoning_effort = toApiEffort(reasoningEffort)
  }

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

  // 累积结果
  let content = ''
  let reasoningContent = ''
  const toolCallsAcc = new Map<number, { id: string; name: string; arguments: string }>()
  let normalizedUsage: NormalizedUsage | undefined

  try {
    while (true) {
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

          // 文本内容
          if (delta?.content) {
            content += delta.content
            emittedRef.value = true
            onChunk({ content: delta.content })
          }
          // 思考链
          if (delta?.reasoning_content) {
            reasoningContent += delta.reasoning_content
            emittedRef.value = true
            onChunk({ reasoningContent: delta.reasoning_content })
          }

          // 工具调用增量（流式累积）
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

          // usage — D3 normaliseUsage 双形态归一化
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

          // finish_reason
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
    // 流自然结束（无 finish_reason）
    const tcArray = collectToolCalls(toolCallsAcc)
    if (tcArray.length > 0) {
      return { finishReason: 'tool_calls', content, reasoningContent, toolCalls: tcArray, usage: normalizedUsage, emitted: emittedRef.value }
    }
    return { finishReason: 'stop', content, reasoningContent, toolCalls: [], usage: normalizedUsage, emitted: emittedRef.value }
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      return { finishReason: 'stop', content, reasoningContent, toolCalls: [], usage: normalizedUsage, emitted: emittedRef.value }
    }
    const msg = e instanceof Error ? e.message : String(e)
    return { finishReason: 'error', content, reasoningContent, toolCalls: [], usage: normalizedUsage, error: `流式读取中断：${msg}`, emitted: emittedRef.value }
  }
}

// ---------- 公开接口：带 emitted 标志 + 零输出重放的流式调用 ----------

/**
 * callDeepSeekStream — C1 emitted 标志 + 零输出重放
 *
 * 参考 Reasonix 的 streamWithReconnect：
 * - 维护 emitted 标志：任何 reasoning/text/tool_call chunk 已发出则为 true
 * - 连接断开时：emitted=false → 重放整个请求（≤ MAX_STREAM_RECONNECTS 次）
 * - 连接断开时：emitted=true → 上报错误，不重放（避免重复输出）
 * - 重放便宜是因为 prompt cache 命中
 */
export async function callDeepSeekStream(
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: { role: string; content: string; tool_calls?: unknown; tool_call_id?: string; reasoning_content?: string }[],
  tools: ToolDefinition[] | undefined,
  thinkingMode: boolean,
  reasoningEffort: ReasoningEffort,
  temperature: number,
  maxTokens: number,
  handlers: StreamHandlers
): Promise<SingleCallResult> {
  if (!apiKey) {
    return errorResult('未配置 API Key。')
  }

  for (let attempt = 0; attempt <= MAX_STREAM_RECONNECTS; attempt++) {
    const emittedRef = { value: false }
    const result = await callDeepSeekStreamOnce(
      apiKey, baseUrl, model, messages, tools,
      thinkingMode, reasoningEffort, temperature, maxTokens,
      handlers, emittedRef
    )

    // 成功或非连接错误 → 直接返回
    if (result.finishReason !== 'error') return result
    if (!isConnResetError(result.error)) return result

    // 已有部分输出 → 不重放，避免重复
    if (emittedRef.value) {
      return { ...result, error: `流式传输中断（已有部分输出，不重放）：${result.error}` }
    }

    // 零输出 + 连接断开 → 重放（最后一次也返回错误）
    if (attempt >= MAX_STREAM_RECONNECTS) {
      return { ...result, error: `流式连接断开，已重试 ${MAX_STREAM_RECONNECTS} 次仍失败：${result.error}` }
    }
    // 继续重试
  }

  return errorResult('重试次数已用尽')
}

/** 判断错误是否为连接断开（可重放） */
function isConnResetError(error?: string): boolean {
  if (!error) return false
  const lower = error.toLowerCase()
  return lower.includes('network') ||
    lower.includes('连接') ||
    lower.includes('中断') ||
    lower.includes('reset') ||
    lower.includes('econnreset') ||
    lower.includes('fetch') ||
    lower.includes('aborted')
}

// ---------- 兼容旧接口：无工具调用的简单流式（向后兼容）----------

/**
 * 简单流式聊天（无 Agent Loop / 无工具调用）
 * 保留用于不需要工具的场景
 */
export async function streamChat(
  apiKey: string,
  baseUrl: string,
  request: ChatRequest,
  handlers: StreamHandlers
): Promise<void> {
  const { onChunk, signal } = handlers

  if (!apiKey) {
    onChunk({ done: true, error: '未配置 API Key，请前往设置填写你的 DeepSeek API 密钥。' })
    return
  }

  const result = await callDeepSeekStream(
    apiKey,
    baseUrl,
    request.model,
    request.messages.map((m) => ({ role: m.role, content: m.content })),
    undefined, // 无工具
    request.thinkingMode,
    request.reasoningEffort,
    request.temperature,
    request.maxTokens,
    { onChunk, signal }
  )

  if (result.finishReason === 'error') {
    onChunk({ done: true, error: result.error })
  } else {
    onChunk({ done: true })
  }
}

// ---------- 连接测试 ----------

export async function testConnection(
  apiKey: string,
  baseUrl: string,
  model: string
): Promise<TestResult> {
  if (!apiKey) {
    return { success: false, message: '未填写 API Key' }
  }

  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`
  const start = Date.now()

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
        stream: false
      })
    })

    const latency = Date.now() - start

    if (!response.ok) {
      let errText = ''
      try {
        errText = await response.text()
        const errJson = JSON.parse(errText)
        errText = errJson?.error?.message || errText
      } catch { /* keep raw */ }
      return { success: false, message: `请求失败 (${response.status})：${errText || response.statusText}`, latency }
    }

    const data = await response.json()
    const replyModel = data?.model || model

    return { success: true, message: '连接成功，API Key 有效', latency, model: replyModel }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, message: `网络错误：${msg}。请检查 Base URL 或网络连接。`, latency: Date.now() - start }
  }
}
