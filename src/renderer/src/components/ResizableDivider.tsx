import { useState, useCallback, useEffect } from 'react'

interface ResizableDividerProps {
  /** 拖拽方向：right = 手柄在左侧栏右边缘（向右拖增大），left = 手柄在右侧栏左边缘（向左拖增大） */
  side: 'left' | 'right'
  /** 当前宽度值 */
  width: number
  /** 最小宽度 */
  minWidth: number
  /** 最大宽度 */
  maxWidth: number
  /** 宽度变化回调 */
  onResize: (width: number) => void
}

/** 可拖拽的宽度分隔条 — 用于左右侧栏宽度调节 */
export function ResizableDivider({ side, width, minWidth, maxWidth, onResize }: ResizableDividerProps): React.ReactElement {
  const [isDragging, setIsDragging] = useState(false)

  const handleMouseDown = useCallback((e: React.MouseEvent): void => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    let rafId = 0
    let pendingX = 0

    const handleMouseMove = (e: MouseEvent): void => {
      pendingX = e.clientX
      if (rafId) return
      // rAF 节流 — 每帧最多更新一次宽度，避免高频 mousemove 导致卡顿
      rafId = requestAnimationFrame(() => {
        rafId = 0
        if (side === 'left') {
          const newWidth = pendingX
          onResize(Math.max(minWidth, Math.min(maxWidth, newWidth)))
        } else {
          const newWidth = window.innerWidth - pendingX
          onResize(Math.max(minWidth, Math.min(maxWidth, newWidth)))
        }
      })
    }

    const handleMouseUp = (): void => {
      if (rafId) cancelAnimationFrame(rafId)
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [isDragging, side, minWidth, maxWidth, onResize])

  // 只在拖拽时显示宽度提示
  return (
    <>
      <div
        onMouseDown={handleMouseDown}
        className="group relative flex h-full w-1 shrink-0 cursor-col-resize items-center justify-center bg-border-subtle/40 transition-colors hover:bg-accent/40"
      />
      {/* 拖拽时全屏遮罩 — 防止 webview/iframe 吞噬 mouseup */}
      {isDragging && (
        <div
          className="fixed inset-0 z-[9999] cursor-col-resize"
          style={{ userSelect: 'none' }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* 宽度提示 */}
          <div className="pointer-events-none fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-bg-elevated px-3 py-1.5 text-xs font-mono text-text-primary shadow-xl border border-border-subtle">
            {Math.round(width)}px
          </div>
        </div>
      )}
    </>
  )
}
