/**
 * 工具权限评估 — 从 tool-execution.ts 提取
 *
 * 审批拒绝持久化：用户拒绝过的操作（工具名+参数摘要）在当前会话内被记住，
 * 后续相同操作不再弹窗，直接拒绝。会话切换时通过 clearRejectedCache 清空。
 */

import type { ChatRequest, ToolCall, ToolResult } from '@shared/types'
import type { MutableMessage } from '@shared/cache'
import { evaluate, extractSubject, getConfigForMode, YOLO_CONFIG, SAFE_CONFIG } from '@main/Permission'
import type { StreamHandlers } from './types'

/** 拒绝缓存 — key 为 "工具名:参数摘要"，在当前会话内持久化 */
const rejectedCache = new Set<string>()

/** 清空拒绝缓存 — 会话切换时调用 */
export function clearRejectedCache(): void {
  rejectedCache.clear()
}

/** 生成工具调用的缓存 key — 工具名 + 参数摘要前 100 字符 */
function makeRejectKey(tc: ToolCall): string {
  const argStr = JSON.stringify(tc.arguments).slice(0, 100)
  return `${tc.name}:${argStr}`
}

/** 权限评估结果：被取消的工具调用 ID 集合 */
export async function checkPermissions(
  toolCalls: ToolCall[],
  request: ChatRequest,
  handlers: StreamHandlers,
  messages: MutableMessage[]
): Promise<Set<string>> {
  const permConfig = handlers.autoModeLevel === 'yolo' || handlers.yoloMode
    ? YOLO_CONFIG
    : handlers.autoModeLevel === 'safe'
      ? SAFE_CONFIG
      : getConfigForMode(request.mode)

  const cancelledIds = new Set<string>()

  for (const tc of toolCalls) {
    const subject = extractSubject(tc.name, tc.arguments)
    const decision = evaluate(permConfig, tc.name, subject)

    if (decision === 'deny') {
      cancelledIds.add(tc.id)
      const deniedResult: ToolResult = {
        toolCallId: tc.id, toolName: tc.name,
        content: '此工具在当前模式下被禁止执行',
        success: false, error: '权限拒绝：该工具在当前模式下不可用'
      }
      handlers.onChunk({ toolResult: deniedResult, toolStatus: 'done', toolName: tc.name })
      messages.push({ role: 'tool', content: 'Error: 权限拒绝：该工具在当前模式下不可用', tool_call_id: tc.id })
    } else if (decision === 'ask') {
      // 审批拒绝持久化 — 检查用户是否已在本次会话中拒绝过相同操作
      const rejectKey = makeRejectKey(tc)
      if (rejectedCache.has(rejectKey)) {
        cancelledIds.add(tc.id)
        const cancelledResult: ToolResult = {
          toolCallId: tc.id, toolName: tc.name,
          content: '用户此前已拒绝此操作（本次会话内不再询问）', success: false, error: '用户拒绝执行（已记住）'
        }
        handlers.onChunk({ toolResult: cancelledResult, toolStatus: 'done', toolName: tc.name })
        messages.push({ role: 'tool', content: 'Error: 用户拒绝执行（已记住）', tool_call_id: tc.id })
        continue
      }

      if (handlers.requestConfirmation) {
        const toolLabel = tc.name.replace(/_/g, ' ')
        const argSummary = Object.entries(tc.arguments)
          .slice(0, 3)
          .map(([k, v]) => `${k}: ${typeof v === 'string' ? v.slice(0, 60) : JSON.stringify(v)?.slice(0, 60)}`)
          .join(', ')
        const confirmed = await handlers.requestConfirmation(tc.name, `工具: ${toolLabel}\n参数: ${argSummary || '(无)'}`)
        if (!confirmed) {
          // 持久化拒绝决策 — 本次会话内不再弹窗
          rejectedCache.add(rejectKey)
          cancelledIds.add(tc.id)
          const cancelledResult: ToolResult = {
            toolCallId: tc.id, toolName: tc.name,
            content: '用户取消了此操作', success: false, error: '用户取消执行'
          }
          handlers.onChunk({ toolResult: cancelledResult, toolStatus: 'done', toolName: tc.name })
          messages.push({ role: 'tool', content: 'Error: 用户取消执行', tool_call_id: tc.id })
        }
      } else {
        cancelledIds.add(tc.id)
        const deniedResult: ToolResult = {
          toolCallId: tc.id, toolName: tc.name,
          content: '无法确认操作：未提供确认回调，出于安全考虑拒绝执行',
          success: false, error: '权限拒绝：requestConfirmation 未注入'
        }
        handlers.onChunk({ toolResult: deniedResult, toolStatus: 'done', toolName: tc.name })
        messages.push({ role: 'tool', content: 'Error: 权限拒绝：requestConfirmation 未注入', tool_call_id: tc.id })
      }
    }
  }

  return cancelledIds
}
