// ── SubAgentSections — 右侧任务标签页下方的结构化区块 ─────────────────
// 1) 子 Agent 调用链：主 Agent → 子 Agent → 孙 Agent 嵌套卡片（默认折叠）
// 2) 任务意图分析：完整链路（意图/验收/约束/阶段，默认折叠可展开）

import { useMemo, useState } from 'react'
import {
  ChevronDown, Users, Bot, Loader2, CheckCircle2, Wrench,
} from 'lucide-react'
import type { ChatMessage } from '@shared/types'
import { useStore, type AgentTodo } from '@renderer/store/useStore'
import {
  collectSubAgentEvents, buildExpertTree, countExpertNodes,
  type ExpertNode,
} from '@renderer/lib/expertTree'
import { IntentChainCard, derivePhaseProgress } from './IntentChainCard'

const EMPTY_TODOS: AgentTodo[] = []

// ── 子 Agent 调用链 ────────────────────────────────────────────────────

/** 子 Agent 调用链区块 — 默认折叠，展开显示嵌套树形卡片 */
export function SubAgentTreeSection({ messages }: { messages: ChatMessage[] }): React.ReactElement | null {
  const [open, setOpen] = useState(false)
  const roots = useMemo(() => buildExpertTree(collectSubAgentEvents(messages)), [messages])
  if (roots.length === 0) return null
  const total = countExpertNodes(roots)
  const anyWorking = roots.some((r) => !r.finished) || containsWorking(roots)

  return (
    <section className="mt-3 overflow-hidden rounded-xl border border-border-subtle bg-bg-surface/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-bg-hover/50"
      >
        <Users size={13} className="shrink-0 text-accent" />
        <span className="text-xs font-medium text-text-secondary">子 Agent 调用链</span>
        <span className="rounded-full bg-bg-hover px-1.5 py-0.5 text-[10px] text-text-muted">{total} 个</span>
        {anyWorking && <Loader2 size={11} className="shrink-0 animate-spin text-accent" />}
        <span className="ml-auto shrink-0 text-text-muted">
          <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border-subtle/50 px-3 py-2.5">
          {roots.map((node) => (
            <ExpertNodeCard key={node.expertId} node={node} depth={0} />
          ))}
        </div>
      )}
    </section>
  )
}

function containsWorking(nodes: ExpertNode[]): boolean {
  return nodes.some((n) => !n.finished || containsWorking(n.children))
}

/** 单个子 Agent 节点卡片（递归渲染嵌套孙 Agent） */
function ExpertNodeCard({ node, depth }: { node: ExpertNode; depth: number }): React.ReactElement {
  const [open, setOpen] = useState(false)
  const toolCount = node.events.filter((e) => e.stage === 'tool').length
  const finishedEvent = node.events.find((e) => e.stage === 'finished')
  const hasChildren = node.children.length > 0
  const working = !node.finished

  // 工具轨迹（tool + toolResult 合并行）
  const rows: { name: string; args?: string; result?: string }[] = []
  for (const e of node.events) {
    if (e.stage === 'tool') {
      rows.push({ name: e.detail ?? '', args: e.toolArgs })
    } else if (e.stage === 'toolResult') {
      const last = rows[rows.length - 1]
      if (last && !last.result) last.result = e.detail
    }
  }

  return (
    <div className={depth > 0 ? 'ml-2.5 border-l border-border-subtle/60 pl-2' : ''}>
      <div className={`overflow-hidden rounded-lg border ${working ? 'border-accent/30 bg-accent/5' : 'border-border-subtle bg-bg-elevated/60'}`}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left transition-colors hover:bg-bg-hover/50"
        >
          <span className="shrink-0">
            {working ? <Loader2 size={11} className="animate-spin text-accent" /> : <Bot size={11} className="text-text-muted" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-[11px] font-medium ${working ? 'text-accent' : 'text-text-primary'}`}>{node.name}</span>
            {node.taskSummary && (
              <span className="block truncate text-[10px] text-text-muted">{node.taskSummary}</span>
            )}
          </span>
          <span className="shrink-0 text-[10px] text-text-muted">
            {working ? '工作中' : finishedEvent ? '已完成' : '未完成'}
            {toolCount > 0 && ` · ${toolCount} 工具`}
            {hasChildren && ` · ${node.children.length} 嵌套`}
          </span>
          <ChevronDown size={10} className={`shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="space-y-1.5 border-t border-border-subtle/50 px-2 py-1.5">
            {/* 嵌套孙 Agent */}
            {hasChildren && (
              <div className="space-y-1.5">
                {node.children.map((c) => (
                  <ExpertNodeCard key={c.expertId} node={c} depth={depth + 1} />
                ))}
              </div>
            )}
            {/* 工具轨迹 */}
            {rows.length > 0 && (
              <div className="space-y-1 pt-1">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[10px]">
                    <Wrench size={9} className="mt-0.5 shrink-0 text-amber-400/80" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-text-secondary">{r.name || '工具调用'}</p>
                      {r.args && <p className="truncate text-text-muted/60">{r.args}</p>}
                      {r.result && <p className="line-clamp-2 break-words text-text-muted">{r.result}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* 最终结果 */}
            {finishedEvent?.result && (
              <div className="rounded-lg bg-bg-surface/60 px-2 py-1.5 text-[10px] leading-relaxed text-text-secondary">
                <p className="mb-0.5 flex items-center gap-1 text-green-500">
                  <CheckCircle2 size={9} /> 最终结果
                </p>
                <p className="line-clamp-4 break-words whitespace-pre-wrap">{finishedEvent.result.slice(0, 600)}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 任务意图分析完整链路 ────────────────────────────────────────────────

interface IntentMeta {
  intent?: string
  successCriteria?: string[]
  constraints?: string[]
  phases?: string[]
}

/** 任务意图分析区块 — 默认折叠的完整链路（Reasonix PromptShelf 风格） */
export function TaskIntentSection({ messages }: { messages: ChatMessage[] }): React.ReactElement | null {
  const todos = useStore((s) => s.agentTodosByConv[s.currentConversationId ?? ''] ?? EMPTY_TODOS)
  const meta = useMemo<IntentMeta | null>(() => {
    for (const msg of messages) {
      if (msg.role !== 'assistant' || !msg.toolResults) continue
      for (const tr of msg.toolResults) {
        const m = tr.metadata as IntentMeta | undefined
        if (m?.intent) return m
      }
    }
    return null
  }, [messages])

  const phasesProgress = useMemo(
    () => derivePhaseProgress(meta?.phases ?? [], todos),
    [meta, todos],
  )

  if (!meta) return null
  return <IntentChainCard meta={meta} phasesProgress={phasesProgress} />
}
