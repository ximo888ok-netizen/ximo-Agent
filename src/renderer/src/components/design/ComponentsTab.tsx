import { useState, useMemo, useCallback, lazy, Suspense } from 'react'
import {
  ChevronDown, ChevronRight,
  Loader2, Eye, Box, Search, Palette,
  Check, Plus,
} from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import type { ComponentMeta } from '@shared/types'
import uiComponentsCatalog from './ui-components-catalog.json'
import { DEP_LABELS, SearchBox, BackButton, Section, EmptyState } from './template-shared'

// 懒加载预览面板
const DesignPreviewPanel = lazy(() => import('./DesignPreviewPanel').then(m => ({ default: m.DesignPreviewPanel })))

const COMPONENTS = (uiComponentsCatalog as { components: ComponentMeta[] }).components

export function ComponentsTab(): React.ReactElement {
  const toggleComponent = useStore((s) => s.toggleComponent)
  const selectedComponentIds = useStore((s) => s.selectedComponentIds)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set())
  const [previewCompId, setPreviewCompId] = useState<string | null>(null)

  // 搜索过滤
  const grouped = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const filtered = q
      ? COMPONENTS.filter(c =>
          c.id.toLowerCase().includes(q) ||
          c.nameCn.includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q) ||
          c.categoryCn.includes(q) ||
          c.dependencies.some(d => d.toLowerCase().includes(q))
        )
      : COMPONENTS
    const groups: Record<string, ComponentMeta[]> = {}
    for (const c of filtered) {
      if (!groups[c.category]) groups[c.category] = []
      groups[c.category].push(c)
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [searchQuery])

  const selected = COMPONENTS.find(c => c.id === selectedId)

  // 加载组件源码并预览
  const handlePreview = useCallback(async (comp: ComponentMeta) => {
    setPreviewCompId(comp.id)
  }, [])

  // 使用组件 — 加入输入框的组件选择
  const handleUse = useCallback((comp: ComponentMeta) => {
    toggleComponent(comp.id)
  }, [toggleComponent])

  // 预览模式
  if (previewCompId && selected) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <Suspense fallback={<div className="flex flex-1 items-center justify-center"><Loader2 size={16} className="animate-spin text-accent" /></div>}>
          <DesignPreviewPanel
            componentId={previewCompId}
            componentName={selected?.nameCn}
            onClose={() => setPreviewCompId(null)}
          />
        </Suspense>
      </div>
    )
  }

  // 详情模式
  if (selected) {
    return (
      <ComponentDetail
        component={selected}
        onBack={() => setSelectedId(null)}
        onPreview={() => void handlePreview(selected)}
        onUse={() => handleUse(selected)}
        selectedComponentIds={selectedComponentIds}
      />
    )
  }

  // 列表模式
  const toggleCat = (cat: string) => setCollapsedCats(prev => {
    const n = new Set(prev)
    n.has(cat) ? n.delete(cat) : n.add(cat)
    return n
  })

  return (
    <>
      <div className="px-1.5 py-1.5 border-b border-border-subtle shrink-0">
        <SearchBox value={searchQuery} onChange={setSearchQuery} placeholder={`搜索 ${COMPONENTS.length} 个组件...`} />
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-1">
        {grouped.map(([category, comps]) => {
          const collapsed = collapsedCats.has(category)
          const catCn = comps[0]?.categoryCn || category
          return (
            <div key={category} className="mb-0.5">
              <button onClick={() => toggleCat(category)} className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left transition-colors hover:bg-bg-elevated/50">
                {collapsed ? <ChevronRight size={10} className="text-text-muted" /> : <ChevronDown size={10} className="text-text-muted" />}
                <span className="text-[10px] font-semibold text-text-secondary truncate">{catCn}</span>
                <span className="ml-auto rounded-full bg-bg-elevated/80 px-1 text-[8px] text-text-muted">{comps.length}</span>
              </button>
              {!collapsed && (
                <div className="grid grid-cols-1 gap-0.5 px-1 pb-1">
                  {comps.map(c => <ComponentRow key={c.id} component={c} onClick={() => setSelectedId(c.id)} />)}
                </div>
              )}
            </div>
          )
        })}
        {grouped.length === 0 && <EmptyState icon={Search} text="未找到匹配的组件" />}
      </div>
    </>
  )
}

