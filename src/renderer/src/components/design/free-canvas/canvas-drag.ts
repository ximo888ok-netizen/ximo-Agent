import { useState, useRef, useCallback, useEffect, type DragEvent, type MouseEvent } from 'react'
import type { CanvasItem } from '@renderer/store/useStore'
import { DEFAULT_W, DEFAULT_H, COMPONENTS } from './constants'

/** 画布拖拽 Hook — 管理 dock→canvas 拖放和 canvas 内 item 移动 */
export function useCanvasDrag(
  canvasRef: React.RefObject<HTMLDivElement | null>,
  canvasItems: CanvasItem[],
  addCanvasItem: (item: Omit<CanvasItem, 'id' | 'zIndex'>) => void,
  updateCanvasItem: (id: string, patch: Partial<CanvasItem>) => void,
) {
  const [dragOver, setDragOver] = useState(false)

  // ─── 从 dock 拖拽到画布 ──────────────────────────────
  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const compId = e.dataTransfer.getData('text/component-id')
    if (!compId) return
    const comp = COMPONENTS.find(c => c.id === compId)
    if (!comp) return

    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left - DEFAULT_W / 2
    const y = e.clientY - rect.top - DEFAULT_H / 2

    addCanvasItem({
      componentId: comp.id,
      componentName: comp.name,
      componentNameCn: comp.nameCn,
      category: comp.category,
      dependencies: comp.dependencies,
      x: Math.max(0, x),
      y: Math.max(0, y),
      width: DEFAULT_W,
      height: DEFAULT_H,
    })
  }, [addCanvasItem, canvasRef])

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget === e.target) setDragOver(false)
  }, [])

  // ─── 画布内拖拽移动 item ─────────────────────────────
  const dragState = useRef<{
    itemId: string
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)

  const handleItemMouseDown = useCallback((e: MouseEvent, item: CanvasItem) => {
    e.preventDefault()
    e.stopPropagation()
    dragState.current = {
      itemId: item.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: item.x,
      origY: item.y,
    }
    const maxZ = canvasItems.reduce((mx, it) => Math.max(mx, it.zIndex), 0)
    if (item.zIndex < maxZ) {
      updateCanvasItem(item.id, { zIndex: maxZ + 1 })
    }
  }, [canvasItems, updateCanvasItem])

  const handleMouseMove = useCallback((e: globalThis.MouseEvent) => {
    if (!dragState.current) return
    const dx = e.clientX - dragState.current.startX
    const dy = e.clientY - dragState.current.startY
    const newX = Math.max(0, dragState.current.origX + dx)
    const newY = Math.max(0, dragState.current.origY + dy)
    updateCanvasItem(dragState.current.itemId, { x: newX, y: newY })
  }, [updateCanvasItem])

  const handleMouseUp = useCallback(() => {
    dragState.current = null
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  return {
    dragOver,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleItemMouseDown,
  }
}
