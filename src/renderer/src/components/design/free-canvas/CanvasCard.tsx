import { GripVertical, X } from 'lucide-react'
import type { MouseEvent } from 'react'
import type { CanvasItem } from '@renderer/store/useStore'
import { CAT_COLORS } from './constants'

/** 画布上的组件卡片 — 可拖拽移动 */
export function CanvasCard({ item, onMouseDown, onRemove }: {
  item: CanvasItem
  onMouseDown: (e: MouseEvent, item: CanvasItem) => void
  onRemove: () => void
}): React.ReactElement {
  const accent = CAT_COLORS[item.category] || '#3b82f6'

  return (
    <div
      onMouseDown={(e) => onMouseDown(e, item)}
      className="group absolute cursor-move select-none rounded-card border bg-bg-surface shadow-md transition-shadow hover:shadow-lg"
      style={{
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        zIndex: item.zIndex,
        borderColor: `${accent}40`,
        borderLeftWidth: 3,
        borderLeftColor: accent,
      }}
    >
      <div className="flex h-full items-center gap-2 px-3">
        <GripVertical size={13} className="shrink-0 text-text-quaternary" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-caption font-medium text-text-primary">{item.componentNameCn}</span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-caption text-text-muted font-mono">{item.componentId}</span>
            {item.dependencies.length > 0 && (
              <span className="text-caption text-accent/60">· {item.dependencies.join(',')}</span>
            )}
          </div>
        </div>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onRemove() }}
        className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:scale-110 active:scale-[0.97]"
        title="删除"
      >
        <X size={11} />
      </button>
    </div>
  )
}
