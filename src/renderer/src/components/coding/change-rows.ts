import type { ChatMessage } from '@shared/types'

/** 变更摘要行 */
export interface ChangeRow {
  fileName: string
  changeDesc: string
  additions: number
  deletions: number
}

/** 从工具结果中提取文件变更列表 */
export function extractChangeRows(messages: ChatMessage[]): ChangeRow[] {
  const rows: ChangeRow[] = []
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.toolResults) {
      for (const result of msg.toolResults) {
        if (result.toolName === 'file_edit' || result.toolName === 'file_write' || result.toolName === 'multi_edit' || result.toolName === 'move_file') {
          const meta = result.metadata || {}
          const fileName = (meta.fileName as string) || (meta.filePath as string)?.split(/[/\\]/).pop() || ''
          if (fileName) {
            const additions = (meta.additions as number) ?? 0
            const deletions = (meta.deletions as number) ?? 0
            rows.push({
              fileName,
              changeDesc: result.content.slice(0, 80).replace(/\n/g, ' '),
              additions,
              deletions
            })
          }
        }
      }
    }
  }
  return rows
}
