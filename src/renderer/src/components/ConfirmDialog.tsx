import type React from 'react'
import { useState } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * ConfirmDialog — 敏感操作确认弹窗
 * 用于电脑操作、文件写入、终端命令等敏感操作的确认
 */
export function ConfirmDialog({ open, title, message, onConfirm, onCancel }: ConfirmDialogProps): React.ReactElement | null {
  const [yoloRemember, setYoloRemember] = useState(false)

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="glass-panel mx-4 w-full max-w-md p-6 animate-fade-scale"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 shadow-inner">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
            <p className="mt-1 text-xs text-text-secondary">{message}</p>
          </div>
        </div>

        <label className="mb-4 flex items-center gap-2 text-xs text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={yoloRemember}
            onChange={(e) => setYoloRemember(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent"
          />
          本次会话不再提示（YOLO 模式）
        </label>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="btn-ghost rounded-xl px-4 py-2 text-xs font-medium"
          >
            取消
          </button>
          <button
            onClick={() => { if (yoloRemember) sessionStorage.setItem('ximo-yolo', 'true'); onConfirm() }}
            className="btn-liquid rounded-xl px-4 py-2 text-xs font-medium"
          >
            确认执行
          </button>
        </div>
      </div>
    </div>
  )
}
