import type { DragEvent } from 'react'
import type { ComponentMeta } from './types'
import { CAT_COLORS } from './constants'

/** dock 里的可拖拽组件芯片 */
export function ComponentChip({ comp }: { comp: ComponentMeta }): React.ReactElement {
  const handleDragStart = (e: DragEvent<HTMLButtonElement>) => {
    e.dataTransfer.setData('text/component-id', comp.id)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const accent = CAT_COLORS[comp.category] || '#3b82f6'

  return (
    <button
      draggable
      onDragStart={handleDragStart}
      className="flex items-center gap-1 rounded-control border border-border-subtle bg-bg-surface px-1.5 py-0.5 text-caption transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] hover:border-accent/40 hover:bg-accent/5 hover:scale-105 active:scale-95 cursor-grab active:cursor-grabbing"
      title={`${comp.nameCn} (${comp.name}) — 拖拽到画布`}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: accent }}
      />
      <span className="text-text-secondary">{comp.nameCn}</span>
    </button>
  )
}
