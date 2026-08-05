import { useState, useRef, useCallback, useMemo, useEffect, type DragEvent, type MouseEvent } from 'react'
import {
  Search, X, Trash2, Send, Palette, Box, ChevronDown,
  GripVertical, Layers, Globe, Smartphone, Monitor, Layout,
  Check,
} from 'lucide-react'
import { useStore, type CanvasItem } from '../../store/useStore'
import type { ComponentMeta, StyleEntry } from '../../../../shared/types'
import designSystemsCatalog from './design-systems-catalog.json'
import uiComponentsCatalog from './ui-components-catalog.json'
import scenarioLayoutsData from './scenario-layouts.json'

// ─── 类型 ──────────────────────────────────────────────

interface LayoutItem {
  componentId: string
  x: number
  y: number
  w: number
  h: number
  label: string
}

interface LayoutTemplate {
  id: string
  name: string
  desc: string
  blocks: string[]
  items: LayoutItem[]
}

interface ScenarioEntry {
  id: string
  name: string
  icon: string
  layouts: LayoutTemplate[]
}

const STYLES = designSystemsCatalog as StyleEntry[]
const COMPONENTS = (uiComponentsCatalog as { components: ComponentMeta[] }).components
const SCENARIOS = (scenarioLayoutsData as { scenarios: ScenarioEntry[] }).scenarios

// 场景图标映射
const SCENARIO_ICONS: Record<string, typeof Globe> = {
  Globe, Smartphone, Monitor, Layout,
}

// 默认放置尺寸
const DEFAULT_W = 200
const DEFAULT_H = 72

// 分类颜色映射
const CAT_COLORS: Record<string, string> = {
  'Components': '#3b82f6',
  'Animations': '#8b5cf6',
  'Backgrounds': '#06b6d4',
  'TextAnimations': '#f59e0b',
}

// 布局 block 的迷你色块表示
const BLOCK_COLORS: Record<string, string> = {
  hero: '#6366f1', split: '#6366f1', nav: '#3b82f6', header: '#3b82f6',
  banner: '#8b5cf6', toolbar: '#3b82f6', sidebar: '#06b6d4',
  row3: '#10b981', bento: '#10b981', grid4: '#10b981', grid: '#10b981',
  stats: '#f59e0b', kpi3: '#f59e0b', chart: '#f59e0b', list: '#ec4899',
  cards: '#ec4899', masonry: '#ec4899', profile: '#f97316', stack: '#f97316',
  cta: '#ef4444', action: '#ef4444', tabbar: '#64748b', menu: '#64748b',
  filter: '#14b8a6', search: '#14b8a6', pricing: '#a855f7', tree: '#06b6d4',
  editor: '#10b981', detail: '#f97316', col3: '#10b981', circular: '#8b5cf6',
  chroma: '#06b6d4', posters: '#ec4899', info: '#3b82f6', stepper: '#f59e0b',
  icons: '#10b981',
}

