import type React from 'react'
import { useState } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  /**
   * 用户勾选「不再提示」并确认时调用 —— 由调用方把自动化等级切到「完全访问」。
   * 以前这个勾选写的是 sessionStorage 的一个私标记，等于开了第二套真相；
   * 现在统一走等级，这样输入框里选了什么，弹窗行为就跟着变什么。
   */
  onRemember?: () => void
}

/**
 * ConfirmDialog — 敏感操作确认弹窗
 * 用于电脑操作、文件写入、终端命令等敏感操作的确认
 */
export function ConfirmDialog({ open, title, message, onConfirm, onCancel, onRemember }: ConfirmDialogProps): React.ReactElement | null {
  const [remember, setRemember] = useState(false)

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
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-panel bg-amber-500/10 text-amber-500 shadow-inner">
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

        <label className="mb-4 flex items-start gap-2 text-xs text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-control border-border text-accent focus:ring-accent"
          />
          <span>
            不再提示
            <span className="block text-caption text-text-quaternary">
              会把自动化等级切换为「完全访问」，后续所有操作都不再询问
            </span>
          </span>
        </label>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="btn-ghost rounded-panel px-4 py-2 text-xs font-medium"
          >
            取消
          </button>
          <button
            onClick={() => { if (remember) onRemember?.(); onConfirm() }}
            className="btn-liquid rounded-panel px-4 py-2 text-xs font-medium"
          >
            确认执行
          </button>
        </div>
      </div>
    </div>
  )
}
