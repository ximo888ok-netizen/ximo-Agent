import { useState, useMemo } from 'react'
import { AlertTriangle, ChevronDown } from 'lucide-react'
import type { ToolResult } from '@shared/types'

/** 工具错误分组 — 将失败的工具结果收纳为可折叠区块，去重避免刷屏 */
export function CollapsedToolErrors({ results }: { results: ToolResult[] }): React.ReactElement {
  const [expanded, setExpanded] = useState(false)

  // 按错误内容去重，统计每个错误出现的次数
  const deduped = useMemo(() => {
    const map = new Map<string, { error: string; toolName: string; count: number }>()
    for (const r of results) {
      const key = r.error || r.content || ''
      const existing = map.get(key)
      if (existing) {
        existing.count++
      } else {
        map.set(key, { error: key, toolName: r.toolName, count: 1 })
      }
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
        {uniqueErrors < totalErrors && (
          <span className="text-red-400/50">（{uniqueErrors} 种）</span>
        )}
        <span className="ml-auto flex items-center gap-1 text-red-400/50 shrink-0">
          <ChevronDown size={11} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {expanded && (
        <div className="border-t border-red-500/10 px-2 py-1.5 space-y-1">
          {deduped.map((err, i) => (
            <div key={i} className="rounded-lg bg-red-500/5 px-2.5 py-1.5 text-xs text-red-400">
              {err.count > 1 && (
                <span className="text-red-400/50 mr-1">[{err.count}×]</span>
              )}
              {err.error}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
