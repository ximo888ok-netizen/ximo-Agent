// ── expertTree — 子 Agent 嵌套调用树构建 ──────────────────────────────
// 从会话消息中提取子 Agent 工作事件（segments.expertEvents + toolResults.metadata.expertEvents），
// 按时间线用栈算法还原「主 Agent → 子 Agent → 孙 Agent」的嵌套调用链。

import type { ChatMessage, StreamChunk } from '@shared/types'

export type SubAgentEvent = NonNullable<StreamChunk['subAgentEvent']>

export interface ExpertNode {
  expertId: string
  name: string
  taskSummary: string
  /** 该专家的事件序列（started → tool/toolResult → finished） */
  events: SubAgentEvent[]
  children: ExpertNode[]
  finished: boolean
}

const eventKey = (e: SubAgentEvent): string =>
  `${e.expertId}|${e.stage}|${e.detail}|${e.taskSummary}`

/** 从会话消息收集全部子 Agent 事件（跨消息/跨来源，去重保持时间顺序） */
export function collectSubAgentEvents(messages: ChatMessage[]): SubAgentEvent[] {
  const seen = new Set<string>()
  const out: SubAgentEvent[] = []
  const push = (e: SubAgentEvent): void => {
    const k = eventKey(e)
    if (seen.has(k)) return
    seen.add(k)
    out.push(e)
  }
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue
    // 流式/持久化分段中的事件（主通道收集，含嵌套孙 Agent）
    if (msg.segments) {
      for (const seg of msg.segments) {
        if (seg.expertEvents) for (const e of seg.expertEvents) push(e)
      }
    }
    // agent_expert 工具结果 metadata 中的事件（子 Agent 完整轨迹）
    if (msg.toolResults) {
      for (const tr of msg.toolResults) {
        const meta = tr.metadata as { expertEvents?: SubAgentEvent[] } | undefined
        if (meta?.expertEvents) for (const e of meta.expertEvents) push(e)
      }
    }
  }
  return out
}

/**
 * 按时间线构建嵌套树（栈算法）：
 * - 新 expert 的 started 事件 → 挂为当前栈顶（最近启动且未完成）专家的子节点
 * - finished → 从栈中移除（容错：允许移除栈中任意位置，兼容并行交叉）
 * - 主 Agent 按"一个专家完成后再调度下一个"的工作流 → 顺序调度场景层级准确
 */
export function buildExpertTree(events: SubAgentEvent[]): ExpertNode[] {
  const roots: ExpertNode[] = []
  const stack: ExpertNode[] = []
  const nodes = new Map<string, ExpertNode>()

  for (const ev of events) {
    let node = nodes.get(ev.expertId)
    if (ev.stage === 'started' && !node) {
      node = {
        expertId: ev.expertId,
        name: ev.expertName || ev.expertId,
        taskSummary: ev.taskSummary ?? '',
        events: [],
        children: [],
        finished: false,
      }
      nodes.set(ev.expertId, node)
      const parent = stack.length > 0 ? stack[stack.length - 1] : null
      if (parent) parent.children.push(node)
      else roots.push(node)
      stack.push(node)
    }
    if (!node) continue
    node.events.push(ev)
    if (ev.stage === 'finished') {
      node.finished = true
      const idx = stack.findIndex((n) => n.expertId === ev.expertId)
      if (idx >= 0) stack.splice(idx, 1)
    }
  }
  return roots
}

/** 统计树内节点数（含嵌套） */
export function countExpertNodes(roots: ExpertNode[]): number {
  let n = 0
  const walk = (nodes: ExpertNode[]): void => {
    for (const node of nodes) {
      n++
      walk(node.children)
    }
  }
  walk(roots)
  return n
}
