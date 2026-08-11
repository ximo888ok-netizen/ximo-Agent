/**
 * 工具调用配对完整性校验 — shared 层，主/渲染进程共用
 *
 * 背景：流式工具执行可能被中断（网络抖动/用户取消/工具抛异常），
 * 前端 runStream.ts 的 collectedToolCalls 与 collectedToolResults 独立累积，
 * 中断时两者数量可能不一致。若将不完整的 tool_calls 直接发给 API，
 * DeepSeek 会报 400："An assistant message with 'tool_calls' must be followed
 * by tool messages responding to each 'tool_call_id'"。
 *
 * 用法：buildApiMessages 在把 assistant.tool_calls 写入 API messages 前调用，
 * 不完整时放弃 tool_calls 结构转文本说明，避免孤儿 tool_calls。
 */

/** tool 调用（至少需要 id） */
export interface ToolCallRef {
  id: string
  name?: string
}

/** tool 结果（至少需要 toolCallId） */
export interface ToolResultRef {
  toolCallId: string
  toolName?: string
  content?: string
}

/**
 * 校验 assistant.tool_calls 与 tool 结果是否完整配对。
 * 判定规则：数量相等 且 每个 tool_call_id 都有对应的 tool 结果（允许乱序）。
 */
export function isToolPairComplete(
  toolCalls: ToolCallRef[],
  toolResults: ToolResultRef[] | undefined
): boolean {
  if (!toolResults) return toolCalls.length === 0
  if (toolCalls.length !== toolResults.length) return false
  const resultIds = new Set(toolResults.map((r) => r.toolCallId))
  return toolCalls.every((tc) => resultIds.has(tc.id))
}

/**
 * 生成「工具调用被中断」的说明文本，作为 assistant 消息的 content，
 * 让 LLM 感知到此前工具执行不完整（保留已完成的工具结果摘要）。
 */
export function buildInterruptedToolNote(
  toolCalls: ToolCallRef[],
  toolResults: ToolResultRef[] | undefined
): string {
  const names = [...new Set(toolCalls.map((tc) => tc.name || '工具'))].join(', ')
  const doneNames = toolResults && toolResults.length > 0
    ? [...new Set(toolResults.map((r) => r.toolName || '工具'))].join(', ')
    : '无'
  return `（上一轮工具调用被中断：请求调用 ${names}，但仅完成 ${doneNames}。请基于已完成的部分继续，或询问用户是否需要重试。）`
}
