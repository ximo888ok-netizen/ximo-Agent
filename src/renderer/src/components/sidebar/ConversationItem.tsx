import { memo, useState, useRef, useEffect } from 'react'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'

interface ConversationItemProps {
  conv: { id: string; title: string; mode: string; projectPath?: string; contextTokens?: number }
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  contextMenuId: string | null
  onContextMenu: (id: string | null) => void
}

// 对话列表项
export const ConversationItem = memo(function ConversationItem({
  conv,
  activeId,
  onSelect,
  onDelete,
  onRename,
  contextMenuId,
  onContextMenu
}: ConversationItemProps): React.ReactElement {
  const isActive = conv.id === activeId
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // 上下文窗口占用指示器
  const CONTEXT_WINDOW = 1_000_000
  const ctxTokens = conv.contextTokens ?? 0
  const ctxPct = ctxTokens > 0 ? Math.min(100, (ctxTokens / CONTEXT_WINDOW) * 100) : 0
  const ctxColor = ctxPct >= 80 ? '#ef4444'
    : ctxPct >= 60 ? '#f97316'
    : ctxPct >= 30 ? '#f59e0b'
    : '#22c55e'

  const startEditing = (): void => {
    setEditTitle(conv.title)
    setEditing(true)
    onContextMenu(null)
  }

  const commitRename = (): void => {
    const trimmed = editTitle.trim()
    if (trimmed && trimmed !== conv.title) {
      onRename(conv.id, trimmed)
    }
    setEditing(false)
  }

  const cancelEditing = (): void => {
    setEditing(false)
  }

  // 编辑模式自动聚焦
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  // 编辑模式下不显示按钮和上下文菜单
  if (editing) {
    return (
      <div className="relative px-3 py-2">
        <input
          ref={inputRef}
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitRename()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              cancelEditing()
            }
          }}
          onBlur={commitRename}
          className="w-full rounded-lg border border-accent/40 bg-bg-elevated px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
        />
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => onSelect(conv.id)}
        onContextMenu={(e) => {
          e.preventDefault()
          onContextMenu(contextMenuId === conv.id ? null : conv.id)
        }}
        className={`group flex w-full items-center gap-2 rounded-xl py-2 text-left text-sm transition-all duration-200 ease-out-quart ${
          isActive
            ? 'bg-accent/10 text-accent shadow-[inset_0_1px_0_var(--glass-highlight)] border border-accent/25'
            : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary border border-transparent'
        }`}
        style={{ paddingLeft: '12px', paddingRight: '8px' }}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full transition-shadow ${
          conv.mode === 'office' ? 'bg-blue-400' :
          conv.mode === 'coding' ? 'bg-emerald-400' : 'bg-purple-400'
        } ${isActive ? 'shadow-glow animate-pulse-dot' : ''}`} />
        <span className="truncate flex-1">{conv.title}</span>
        {ctxTokens > 0 && (
          <span
            className="shrink-0 h-1 w-8 rounded-full bg-border overflow-hidden inline-flex"
            title={`上下文占用 ${ctxPct.toFixed(1)}% (${ctxTokens.toLocaleString()} / ${CONTEXT_WINDOW.toLocaleString()})`}
          >
            <span
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.min(ctxPct, 100)}%`, backgroundColor: ctxColor }}
            />
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onContextMenu(contextMenuId === conv.id ? null : conv.id)
          }}
          className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-primary shrink-0 rounded p-0.5 hover:bg-bg-hover transition-opacity"
        >
          <MoreHorizontal size={12} />
        </button>
      </button>
      {/* 右键菜单 */}
      {contextMenuId === conv.id && (
        <div
          className="glass-strong absolute left-0 top-full z-50 mt-1 w-full rounded-xl border border-border py-1 shadow-glass animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={startEditing}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            <Pencil size={11} /> 重命名
          </button>
          <button
            onClick={() => {
              onDelete(conv.id)
              onContextMenu(null)
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={11} /> 删除
          </button>
        </div>
      )}
    </div>
  )
})