// ─── 组件行 ────────────────────────────────────────────

function ComponentRow({ component, onClick }: { component: ComponentMeta; onClick: () => void }): React.ReactElement {
  const hasDeps = component.dependencies.length > 0
  return (
    <button onClick={onClick} title={component.nameCn} className="group flex items-center gap-1.5 rounded-md border border-border-subtle bg-bg-elevated/40 px-1.5 py-1 transition-all hover:border-accent/30 hover:bg-bg-elevated/70 active:scale-95">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent/10">
        <Box size={10} className="text-accent" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[10px] font-medium text-text-primary group-hover:text-accent transition-colors">{component.nameCn}</div>
        <div className="truncate text-[8px] text-text-muted">{component.id}</div>
      </div>
      {hasDeps && (
        <div className="flex shrink-0 items-center gap-0.5">
          {component.dependencies.slice(0, 2).map(d => (
            <span key={d} className="rounded bg-accent/10 px-1 text-[7px] text-accent/70">{DEP_LABELS[d]?.[0] || d[0]}</span>
          ))}
        </div>
      )}
    </button>
  )
}

// ─── 组件详情 ──────────────────────────────────────────

function ComponentDetail({ component, onBack, onPreview, onUse, selectedComponentIds }: {
  component: ComponentMeta
  onBack: () => void
  onPreview: () => void
  onUse: () => void
  selectedComponentIds: string[]
}): React.ReactElement {
  return (
    <div className="flex flex-col p-2 overflow-y-auto">
      <BackButton onBack={onBack} />
      {/* 标题 */}
      <div className="flex items-center gap-2 rounded-lg bg-gradient-to-br from-accent/15 to-purple-500/15 p-2.5 ring-1 ring-white/5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-elevated/80">
          <Box size={18} className="text-accent" />
        </div>
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-text-primary">{component.nameCn}</h3>
          <p className="text-[9px] text-text-muted">{component.id} · {component.categoryCn}</p>
        </div>
      </div>

      {/* 依赖 */}
      {component.dependencies.length > 0 && (
        <Section title="依赖库">
          <div className="flex flex-wrap gap-1">
            {component.dependencies.map(d => (
              <span key={d} className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[9px] font-medium text-accent">
                {DEP_LABELS[d] || d}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Props */}
      {component.props.length > 0 && (
        <Section title={`Props（${component.props.length} 个）`}>
          <div className="flex flex-wrap gap-1">
            {component.props.map(p => (
              <code key={p} className="rounded bg-bg-elevated/80 px-1 py-0.5 text-[9px] text-text-secondary">{p}</code>
            ))}
          </div>
        </Section>
      )}

      {/* 文件结构 */}
      <Section title="文件">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-[10px] text-text-secondary">
            <span className="text-accent">{'</>'}</span>
            {component.files.jsx}
          </div>
          {component.files.css && (
            <div className="flex items-center gap-1.5 text-[10px] text-text-secondary">
              <Palette size={9} className="text-accent" />
              {component.files.css}
            </div>
          )}
        </div>
      </Section>

      {/* 预览按钮 */}
      <button
        onClick={onPreview}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent/10 px-2 py-2 text-[11px] font-medium text-accent transition-all hover:bg-accent/20 active:scale-[0.98]"
      >
        <Eye size={12} />
        预览组件
      </button>

      {/* 加入/取消选择 */}
      <button
        onClick={onUse}
        className={`mt-1.5 flex w-full items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-medium transition-all active:scale-[0.98] ${selectedComponentIds.includes(component.id) ? 'bg-accent/20 text-accent ring-1 ring-accent/40' : 'bg-bg-elevated/80 text-text-secondary hover:bg-bg-elevated'}`}
      >
        {selectedComponentIds.includes(component.id) ? <><Check size={12} /> 已加入选择</> : <><Plus size={12} /> 加入选择</>}
      </button>
    </div>
  )
}
