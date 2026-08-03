import { useState } from 'react'
import { ChevronDown, Cpu, Loader2 } from 'lucide-react'
import { TOOL_ICONS, TOOL_LABELS } from './message-constants'

/** 单个工具调用卡片（展开后列表中使用） */
export function ToolCallCard({ tc }: { tc: { name: string; status: string; args?: string; result?: string } }): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const [resultExpanded, setResultExpanded] = useState(false)
  const isDone = tc.status === 'done'
  const isCalling = tc.status === 'calling'

  let queryLabel = ''
  if (tc.args) {
    try {
      const parsed = JSON.parse(tc.args)
      queryLabel = parsed.query || parsed.question || parsed.url || ''
    } catch { /* ignore */ }
  }

  return (
    <div>
      <div
        className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs cursor-pointer transition-all duration-200 ${
          isDone ? 'border-green-500/30 bg-green-500/10 text-green-400'
            : isCalling ? 'border-accent/30 bg-accent/10 text-accent halo-pulse'
              : 'border-border-subtle bg-bg-surface/60 text-text-muted'
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        {isCalling ? (
          <Loader2 size={13} className="animate-spin text-accent" />
        ) : (
          <span className="text-text-muted">{TOOL_ICONS[tc.name] || <Cpu size={14} />}</span>
        )}
        <span>{TOOL_LABELS[tc.name] || tc.name}</span>
        {queryLabel && (
          <span className="text-text-muted truncate max-w-[120px]">"{queryLabel}"</span>
        )}
        <span className="ml-auto flex items-center gap-1 text-text-muted">
          {isCalling ? '执行中…' : isDone ? '✓ 完成' : '思考中…'}
          {(tc.args || tc.result) && (
            <ChevronDown size={11} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          )}
        </span>
      </div>
      {expanded && (tc.args || tc.result) && (
        <div className="mt-1 rounded-xl border border-border-subtle bg-bg-surface/40 backdrop-blur-sm px-3 py-2 text-xs text-text-muted">
          {tc.args && (
            <div className="mb-1">
              <span className="font-medium text-text-secondary">参数：</span>
              <code className="break-all">{tc.args}</code>
            </div>
          )}
          {tc.result && (
            <div>
              <span className="font-medium text-text-secondary">结果：</span>
              <p className={`${resultExpanded ? '' : 'line-clamp-4'} whitespace-pre-wrap break-words`}>
                {resultExpanded ? tc.result : tc.result.slice(0, 500)}
              </p>
              {tc.result.length > 500 && (
                <button
                  onClick={() => setResultExpanded(!resultExpanded)}
                  className="text-accent cursor-pointer hover:text-accent-hover text-[11px]"
                >
                  {resultExpanded ? '收起' : '…展开更多'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
