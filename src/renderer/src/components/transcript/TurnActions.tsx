// ── TurnActions — 轮次操作栏（复制 + 重新生成） ──────────────────────
// 参考 DeepSeek-Reasonix 的 TurnActions

import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { Copy, Check, RotateCcw } from 'lucide-react'

interface TurnActionsProps {
  text: string
  canRegenerate?: boolean
  onRegenerate?: () => void
}

export const TurnActions = memo(function TurnActions({
  text,
  canRegenerate = false,
  onRegenerate,
}: TurnActionsProps): React.ReactElement {
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current)
    }
  }, [])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
    })
  }, [text])

  if (!text.trim() && !canRegenerate) return <></>

  return (
    <div className="turn-actions">
      {text.trim() && (
        <button aria-label="复制" className="turn-actions__btn" type="button" onClick={handleCopy} title="复制">
          {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      )}
      {canRegenerate && onRegenerate && (
        <button aria-label="重新生成" className="turn-actions__btn" type="button" onClick={onRegenerate} title="重新生成">
          <RotateCcw size={13} />
          <span>重新生成</span>
        </button>
      )}
    </div>
  )
})
