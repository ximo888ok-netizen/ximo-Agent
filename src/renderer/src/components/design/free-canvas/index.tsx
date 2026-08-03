import { useState, useRef } from 'react'
import { Box, Layout } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { STYLES, SCENARIOS } from './constants'
import { CanvasCard } from './CanvasCard'
import { CanvasToolbar } from './CanvasToolbar'
import { ComponentDock } from './ComponentDock'
import { useCanvasDrag } from './canvas-drag'
import { LayoutCard } from './pickers'

export function FreeCanvas(): React.ReactElement {
  const canvasItems = useStore((s) => s.canvasItems)
  const canvasStyleId = useStore((s) => s.canvasStyleId)
  const canvasScenario = useStore((s) => s.canvasScenario)
  const addCanvasItem = useStore((s) => s.addCanvasItem)
  const updateCanvasItem = useStore((s) => s.updateCanvasItem)
  const removeCanvasItem = useStore((s) => s.removeCanvasItem)
  const clearCanvas = useStore((s) => s.clearCanvas)
  const setCanvasStyle = useStore((s) => s.setCanvasStyle)
  const setCanvasScenario = useStore((s) => s.setCanvasScenario)
  const applyLayout = useStore((s) => s.applyLayout)
  const sendCanvasToAgent = useStore((s) => s.sendCanvasToAgent)
  const isStreaming = useStore((s) => s.isStreaming)

  const canvasRef = useRef<HTMLDivElement>(null)
  const [showStylePicker, setShowStylePicker] = useState(false)
  const [showScenarioPicker, setShowScenarioPicker] = useState(false)

  const { dragOver, handleDrop, handleDragOver, handleDragLeave, handleItemMouseDown } =
    useCanvasDrag(canvasRef, canvasItems, addCanvasItem, updateCanvasItem)

  const currentScenario = SCENARIOS.find(s => s.id === canvasScenario)
  const appliedStyle = STYLES.find(s => s.id === canvasStyleId)

  return (
    <div className="flex h-full flex-col">
      {/* ── 顶部工具栏 ── */}
      <CanvasToolbar
        canvasItems={canvasItems}
        canvasStyleId={canvasStyleId}
        canvasScenario={canvasScenario}
        isStreaming={isStreaming}
        showStylePicker={showStylePicker}
        showScenarioPicker={showScenarioPicker}
        onToggleStylePicker={() => setShowStylePicker(!showStylePicker)}
        onToggleScenarioPicker={() => setShowScenarioPicker(!showScenarioPicker)}
        onSelectStyle={(id) => setCanvasStyle(id)}
        onSelectScenario={(id) => setCanvasScenario(id)}
        onClearCanvas={clearCanvas}
        onSendToAgent={() => void sendCanvasToAgent()}
      />

      {/* ── 场景布局模板区（选择场景后显示） ── */}
      {currentScenario && currentScenario.layouts.length > 0 && (
        <div className="shrink-0 border-b border-border-subtle bg-bg-surface/50">
          <div className="px-2.5 pt-1.5 pb-0.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Layout size={9} className="text-text-muted" />
              <span className="text-[9px] font-medium text-text-muted uppercase tracking-wide">
                {currentScenario.name}布局模板
              </span>
            </div>
          </div>
          <div className="flex gap-1.5 overflow-x-auto px-2.5 pb-2">
            {currentScenario.layouts.map(layout => (
              <LayoutCard
                key={layout.id}
                layout={layout}
                onApply={() => applyLayout(layout.items)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── 画布区域 ── */}
      <div
        ref={canvasRef}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative flex-1 overflow-auto transition-colors ${
          dragOver ? 'bg-accent/5' : 'bg-bg-base/30'
        }`}
        style={{
          backgroundImage: `
            radial-gradient(circle, ${dragOver ? 'rgba(99,102,241,0.15)' : 'rgba(120,120,140,0.08)'} 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px',
        }}
      >
        {/* 空状态 */}
        {canvasItems.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center py-8 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/15 to-purple-500/15">
              <Box size={24} className="text-accent/60" />
            </div>
            <p className="text-xs font-medium text-text-secondary">自由画布</p>
            <p className="mt-1 text-[10px] text-text-muted leading-relaxed">
              {currentScenario
                ? `已选「${currentScenario.name}」场景 — 点击上方布局模板快速开始\n或从下方组件库拖拽到此处`
                : '选择场景和风格，或从下方组件库拖拽到此处\n排列后点击「发送」交给 Agent'
              }
            </p>
          </div>
        )}

        {/* 已放置的组件卡片 */}
        {canvasItems.map(item => (
          <CanvasCard
            key={item.id}
            item={item}
            onMouseDown={handleItemMouseDown}
            onRemove={() => removeCanvasItem(item.id)}
          />
        ))}
      </div>

      {/* ── 底部组件 dock ── */}
      <ComponentDock />
    </div>
  )
}
