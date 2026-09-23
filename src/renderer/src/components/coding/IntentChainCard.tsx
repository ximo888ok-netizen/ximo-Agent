// ── IntentChainCard — 任务意图分析完整链路卡片 ────────────────────────
// 借鉴 Reasonix 桌面的 PromptShelf/PromptAction 渲染语言：
//   - 头部：标题 + tone 徽章（长任务/已完成）+ meta 摘要行
//   - 主体：目标高亮块 + 编号键徽章步骤行（验收标准/约束/执行阶段）
//   - 执行阶段联动 todo_write 进度（✅ 完成 / 🔵 进行中 / ⚪ 待开始）
// 消息流（ToolCard）与右侧任务页（TaskIntentSection）共用。

import { useState } from 'react'
import { ChevronDown, Target, CheckCircle2, AlertTriangle, ListOrdered } from 'lucide-react'

export interface IntentChainMeta {
  intent?: string
  successCriteria?: string[]
  constraints?: string[]
  phases?: string[]
}

/** 执行阶段进度（与 phases 数组一一对应） */
export interface PhaseProgress {
  done: boolean
  running: boolean
}

/** 从 todo 列表推导阶段进度 — level 0 阶段按顺序匹配意图分析的 phases */
export function derivePhaseProgress(phases: string[], todos: Array<{ level?: number; status: string; content: string }>): PhaseProgress[] {
  const phaseTodos = todos.filter((t) => t.level === 0)
  return phases.map((_, i) => {
    const todo = phaseTodos[i]
    if (!todo) return { done: false, running: false }
    return {
      done: todo.status === 'completed',
      running: todo.status === 'in_progress',
    }
  })
}

const stripPhasePrefix = (p: string): string => p.replace(/^阶段\s*\d+\s*[:：]\s*/, '')

export function IntentChainCard({
  meta,
  phasesProgress,
  compact = false,
  step,
}: {
  meta: IntentChainMeta
  phasesProgress?: PhaseProgress[]
  compact?: boolean
  /** 消息流内的时间线步骤号 */
  step?: number
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  const { intent = '', successCriteria = [], constraints = [], phases = [] } = meta

  const allDone = phasesProgress && phasesProgress.length > 0 && phasesProgress.every((p) => p.done)
  const anyRunning = phasesProgress?.some((p) => p.running) ?? false

  return (
    <div className={`intent-chain${open ? ' intent-chain--open' : ''}${compact ? ' intent-chain--compact' : ''}`}>
      {/* 头部 — Reasonix PromptShelf 风格：标题 + 徽章 + meta */}
      <button
        type="button"
        className="intent-chain__head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {step !== undefined && <span className="turn-step">{step}</span>}
        <Target size={13} className="intent-chain__icon" />
        <span className="intent-chain__title">任务意图分析</span>
        <span className="intent-chain__badge intent-chain__badge--amber">长任务</span>
        {allDone && <span className="intent-chain__badge intent-chain__badge--green">已完成</span>}
        {anyRunning && <span className="intent-chain__badge intent-chain__badge--accent">进行中</span>}
        {!open && intent && <span className="intent-chain__meta">{intent}</span>}
        <ChevronDown size={13} className={`intent-chain__chevron${open ? ' intent-chain__chevron--open' : ''}`} />
      </button>

      {open && (
        <div className="intent-chain__body">
          {/* 真实意图 — 计划标题高亮块 */}
          {intent && (
            <div className="intent-chain__goal">
              <p className="intent-chain__goal-label">真实意图</p>
              <p className="intent-chain__goal-text">{intent}</p>
            </div>
          )}

          {/* 验收标准 — 编号键徽章步骤行 */}
          {successCriteria.length > 0 && (
            <div className="intent-chain__group">
              <p className="intent-chain__group-title">
                <CheckCircle2 size={11} className="intent-chain__group-icon intent-chain__group-icon--green" />
                验收标准
              </p>
              {successCriteria.map((c, i) => (
                <div key={i} className="intent-chain__row">
                  <span className="intent-chain__key">{i + 1}</span>
                  <span className="intent-chain__text">{c}</span>
                </div>
              ))}
            </div>
          )}

          {/* 约束与风险 */}
          {constraints.length > 0 && (
            <div className="intent-chain__group">
              <p className="intent-chain__group-title">
                <AlertTriangle size={11} className="intent-chain__group-icon intent-chain__group-icon--warn" />
                约束与风险
              </p>
              {constraints.map((c, i) => (
                <div key={i} className="intent-chain__row">
                  <span className="intent-chain__key">{i + 1}</span>
                  <span className="intent-chain__text">{c}</span>
                </div>
              ))}
            </div>
          )}

          {/* 执行阶段 — 带进度状态点（联动 todo_write） */}
          {phases.length > 0 && (
            <div className="intent-chain__group">
              <p className="intent-chain__group-title">
                <ListOrdered size={11} className="intent-chain__group-icon intent-chain__group-icon--accent" />
                执行阶段
              </p>
              {phases.map((p, i) => {
                const prog = phasesProgress?.[i]
                const state = prog?.done ? 'done' : prog?.running ? 'running' : 'pending'
                return (
                  <div key={i} className="intent-chain__row">
                    <span className="intent-chain__key">{i + 1}</span>
                    <span className={`intent-chain__phase-dot intent-chain__phase-dot--${state}`} aria-hidden="true" />
                    <span className={`intent-chain__text${state === 'done' ? ' intent-chain__text--done' : ''}`}>
                      {stripPhasePrefix(p)}
                    </span>
                    <span className={`intent-chain__phase-state intent-chain__phase-state--${state}`}>
                      {state === 'done' ? '完成' : state === 'running' ? '进行中' : '待开始'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
