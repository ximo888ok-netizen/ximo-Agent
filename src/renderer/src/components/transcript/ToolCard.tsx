// ── ToolCard — 单个工具调用卡片 ────────────────────────────────────────
// 参考 DeepSeek-Reasonix 的 ToolCard.tsx

import { memo, useState } from 'react'
import { ChevronRight, Loader2, CheckCircle, XCircle, Terminal, FileText, Search, Edit3, GitBranch, Cpu } from 'lucide-react'
import type { ToolItem, ToolGroupKind } from '@renderer/lib/transcriptTypes'
import { toolLabel } from '@renderer/lib/transcriptAdapter'
import { isCreationGroupableTool, toolGroupKind } from '@renderer/lib/transcriptTypes'

const TOOL_ICONS: Record<string, React.ReactNode> = {
  file_read: <FileText size={13} />,
  file_write: <Edit3 size={13} />,
  file_edit: <Edit3 size={13} />,
  file_delete: <Edit3 size={13} />,
  multi_edit: <Edit3 size={13} />,
  move_file: <Edit3 size={13} />,
  file_list: <FileText size={13} />,
  file_search: <Search size={13} />,
  terminal_exec: <Terminal size={13} />,
  git_operations: <GitBranch size={13} />,
  web_search: <Search size={13} />,
  web_fetch: <Search size={13} />,
  web_research: <Search size={13} />,
  project_context: <Search size={13} />,
  code_execute: <Cpu size={13} />,
  code_lint: <CheckCircle size={13} />,
}

function toolIcon(name: string): React.ReactNode {
  return TOOL_ICONS[name] || <Cpu size={13} />
}

function prettyArgs(args: string): string {
  try {
    const parsed = JSON.parse(args)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return args
  }
}

function extractQuery(args: string): string {
  try {
    const parsed = JSON.parse(args)
    return parsed.query || parsed.question || parsed.url || parsed.path || parsed.filePath || parsed.command || ''
  } catch {
    return ''
  }
}

export const ToolCard = memo(function ToolCard({ item }: { item: ToolItem }): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const isRunning = item.status === 'running'
  const isError = item.status === 'error'
  const query = extractArgsLabel(item)

  return (
    <div className={`turn-tool${expanded ? ' turn-tool--expanded' : ''}`} data-status={item.status}>
      <button
        type="button"
        className="turn-tool__head"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={`turn-tool__icon turn-tool__icon--${item.status}`}>
          {isRunning ? (
            <Loader2 size={13} className="animate-spin" />
          ) : isError ? (
            <XCircle size={13} />
          ) : (
            toolIcon(item.name)
          )}
        </span>
        <span className="turn-tool__label">{toolLabel(item.name)}</span>
        {query && <span className="turn-tool__query">{query}</span>}
        <span className="turn-tool__status">
          {isRunning ? '执行中…' : isError ? '失败' : '完成'}
          {(item.args || item.output || item.error) && (
            <ChevronRight size={11} className={`turn-tool__chevron${expanded ? ' turn-tool__chevron--open' : ''}`} />
          )}
        </span>
      </button>
      {expanded && (item.args || item.output || item.error) && (
        <div className="turn-tool__body">
          {item.args && (
            <div className="turn-tool__section">
              <span className="turn-tool__section-label">参数</span>
              <pre className="turn-tool__code">{prettyArgs(item.args)}</pre>
            </div>
          )}
          {item.output && (
            <div className="turn-tool__section">
              <span className="turn-tool__section-label">输出</span>
              <pre className="turn-tool__output">{item.output.slice(0, 2000)}{item.output.length > 2000 ? '\n…（截断）' : ''}</pre>
            </div>
          )}
          {item.error && (
            <div className="turn-tool__section">
              <span className="turn-tool__section-label">错误</span>
              <pre className="turn-tool__error">{item.error}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
})

function extractArgsLabel(item: ToolItem): string {
  if (item.summary) return item.summary
  return extractQuery(item.args)
}

// ── ToolGroup — 同类工具分组 ──────────────────────────────────────────

function groupTitle(kind: ToolGroupKind): string {
  switch (kind) {
    case 'explore': return '探索'
    case 'modify': return '修改'
    case 'delegate': return '委派'
    case 'shell': return '终端'
  }
}

export const ToolGroup = memo(function ToolGroup({
  kind,
  items,
}: {
  kind: ToolGroupKind
  items: ToolItem[]
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  const doneCount = items.filter((i) => i.status === 'done').length
  const runningCount = items.filter((i) => i.status === 'running').length

  // 摘要：提取文件名/命令
  const summaries = items.map((i) => {
    if (i.summary) return i.summary
    return extractQuery(i.args)
  }).filter(Boolean)
  const summaryText = summaries.slice(0, 2).join(', ') + (summaries.length > 2 ? ` 等${summaries.length}项` : '')

  return (
    <div className={`tool-group${open ? ' tool-group--open' : ''}`}>
      <button
        type="button"
        className="tool-group__head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {runningCount > 0 ? (
          <Loader2 size={12} className="animate-spin text-accent" />
        ) : (
          <CheckCircle size={12} className="text-green-500/70" />
        )}
        <span className="tool-group__label">{groupTitle(kind)}</span>
        <span className="tool-group__count">{items.length}</span>
        {summaryText && <span className="tool-group__summary">{summaryText}</span>}
        <span className="tool-group__status">
          {runningCount > 0 ? '执行中…' : `${doneCount}/${items.length} 完成`}
          <ChevronRight size={11} className={`tool-group__chevron${open ? ' tool-group__chevron--open' : ''}`} />
        </span>
      </button>
      {open && (
        <div className="tool-group__body">
          {items.map((item) => (
            <ToolCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
})

// ── ReadOnlyBatch — 只读工具批量折叠 ───────────────────────────────────

export const ReadOnlyBatch = memo(function ReadOnlyBatch({ items }: { items: ToolItem[] }): React.ReactElement {
  const [open, setOpen] = useState(false)
  const readCount = items.filter((i) => i.name === 'file_read' || i.name === 'file_list').length
  const searchCount = items.filter((i) => i.name === 'file_search' || i.name === 'web_search' || i.name === 'web_fetch').length

  const parts: string[] = []
  if (readCount > 0) parts.push(`${readCount} 次读取`)
  if (searchCount > 0) parts.push(`${searchCount} 次搜索`)
  const otherCount = items.length - readCount - searchCount
  if (otherCount > 0) parts.push(`${otherCount} 次其他`)
  const label = parts.join(' · ')

  if (!label || items.length === 0) return <></>

  return (
    <div className={`readonly-batch${open ? ' readonly-batch--open' : ''}`}>
      <button
        type="button"
        className="readonly-batch__head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ChevronRight size={12} className={`readonly-batch__chevron${open ? ' readonly-batch__chevron--open' : ''}`} />
        <span className="readonly-batch__label">{label}</span>
      </button>
      {open && (
        <div className="readonly-batch__body">
          {items.map((item) => (
            <ToolCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
})


