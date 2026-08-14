import type { ToolDefinition, ReasoningEffort } from '@shared/types'
import { sanitizeContent } from './context'
import type { ProviderCapabilities } from './provider'

/**
 * 将应用层 ReasoningEffort 映射为 DeepSeek API 支持的 reasoning_effort 值。
 * 'ultra' 是应用层自定义等级（工程范式 + 监督审查），API 层等价于 'max'。
 */
export function toApiEffort(effort: ReasoningEffort): 'off' | 'high' | 'max' {
  return effort === 'ultra' ? 'max' : effort
}

/**
 * 构建 /chat/completions 请求体。
 *
 * 能力门控：caps 缺省或全开时，输出与内置 DeepSeek 历史行为逐字段一致；
 * 自定义服务商可通过开关裁剪 DeepSeek 专属参数：
 * - sendReasoningParams=false → 不写 enable_thinking/reasoning_effort，并剥离消息中的 reasoning_content
 * - sendStreamUsage=false     → 不写 stream_options.include_usage
 */
export function buildRequestBody(
  model: string,
  messages: { role: string; content: string; tool_calls?: unknown; tool_call_id?: string; reasoning_content?: string }[],
  tools: ToolDefinition[] | undefined,
  thinkingMode: boolean,
  reasoningEffort: ReasoningEffort,
  temperature: number,
  maxTokens: number,
  caps?: ProviderCapabilities
): Record<string, unknown> {
  const sendReasoning = caps?.sendReasoningParams !== false
  const sendUsage = caps?.sendStreamUsage !== false

  // 净化所有消息内容，移除不可见字符防止 API JSON 解析失败
  // 非 reasoning 服务商额外剥离 reasoning_content（防第三方 API 拒绝未知字段）
  const sanitizedMessages = messages.map((m) => {
    const clean: Record<string, unknown> = { ...m, content: sanitizeContent(m.content) }
    if (!sendReasoning) delete clean.reasoning_content
    return clean
  })

  // maxTokens 安全防护 — 防止过大值导致 API 拒绝
  // DeepSeek-V4 支持最大 393216 输出 token，自定义服务商通常上限 8192
  // 此处统一钳制到合理范围内，具体上限由 provider.maxOutputTokens 控制
  const safeMaxTokens = Math.max(1, Math.min(maxTokens, 393216))

  const body: Record<string, unknown> = {
    model,
    messages: sanitizedMessages,
    stream: true,
    max_tokens: safeMaxTokens
  }

  if (sendUsage) {
    body.stream_options = { include_usage: true }
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

  if (!thinkingMode || reasoningEffort === 'off' || !sendReasoning) {
    body.temperature = temperature
  } else {
    body.enable_thinking = true
    body.reasoning_effort = toApiEffort(reasoningEffort)
  }

  return body
}
