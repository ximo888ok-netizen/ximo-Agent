/**
 * 流式元事件处理器 — 监督审查、自动续跑、任务意图分析
 * 从 runStream.ts 提取
 */

import type { StreamChunk, ToolCall, ToolResult, StreamingSegment } from '@shared/types'
import { pushEvent } from './stream-events'

/** 处理监督审查 chunk — 注入审查结果到当前段并持久化纠正消息 */
export function handleSupervisionChunk(
  chunk: NonNullable<StreamChunk['supervision']>,
  collectedToolCalls: ToolCall[],
  collectedToolResults: ToolResult[],
  currentSeg: () => StreamingSegment,
  set: (partial: Record<string, unknown> | ((s: unknown) => Record<string, unknown>)) => void,
  conversationId: string,
  schedule: () => void
): void {
  const sup = chunk
  const verdictLabel: Record<string, string> = { on_track: '✅ 正常', lazy: '⚠️ 偷懒', off_track: '⚠️ 跑偏', violation: '🚫 违规' }
  const formattedResult = [
    `第 ${sup.round} 轮审查：${verdictLabel[sup.verdict] ?? sup.verdict}`, `严重程度：${sup.severity}`,
    ...(sup.issues.length > 0 ? [`问题：\n${sup.issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}`] : []),
    ...(sup.correction ? [`纠正指令：${sup.correction}`] : []),
  ].join('\n')
  const supId = `supervision-${sup.round}`
  collectedToolCalls.push({ id: supId, name: '监督审查', arguments: { round: sup.round, verdict: sup.verdict, severity: sup.severity } })
  collectedToolResults.push({ toolCallId: supId, toolName: '监督审查', content: formattedResult, success: sup.verdict === 'on_track' })
  currentSeg().toolCalls.push({ name: '监督审查', status: 'done' as const, args: JSON.stringify({ round: sup.round, verdict: sup.verdict, severity: sup.severity }), result: formattedResult, toolCallId: supId })
  pushEvent(currentSeg(), { type: 'tool', toolName: '监督审查', toolCallId: supId, args: JSON.stringify({ round: sup.round, verdict: sup.verdict }), result: formattedResult, status: 'done' })
  if (sup.message) {
    const msgId = `supervision-msg-${sup.round}`
    set((s) => {
      const conv = (s as { conversations: Array<{ id: string; messages: Array<{ id: string }> }> }).conversations.find((c) => c.id === conversationId)
      if (conv?.messages.some((m) => m.id === msgId)) return {}
      return {
        conversations: (s as { conversations: Array<{ id: string; messages: Array<{ id: string; role: string; content: string; timestamp: number }> }> }).conversations.map((c) =>
          c.id === conversationId
            ? { ...c, messages: [...c.messages, { id: msgId, role: 'system' as const, content: sup.message!, timestamp: Date.now() }] }
            : c
        ),
      }
    })
  }
  schedule()
}

/** 处理自动续跑 chunk */
export function handleContinuationChunk(
  chunk: NonNullable<StreamChunk['continuation']>,
  collectedToolCalls: ToolCall[],
  collectedToolResults: ToolResult[],
  currentSeg: () => StreamingSegment,
  schedule: () => void
): void {
  const cont = chunk
  const contId = `continuation-${cont.segment}`
  const contMsg = `🔄 自动续跑 ${cont.segment}/${cont.maxSegments}（已完成 ${cont.completedRounds} 轮）`
  collectedToolCalls.push({ id: contId, name: '自动续跑', arguments: { segment: cont.segment, maxSegments: cont.maxSegments, completedRounds: cont.completedRounds } })
  collectedToolResults.push({ toolCallId: contId, toolName: '自动续跑', content: contMsg, success: true })
  currentSeg().toolCalls.push({ name: '自动续跑', status: 'done' as const, args: JSON.stringify({ segment: cont.segment, maxSegments: cont.maxSegments }), result: contMsg, toolCallId: contId })
  pushEvent(currentSeg(), { type: 'tool', toolName: '自动续跑', toolCallId: contId, args: JSON.stringify({ segment: cont.segment, maxSegments: cont.maxSegments }), result: contMsg, status: 'done' })
  schedule()
}

/** 处理任务意图分析 chunk */
export function handleTaskIntentChunk(
  chunk: NonNullable<StreamChunk['taskIntent']>,
  collectedToolCalls: ToolCall[],
  collectedToolResults: ToolResult[],
  currentSeg: () => StreamingSegment,
  schedule: () => void
): void {
  const ti = chunk
  const intentId = 'task-intent-analysis'
  const intentMsg = [
    `**真实意图**：${ti.intent}`,
    ti.successCriteria.length > 0 ? `**验收标准**：\n${ti.successCriteria.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}` : '',
    ti.constraints.length > 0 ? `**约束与风险**：\n${ti.constraints.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}` : '',
    ti.phases.length > 0 ? `**建议阶段**：\n${ti.phases.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}` : '',
  ].filter(Boolean).join('\n')
  collectedToolCalls.push({ id: intentId, name: '任务意图分析', arguments: { intent: ti.intent } })
  collectedToolResults.push({ toolCallId: intentId, toolName: '任务意图分析', content: intentMsg, success: true })
  currentSeg().toolCalls.push({ name: '任务意图分析', status: 'done' as const, args: ti.intent.slice(0, 200), result: intentMsg, toolCallId: intentId })
  pushEvent(currentSeg(), { type: 'tool', toolName: '任务意图分析', toolCallId: intentId, args: ti.intent.slice(0, 200), result: intentMsg, status: 'done' })
  schedule()
}
