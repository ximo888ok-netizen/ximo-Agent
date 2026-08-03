// ── UserMessage — 用户消息气泡 ────────────────────────────────────────
// 参考 DeepSeek-Reasonix 的 UserMessage（内联编辑 + 元信息栏）

import { memo, useState, useRef, useCallback, useEffect } from 'react'
import { Copy, Check, Pencil, CornerDownRight } from 'lucide-react'
import type { UserItem } from '@renderer/lib/transcriptTypes'

interface UserMessageProps {
  item: UserItem
  anchorId?: string
  turn?: number
  onEdit?: (turn: number, text: string) => boolean | void | Promise<boolean | void>
  editDisabled?: boolean
}

export const UserMessage = memo(function UserMessage({
  item,
  anchorId,
  turn,
  onEdit,
  editDisabled = false,
}: UserMessageProps): React.ReactElement {
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.text)
  const [submitting, setSubmitting] = useState(false)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const canEdit = turn !== undefined && onEdit !== undefined && !editDisabled

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current)
    }
  }, [])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(item.text).then(() => {
      setCopied(true)
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
    })
  }, [item.text])

  const startEdit = useCallback(() => {
    if (!canEdit) return
    setDraft(item.text)
    setEditing(true)
    requestAnimationFrame(() => {
      const node = editRef.current
      if (!node) return
      node.focus()
      node.selectionStart = node.selectionEnd = node.value.length
    })
  }, [canEdit, item.text])

  const cancelEdit = useCallback(() => {
    setDraft(item.text)
    setEditing(false)
  }, [item.text])

  const submitEdit = useCallback(async () => {
    if (!canEdit || submitting) return
    const trimmed = draft.trim()
    if (!trimmed) return
    setSubmitting(true)
    try {
      const ok = await onEdit?.(turn as number, trimmed)
      if (ok !== false) setEditing(false)
    } finally {
      setSubmitting(false)
    }
  }, [canEdit, submitting, draft, turn, onEdit])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
      return
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void submitEdit()
    }
  }

  const sentAt = item.timestamp ? new Date(item.timestamp) : null
  const timeStr = sentAt
    ? `${String(sentAt.getHours()).padStart(2, '0')}:${String(sentAt.getMinutes()).padStart(2, '0')}`
    : ''

  return (
    <div
      className="msg msg--user"
      id={anchorId}
      data-question-anchor={anchorId}
      data-turn={turn}
    >
      <div className={`msg__body${editing ? ' msg__body--editing' : ''}`}>
        {editing ? (
          <form className="msg-edit" onSubmit={(e) => { e.preventDefault(); void submitEdit() }}>
            <textarea
              ref={editRef}
              className="msg-edit__input"
              value={draft}
              rows={Math.max(2, Math.min(8, draft.split(/\r?\n/).length))}
              disabled={submitting}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <div className="msg-edit__actions">
              <button type="button" className="msg-edit__btn" disabled={submitting} onClick={cancelEdit}>
                取消
              </button>
              <button
                type="submit"
                className="msg-edit__btn msg-edit__btn--primary"
                disabled={submitting || !draft.trim()}
              >
                <CornerDownRight size={12} />
                提交
              </button>
            </div>
          </form>
        ) : (
          <div className="msg__text">
            {item.slashCommand && (
              <span
                className="mr-1.5 inline-flex items-center rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent align-middle"
                title={item.slashCommand.systemHint}
              >
                {item.slashCommand.cmd.replace(/^\//, '')}
              </span>
            )}
            {item.text}
          </div>
        )}
      </div>
      {!editing && (
        <div className="msg-meta">
          {timeStr && <time className="msg-meta__time">{timeStr}</time>}
          <button className="msg-meta__btn" type="button" onClick={handleCopy} title="复制">
            {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
          </button>
          {onEdit && (
            <button
              className="msg-meta__btn"
              type="button"
              onClick={startEdit}
              disabled={!canEdit}
              title="编辑"
            >
              <Pencil size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  )
})
