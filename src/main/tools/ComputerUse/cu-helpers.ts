import type { ToolResult } from '@shared/types'

/** 构造错误返回值 */
export function error(id: string, msg: string): ToolResult {
  return { toolCallId: id, toolName: 'computer_use', content: '', success: false, error: msg }
}
