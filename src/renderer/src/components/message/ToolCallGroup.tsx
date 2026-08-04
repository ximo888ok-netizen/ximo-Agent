import { useState, useEffect, useRef } from 'react'
import { CheckCircle, ChevronDown, Loader2 } from 'lucide-react'
import { TOOL_LABELS } from '../message-constants'
import { ToolCallCard } from './ToolCallCard'

/** 工具调用分组 — 将多个 ToolCallCard 收纳为一个可折叠区块 */
export function ToolCallGroup({ calls }: { calls: { name: string; status: string; args?: string; result?: string }[] }): React.ReactElement {
  const callingCount = calls.filter(c => c.status === 'calling').length
  const doneCount = calls.filter(c => c.status === 'done').length
  const thinkingCount = calls.filter(c => c.status === 'thinking').length
  const total = calls.length
  const allDone = doneCount === total && callingCount === 0 && thinkingCount === 0

  // 正在调用时默认展开，完成后自动折叠 — 跟踪用户手动操作以避免覆盖
  const [expanded, setExpanded] = useState(callingCount > 0)
  const userOverridden = useRef(false)
  const prevActive = useRef(callingCount > 0 || thinkingCount > 0)

  useEffect(() => {
    const wasActive = prevActive.current
    const nowActive = callingCount > 0 || thinkingCount > 0
    prevActive.current = nowActive

    if (nowActive && !wasActive) userOverridden.current = false

    if (nowActive) {
      if (!userOverridden.current) setExpanded(true)
    } else if (allDone && !userOverridden.current) {
      setExpanded(false)
    }
  }, [callingCount, thinkingCount, allDone])

  // 摘要：最近一次工具名
  const lastCall = calls[calls.length - 1]
  const lastLabel = TOOL_LABELS[lastCall?.name] || lastCall?.name || ''

  // 摘要状态文本
  let statusText: string
  if (callingCount > 0) {
    statusText = `执行中…`
  } else if (thinkingCount > 0) {
    statusText = `思考中…`
  } else {
    statusText = `${doneCount}/${total} 完成`
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-surface/40 overflow-hidden">
      {/* 摘要栏 */}
      <button
        onClick={() => { userOverridden.current = true; setExpanded(!expanded) }}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs transition-colors hover:bg-bg-hover/50"
      >
        {callingCount > 0 || thinkingCount > 0 ? (
          <Loader2 size={13} className="animate-spin text-accent shrink-0" />
        ) : (
          <CheckCircle size={13} className="text-green-500/70 shrink-0" />
        )}
        <span className="text-text-secondary shrink-0">工具调用</span>
        <span className="text-text-muted">{total}</span>
        {lastLabel && (
          <span className="text-text-muted/70 truncate">· {lastLabel}</span>
        )}
        <span className="ml-auto flex items-center gap-1 text-text-muted shrink-0">
          {statusText}
          <ChevronDown size={11} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {/* 展开后的详细列表 */}
      {expanded && (
        <div className="border-t border-border-subtle/50 px-2 py-1.5 space-y-1.5">
          {calls.map((tc, i) => (
            <ToolCallCard key={`${tc.name}-${i}`} tc={tc} />
          ))}
        </div>
      )}
    </div>
  )
}
