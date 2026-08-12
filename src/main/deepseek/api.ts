import type { ChatRequest, ToolDefinition, ReasoningEffort } from '@shared/types'
import { errorResult } from './context'
import type { StreamHandlers, SingleCallResult } from './types'
import type { ProviderCapabilities } from './provider'
import { callDeepSeekStreamOnce } from './api-stream-once'

// re-export — 保持 index.ts 和 sub-agent.ts 的导入路径不变
export { toApiEffort } from './api-request-builder'
export { testConnection } from './api-test'

// ---------- 常量 ----------

/** 流式连接断开最大重试次数 — 重放便宜是因为 prompt cache 命中 */
const MAX_STREAM_RECONNECTS = 3

// ---------- 公开接口：带 emitted 标志 + 零输出重放的流式调用 ----------

/**
 * callDeepSeekStream — C1 emitted 标志 + 零输出重放
 *
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
  handlers: StreamHandlers,
  caps?: ProviderCapabilities
): Promise<SingleCallResult> {
  if (!apiKey) {
    return errorResult('未配置 API Key。')
  }

  for (let attempt = 0; attempt <= MAX_STREAM_RECONNECTS; attempt++) {
    const emittedRef = { value: false }
    const result = await callDeepSeekStreamOnce(
      apiKey, baseUrl, model, messages, tools,
      thinkingMode, reasoningEffort, temperature, maxTokens,
      handlers, emittedRef, caps
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
  handlers: StreamHandlers,
  caps?: ProviderCapabilities
): Promise<void> {
  const { onChunk, signal } = handlers

  if (!apiKey) {
    onChunk({ done: true, error: '未配置 API Key，请在设置中填写你的 API 密钥。' })
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
    { onChunk, signal },
    caps
  )

  if (result.finishReason === 'error') {
    onChunk({ done: true, error: result.error })
  } else {
    onChunk({ done: true })
  }
}
