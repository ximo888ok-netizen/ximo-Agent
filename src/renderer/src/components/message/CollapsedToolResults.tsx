import { useState, lazy, Suspense } from 'react'
import { CheckCircle, ChevronDown } from 'lucide-react'
import type { ToolResult } from '@shared/types'

// 懒加载工具结果卡片 — 含 CodeBlock + InlineFileEdit，仅在展开工具结果时才需要
const ToolResultCard = lazy(() => import('../shared/ToolResultCard').then(m => ({ default: m.ToolResultCard })))

/** 工具结果分组 — 收纳 ToolResultCard 列表，默认收起 */
export function CollapsedToolResults({ results }: { results: ToolResult[] }): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const count = results.length
  // 摘要：提取文件名列表
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
        {summary && (
          <span className="text-text-muted/70 truncate">· {summary}</span>
        )}
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
