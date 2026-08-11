/**
 * Tool Result 保留优先级 — 智能裁剪策略
 *
 * 按 toolName 将工具结果分为三档：
 *   HIGH   — 代码变更记录（file_write/file_edit），永久保留，snip/prune 阶段不裁剪
 *   MEDIUM — 构建/测试/lint 结果（terminal_exec/dependency_check 等），延迟裁剪
 *   LOW    — 可重新获取的结果（file_read/web_search/list_dir 等），优先裁剪
 *
 * 被 context-manager.ts（动态 snip）和 context-compress.ts（静态 trim）共用，
 * 确保两端裁剪策略一致。
 */

/** 工具结果保留优先级 */
export type ToolRetention = 'high' | 'medium' | 'low'

/** HIGH：代码变更 — 保留完整内容，snip/prune 阶段跳过 */
const HIGH_VALUE_TOOLS = new Set([
  'file_write', 'file_edit', 'file_create', 'file_delete', 'move_file'
])

/** MEDIUM：构建/测试/lint 结果 — snip 阶段跳过，prune 阶段裁剪 */
const MEDIUM_VALUE_TOOLS = new Set([
  'terminal_exec', 'dependency_check', 'code_lint', 'code_format',
  'code_review', 'git_operation'
])

/** 获取工具的保留优先级（未知工具默认 LOW） */
export function getToolRetention(toolName: string | null | undefined): ToolRetention {
  if (!toolName) return 'low'
  if (HIGH_VALUE_TOOLS.has(toolName)) return 'high'
  if (MEDIUM_VALUE_TOOLS.has(toolName)) return 'medium'
  return 'low'
}

/**
 * 从 tool 消息向前扫描，找到对应的 assistant tool_calls 中的工具名。
 *
 * 消息结构：assistant(tool_calls) → tool(tool_call_id)
 * 通过 tool_call_id 匹配，可靠且不依赖内容格式推断。
 */
export function findToolName(
  messages: { role: string; tool_calls?: unknown; tool_call_id?: string }[],
  toolIdx: number
): string | null {
  const toolCallId = messages[toolIdx]?.tool_call_id
  if (!toolCallId) return null

  for (let i = toolIdx - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'assistant' || !m.tool_calls) continue
    const calls = m.tool_calls as Array<{ id?: string; function?: { name?: string } }>
    const match = calls.find((tc) => tc.id === toolCallId)
    if (match?.function?.name) return match.function.name
  }
  return null
}
