import type { ChatMessage } from '@shared/types'

/** 视为「任务产物」的工具 — 这些工具会把内容写到磁盘 */
const ARTIFACT_TOOLS = new Set(['file_write', 'file_edit', 'multi_edit', 'move_file', 'office_docs'])

export interface SessionArtifact {
  path: string
  tool: string
}

/** 工具名 → 产物徽标文案 */
export const ARTIFACT_TOOL_LABELS: Record<string, string> = {
  file_write: '新建',
  file_edit: '修改',
  multi_edit: '批量改',
  move_file: '移动',
  office_docs: '文档',
}

/** 从会话消息里提取本次会话写出的文件（同一路径只保留最后一次） */
export function collectArtifacts(messages: ChatMessage[]): SessionArtifact[] {
  const byPath = new Map<string, string>()
  for (const msg of messages) {
    for (const res of msg.toolResults ?? []) {
      if (!res.success || !ARTIFACT_TOOLS.has(res.toolName)) continue
      const call = msg.toolCalls?.find((c) => c.id === res.toolCallId)
      const args = call?.arguments ?? {}
      const raw = args.path ?? args.file_path ?? args.destination
      if (typeof raw !== 'string' || !raw) continue
      byPath.set(raw, res.toolName)
    }
  }
  return [...byPath].map(([path, tool]) => ({ path, tool }))
}

/** 本次会话内 Agent 实际成功写入记忆的次数（= 短期记忆变更） */
export function countMemoryWrites(messages: ChatMessage[]): number {
  let n = 0
  for (const msg of messages) {
    for (const res of msg.toolResults ?? []) {
      if (res.toolName !== 'memory_update' || !res.success) continue
      const call = msg.toolCalls?.find((c) => c.id === res.toolCallId)
      if (call?.arguments?.action === 'write') n++
    }
  }
  return n
}
