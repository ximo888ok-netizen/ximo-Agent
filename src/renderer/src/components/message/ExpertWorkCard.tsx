import { useState } from 'react'
import { ChevronDown, Loader2, Bot, CheckCircle2, Wrench, MessageSquare, CircleDot } from 'lucide-react'
import type { StreamChunk } from '@shared/types'

type SubAgentEvent = NonNullable<StreamChunk['subAgentEvent']>

/** 事件 → 图标 */
const STAGE_ICON: Record<SubAgentEvent['stage'], React.ReactNode> = {
  started: <CircleDot size={13} className="text-accent" />,
  tool: <Wrench size={13} className="text-amber-400/80" />,
  toolResult: <CheckCircle2 size={13} className="text-green-500/80" />,
  message: <MessageSquare size={13} className="text-text-muted" />,
  finished: <CheckCircle2 size={13} className="text-green-500" />,
}

/** 事件 → 中文标签 */
const STAGE_LABEL: Record<SubAgentEvent['stage'], string> = {
  started: '开始',
  tool: '工具',
  toolResult: '结果',
  message: '思考',
  finished: '完成',
}

/**
 * ExpertWorkCard — 专家工作过程可视化卡片
 * 渲染单个子 Agent 的工作轨迹：开始 → 工具调用 → 工具结果 → 最终产出
 * 流式期间实时更新，结束后可折叠/展开查看细节
 */
export function ExpertWorkCard({ events }: { events: SubAgentEvent[] }): React.ReactElement | null {
  const [expanded, setExpanded] = useState(false)
  if (events.length === 0) return null

  // 专家身份（取首个事件）
  const first = events[0]
  const expertName = first.expertName
  const taskSummary = first.taskSummary
  const finished = events.some(e => e.stage === 'finished')
  const hasTool = events.some(e => e.stage === 'tool')
  const working = !finished

  // 事件分组展示（tool 与紧随的 toolResult 合并为一行）
  const rows: { stage: SubAgentEvent['stage']; detail?: string; toolArgs?: string; result?: string }[] = []
  for (const e of events) {
    if (e.stage === 'tool') {
      rows.push({ stage: 'tool', detail: e.detail, toolArgs: e.toolArgs })
    } else if (e.stage === 'toolResult') {
      // 合并到上一条 tool 行
      const lastRow = rows[rows.length - 1]
      if (lastRow && lastRow.stage === 'tool') {
        lastRow.result = e.detail
        continue
      }
      rows.push({ stage: 'toolResult', detail: e.detail })
    } else {
      rows.push({ stage: e.stage, detail: e.detail, result: e.result })
    }
  }

  const toolCount = rows.filter(r => r.stage === 'tool').length

  return (
    <div className={`my-2 overflow-hidden rounded-xl border transition-all duration-300 ${
      working ? 'border-accent/30 bg-accent/5 shadow-glow' : 'border-border-subtle bg-bg-surface/40'
    }`}>
      {/* 头部：专家身份 + 状态 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-bg-hover/50"
      >
        <Bot size={14} className={working ? 'text-accent animate-pulse' : 'text-text-muted'} />
        <span className="font-medium text-text-secondary truncate">{expertName}</span>
        {taskSummary && (
          <span className="text-text-muted/70 truncate max-w-[200px]">· {taskSummary}</span>
        )}
        <span className="ml-auto flex items-center gap-1 text-text-muted shrink-0">
          {working ? (
            <>
              <Loader2 size={11} className="animate-spin text-accent" />
              <span className="text-accent">工作中…</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={11} className="text-green-500" />
              <span className="text-green-500">已完成</span>
            </>
          )}
          {hasTool && <span className="text-text-muted/60">· {toolCount} 个工具</span>}
          <ChevronDown size={11} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {/* 工作轨迹 */}
      {expanded && (
        <div className="border-t border-border-subtle/50 px-3 py-2 space-y-1.5">
          {rows.map((row, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 shrink-0">{STAGE_ICON[row.stage]}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-text-secondary">{STAGE_LABEL[row.stage]}</span>
                  {row.detail && <span className="text-text-muted truncate">{row.detail}</span>}
                </div>
                {row.toolArgs && (
                  <div className="mt-0.5 text-[11px] text-text-muted/70 whitespace-pre-wrap break-words">
                    参数：{row.toolArgs}
                  </div>
                )}
                {row.result && row.stage === 'tool' && (
                  <div className="mt-0.5 text-[11px] text-text-muted/70 whitespace-pre-wrap break-words line-clamp-3">
                    {row.result}
                  </div>
                )}
                {row.stage === 'finished' && row.result && (
                  <div className="mt-1 rounded-lg bg-bg-surface/60 px-2 py-1.5 text-[11px] text-text-secondary whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                    {row.result.slice(0, 1000)}
                    {row.result.length > 1000 && '…'}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ExpertWorkCard
