import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react'
import { CheckCircle, ChevronDown, Loader2, AlertTriangle } from 'lucide-react'
import type { ToolResult } from '@shared/types'
import { TOOL_LABELS } from './message-constants'
import { ToolCallCard } from './ToolCallCard'

// 懒加载工具结果卡片 — 含 CodeBlock + InlineFileEdit，仅在展开工具结果时才需要
const ToolResultCard = lazy(() => import('./shared/ToolResultCard').then(m => ({ default: m.ToolResultCard })))

/** 工具调用分组 — 将多个 ToolCallCard 收纳为一个可折叠区块 */
export function ToolCallGroup({ calls }: { calls: { name: string; status: string; args?: string; result?: string }[] }): React.ReactElement {
  const callingCount = calls.filter(c => c.status === 'calling').length
  const doneCount = calls.filter(c => c.status === 'done').length
  const thinkingCount = calls.filter(c => c.status === 'thinking').length
  const total = calls.length
  const allDone = doneCount === total && callingCount === 0 && thinkingCount === 0

  const [expanded, setExpanded] = useState(callingCount > 0)
  const userOverridden = useRef(false)
  const prevActive = useRef(callingCount > 0 || thinkingCount > 0)

  useEffect(() => {
    const wasActive = prevActive.current
    const nowActive = callingCount > 0 || thinkingCount > 0
    prevActive.current = nowActive
    if (nowActive && !wasActive) userOverridden.current = false
    if (nowActive) { if (!userOverridden.current) setExpanded(true) }
    else if (allDone && !userOverridden.current) setExpanded(false)
  }, [callingCount, thinkingCount, allDone])

  const lastCall = calls[calls.length - 1]
  const lastLabel = TOOL_LABELS[lastCall?.name] || lastCall?.name || ''

  let statusText: string
  if (callingCount > 0) statusText = '执行中…'
  else if (thinkingCount > 0) statusText = '思考中…'
  else statusText = `${doneCount}/${total} 完成`

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-surface/40 overflow-hidden">
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
        {lastLabel && <span className="text-text-muted/70 truncate">· {lastLabel}</span>}
        <span className="ml-auto flex items-center gap-1 text-text-muted shrink-0">
          {statusText}
          <ChevronDown size={11} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border-subtle/50 px-2 py-1.5 space-y-1.5">
          {calls.map((tc, i) => <ToolCallCard key={`${tc.name}-${i}`} tc={tc} />)}
        </div>
      )}
    </div>
  )
}

/** 工具结果分组 — 收纳 ToolResultCard 列表，默认收起 */
export function CollapsedToolResults({ results }: { results: ToolResult[] }): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const count = results.length
  const fileNames = results
    .map(r => (r.metadata?.fileName as string) || (r.metadata?.filePath as string)?.split(/[/\\]/).pop() || r.toolName)
    .filter(Boolean)
  const summary = fileNames.slice(0, 2).join(', ') + (fileNames.length > 2 ? ` 等${fileNames.length}项` : '')

  return (
    <div className="mt-2 rounded-xl border border-border-subtle bg-bg-surface/40 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs transition-colors hover:bg-bg-hover/50"
      >
        <CheckCircle size={13} className="text-green-500/70 shrink-0" />
        <span className="text-text-secondary shrink-0">工具结果</span>
        <span className="text-text-muted">{count}</span>
        {summary && <span className="text-text-muted/70 truncate">· {summary}</span>}
        <span className="ml-auto flex items-center gap-1 text-text-muted shrink-0">
          <ChevronDown size={11} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border-subtle/50 px-2 py-1.5 space-y-1">
          {results.map((result, i) => (
            <Suspense key={`${result.toolCallId}-${i}`} fallback={null}>
              <ToolResultCard result={result} />
            </Suspense>
          ))}
        </div>
      )}
    </div>
  )
}

/** 工具错误分组 — 将失败的工具结果收纳为可折叠区块，去重避免刷屏 */
export function CollapsedToolErrors({ results }: { results: ToolResult[] }): React.ReactElement {
  const [expanded, setExpanded] = useState(false)

  const deduped = useMemo(() => {
    const map = new Map<string, { error: string; toolName: string; count: number }>()
    for (const r of results) {
      const key = r.error || r.content || ''
      const existing = map.get(key)
      if (existing) existing.count++
      else map.set(key, { error: key, toolName: r.toolName, count: 1 })
    }
    return Array.from(map.values())
  }, [results])

  const totalErrors = results.length
  const uniqueErrors = deduped.length

  return (
    <div className="mt-2 rounded-xl border border-red-500/20 bg-red-500/5 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs transition-colors hover:bg-red-500/8"
      >
        <AlertTriangle size={13} className="text-red-400/70 shrink-0" />
        <span className="text-red-400 shrink-0">工具错误</span>
        <span className="text-red-400/60">{totalErrors}</span>
        {uniqueErrors < totalErrors && <span className="text-red-400/50">（{uniqueErrors} 种）</span>}
        <span className="ml-auto flex items-center gap-1 text-red-400/50 shrink-0">
          <ChevronDown size={11} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {expanded && (
        <div className="border-t border-red-500/10 px-2 py-1.5 space-y-1">
          {deduped.map((err, i) => (
            <div key={i} className="rounded-lg bg-red-500/5 px-2.5 py-1.5 text-xs text-red-400">
              {err.count > 1 && <span className="text-red-400/50 mr-1">[{err.count}×]</span>}
              {err.error}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