// ─── 主组件 ────────────────────────────────────────────

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
  const [dragOver, setDragOver] = useState(false)
  const [showStylePicker, setShowStylePicker] = useState(false)
  const [showScenarioPicker, setShowScenarioPicker] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // 当前场景的布局列表
  const currentScenario = SCENARIOS.find(s => s.id === canvasScenario)

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
  }, [addCanvasItem])

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

  // ─── 组件 dock 过滤 ──────────────────────────────────
  const filteredComponents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return COMPONENTS
    return COMPONENTS.filter(c =>
      c.id.toLowerCase().includes(q) ||
      c.nameCn.includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.categoryCn.includes(q)
    )
  }, [searchQuery])

  const groupedDock = useMemo(() => {
    const groups: Record<string, ComponentMeta[]> = {}
    for (const c of filteredComponents) {
      if (!groups[c.categoryCn]) groups[c.categoryCn] = []
      groups[c.categoryCn].push(c)
    }
    return Object.entries(groups)
  }, [filteredComponents])

  const appliedStyle = STYLES.find(s => s.id === canvasStyleId)
  const ScenarioIcon = currentScenario ? (SCENARIO_ICONS[currentScenario.icon] || Globe) : null

  return (
    <div className="flex h-full flex-col">
      {/* ── 顶部工具栏 ── */}
      <div className="flex items-center gap-1.5 border-b border-border-subtle px-2.5 py-1.5 shrink-0">
        {/* 场景选择器 */}
        <div className="relative">
          <button
            onClick={() => setShowScenarioPicker(!showScenarioPicker)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors"
            style={currentScenario ? {
              backgroundColor: 'rgba(99,102,241,0.12)',
              color: '#818cf8',
            } : undefined}
          >
            {ScenarioIcon ? <ScenarioIcon size={11} /> : <Layout size={11} />}
            <span className={currentScenario ? '' : 'text-text-muted'}>
              {currentScenario ? currentScenario.name : '场景'}
            </span>
            <ChevronDown size={10} className="opacity-50" />
          </button>
          {showScenarioPicker && (
            <ScenarioPicker
              scenarios={SCENARIOS}
              selectedId={canvasScenario}
              onSelect={(id) => { setCanvasScenario(id); setShowScenarioPicker(false) }}
              onClose={() => setShowScenarioPicker(false)}
            />
          )}
        </div>

        {/* 风格选择器 */}
        <div className="relative">
          <button
            onClick={() => setShowStylePicker(!showStylePicker)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors"
            style={appliedStyle ? {
              backgroundColor: `${appliedStyle.tokens.accent}15`,
              color: appliedStyle.tokens.accent,
            } : undefined}
          >
            <Palette size={11} />
            <span className={appliedStyle ? '' : 'text-text-muted'}>
              {appliedStyle ? appliedStyle.name : '风格'}
            </span>
            {appliedStyle && (
              <span
                className="ml-0.5 h-2 w-2 rounded-full"
                style={{ backgroundColor: appliedStyle.tokens.accent }}
              />
            )}
            <ChevronDown size={10} className="opacity-50" />
          </button>
          {showStylePicker && (
            <StylePicker
              styles={STYLES}
              selectedId={canvasStyleId}
              onSelect={(id) => { setCanvasStyle(id); setShowStylePicker(false) }}
              onClose={() => setShowStylePicker(false)}
            />
          )}
        </div>

        <div className="flex-1" />

        {/* 已放置数量 */}
        {canvasItems.length > 0 && (
          <span className="flex items-center gap-1 rounded-md bg-bg-elevated px-1.5 py-0.5 text-[10px] text-text-muted">
            <Layers size={9} />
            {canvasItems.length}
          </span>
        )}

        {/* 清空 */}
        {canvasItems.length > 0 && (
          <button
            onClick={clearCanvas}
            className="icon-btn rounded-lg p-1 text-text-muted hover:text-red-400"
            title="清空画布"
          >
            <Trash2 size={12} />
          </button>
        )}

        {/* 发送给 Agent */}
        <button
          onClick={() => void sendCanvasToAgent()}
          disabled={canvasItems.length === 0 || isStreaming}
          className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${
            canvasItems.length > 0 && !isStreaming
              ? 'bg-accent text-white hover:scale-105 active:scale-95'
              : 'bg-bg-elevated text-text-muted cursor-not-allowed'
          }`}
          title="发送给 Agent 开发"
        >
          <Send size={11} />
          发送
        </button>
      </div>

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
      <div className="shrink-0 border-t border-border-subtle">
        <div className="px-2 pt-1.5 pb-1">
          <div className="relative">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索组件..."
              className="w-full rounded-md bg-bg-elevated/60 py-1 pl-7 pr-2 text-[11px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/30"
            />
          </div>
        </div>

        <div className="max-h-32 overflow-y-auto px-2 pb-1.5">
          {groupedDock.map(([cat, comps]) => (
            <div key={cat} className="mb-1">
              <div className="px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-text-muted">
                {cat} ({comps.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {comps.map(comp => (
                  <ComponentChip key={comp.id} comp={comp} />
                ))}
              </div>
            </div>
          ))}
          {filteredComponents.length === 0 && (
            <div className="py-3 text-center text-[10px] text-text-muted">未找到匹配组件</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── 画布上的组件卡片 ──────────────────────────────────

function CanvasCard({ item, onMouseDown, onRemove }: {
  item: CanvasItem
  onMouseDown: (e: MouseEvent, item: CanvasItem) => void
  onRemove: () => void
}): React.ReactElement {
  const accent = CAT_COLORS[item.category] || '#3b82f6'

  return (
    <div
      onMouseDown={(e) => onMouseDown(e, item)}
      className="group absolute cursor-move select-none rounded-lg border bg-bg-surface shadow-md transition-shadow hover:shadow-lg"
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
      <div className="flex h-full items-center gap-2 px-2.5">
        <GripVertical size={12} className="shrink-0 text-text-muted/40" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[11px] font-medium text-text-primary">{item.componentNameCn}</span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[9px] text-text-muted font-mono">{item.componentId}</span>
            {item.dependencies.length > 0 && (
              <span className="text-[9px] text-accent/60">· {item.dependencies.join(',')}</span>
            )}
          </div>
        </div>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onRemove() }}
        className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:scale-110"
        title="删除"
      >
        <X size={9} />
      </button>
    </div>
  )
}

// ─── dock 里的可拖拽组件芯片 ───────────────────────────

function ComponentChip({ comp }: { comp: ComponentMeta }): React.ReactElement {
  const handleDragStart = (e: DragEvent<HTMLButtonElement>) => {
    e.dataTransfer.setData('text/component-id', comp.id)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const accent = CAT_COLORS[comp.category] || '#3b82f6'

  return (
    <button
      draggable
      onDragStart={handleDragStart}
      className="flex items-center gap-1 rounded-md border border-border-subtle bg-bg-surface px-1.5 py-0.5 text-[10px] transition-all hover:border-accent/40 hover:bg-accent/5 hover:scale-105 active:scale-95 cursor-grab active:cursor-grabbing"
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

// ─── 场景选择器弹窗 ────────────────────────────────────

function ScenarioPicker({ scenarios, selectedId, onSelect, onClose }: {
  scenarios: ScenarioEntry[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onClose: () => void
}): React.ReactElement {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-xl border border-border-subtle bg-bg-surface shadow-xl">
        <div className="p-1.5">
          {/* 清除按钮 */}
          {selectedId && (
            <button
              onClick={() => onSelect(null)}
              className="mb-1 w-full rounded-md px-2 py-1 text-left text-[10px] text-text-muted hover:bg-bg-elevated"
            >
              ✕ 清除场景选择
            </button>
          )}
          {scenarios.map(scenario => {
            const Icon = SCENARIO_ICONS[scenario.icon] || Globe
            const isSelected = selectedId === scenario.id
            return (
              <button
                key={scenario.id}
                onClick={() => onSelect(scenario.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                  isSelected ? 'bg-accent/10' : 'hover:bg-bg-elevated'
                }`}
              >
                <Icon size={14} className={isSelected ? 'text-accent' : 'text-text-muted'} />
                <div className="flex-1">
                  <span className={`text-[11px] font-medium ${isSelected ? 'text-accent' : 'text-text-primary'}`}>
                    {scenario.name}
                  </span>
                  <span className="ml-1 text-[9px] text-text-muted">
                    {scenario.layouts.length} 布局
                  </span>
                </div>
                {isSelected && <Check size={12} className="text-accent" />}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ─── 布局模板卡片 ──────────────────────────────────────

function LayoutCard({ layout, onApply }: {
  layout: LayoutTemplate
  onApply: () => void
}): React.ReactElement {
  return (
    <button
      onClick={onApply}
      className="group shrink-0 w-36 rounded-lg border border-border-subtle bg-bg-surface p-1.5 text-left transition-all hover:border-accent/40 hover:shadow-md hover:scale-[1.02] active:scale-95"
      title={layout.desc}
    >
      {/* 迷你布局预览 */}
      <div className="mb-1.5 h-12 rounded bg-bg-base/60 overflow-hidden relative">
        <div className="absolute inset-1 flex flex-col gap-0.5">
          {layout.blocks.map((block, i) => (
            <div
              key={i}
              className="rounded-sm transition-all group-hover:opacity-80"
              style={{
                backgroundColor: BLOCK_COLORS[block] || '#64748b',
                opacity: 0.7,
                flex: block === 'sidebar' || block === 'tree' ? '0 0 25%' : '1',
                height: block === 'tabbar' || block === 'cta' || block === 'action' || block === 'toolbar' || block === 'search' || block === 'filter' || block === 'stepper' || block === 'stats' || block === 'kpi3' ? '18%' : block === 'hero' || block === 'banner' || block === 'circular' || block === 'carousel' || block === 'split' || block === 'header' || block === 'profile' || block === 'editor' || block === 'chart' || block === 'bento' || block === 'masonry' || block === 'cards' || block === 'col3' || block === 'stack' || block === 'list' ? '42%' : '28%',
                display: block === 'row3' || block === 'grid4' || block === 'kpi3' ? 'flex' : 'block',
                gap: '2px',
              }}
            >
              {(block === 'row3' || block === 'grid4' || block === 'kpi3') && (
                <>
                  <div className="flex-1 rounded-sm" style={{ backgroundColor: BLOCK_COLORS[block] || '#64748b' }} />
                  <div className="flex-1 rounded-sm" style={{ backgroundColor: BLOCK_COLORS[block] || '#64748b' }} />
                  <div className="flex-1 rounded-sm" style={{ backgroundColor: BLOCK_COLORS[block] || '#64748b' }} />
                  {block === 'grid4' && <div className="flex-1 rounded-sm" style={{ backgroundColor: BLOCK_COLORS[block] || '#64748b' }} />}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      {/* 名称和描述 */}
      <div className="text-[10px] font-medium text-text-primary truncate">{layout.name}</div>
      <div className="text-[8px] text-text-muted truncate mt-0.5">{layout.desc}</div>
    </button>
  )
}

// ─── 风格选择器弹窗 ────────────────────────────────────

function StylePicker({ styles, selectedId, onSelect, onClose }: {
  styles: StyleEntry[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onClose: () => void
}): React.ReactElement {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return styles
    return styles.filter(s =>
      s.id.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
    )
  }, [styles, query])

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border border-border-subtle bg-bg-surface shadow-xl">
        <div className="p-2">
          <div className="relative mb-1.5">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索风格..."
              className="w-full rounded-md bg-bg-elevated/60 py-1 pl-7 pr-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-accent/30"
            />
          </div>

          {selectedId && (
            <button
              onClick={() => onSelect(null)}
              className="mb-1 w-full rounded-md px-2 py-1 text-left text-[10px] text-text-muted hover:bg-bg-elevated"
            >
              ✕ 清除风格绑定
            </button>
          )}

          <div className="max-h-48 overflow-y-auto">
            {filtered.map(style => (
              <button
                key={style.id}
                onClick={() => onSelect(style.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors ${
                  selectedId === style.id ? 'bg-accent/10' : 'hover:bg-bg-elevated'
                }`}
              >
                <div className="flex h-4 w-8 shrink-0 overflow-hidden rounded">
                  <div className="flex-1" style={{ backgroundColor: style.tokens.accent }} />
                  <div className="flex-1" style={{ backgroundColor: style.tokens.bg }} />
                  <div className="flex-1" style={{ backgroundColor: style.tokens.surface }} />
                </div>
                <span className={`flex-1 truncate text-[10px] ${selectedId === style.id ? 'text-accent font-medium' : 'text-text-secondary'}`}>
                  {style.name}
                </span>
                <span className="text-[8px] text-text-muted">{style.category}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
