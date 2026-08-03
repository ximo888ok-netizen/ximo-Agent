import { useState, useEffect, useMemo, useRef } from 'react'
import { Box, Search, Check, X, ChevronDown } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { COMPONENT_CATALOG } from './constants'

export function ComponentPicker(): React.ReactElement {
  const selectedComponentIds = useStore((s) => s.selectedComponentIds)
  const toggleComponent = useStore((s) => s.toggleComponent)
  const clearSelectedComponents = useStore((s) => s.clearSelectedComponents)

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set())
  const ref = useRef<HTMLDivElement>(null)

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const componentCategories = useMemo(() => {
    const cats: Record<string, { count: number; nameCn: string }> = {}
    for (const c of COMPONENT_CATALOG) {
      if (!cats[c.category]) cats[c.category] = { count: 0, nameCn: c.categoryCn }
      cats[c.category].count++
    }
    return Object.entries(cats).sort(([, a], [, b]) => b.count - a.count)
  }, [])

  const filteredComponents = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = COMPONENT_CATALOG
    if (category) list = list.filter((c) => c.category === category)
    if (q) list = list.filter((c) =>
      c.id.toLowerCase().includes(q) ||
      c.nameCn.includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      c.categoryCn.includes(q)
    )
    return list
  }, [search, category])

  const groupedComponents = useMemo(() => {
    const groups: Record<string, typeof COMPONENT_CATALOG> = {}
    for (const c of filteredComponents) { if (!groups[c.category]) groups[c.category] = []; groups[c.category].push(c) }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [filteredComponents])

  const selectedComponents = useMemo(
    () => COMPONENT_CATALOG.filter((c) => selectedComponentIds.includes(c.id)),
    [selectedComponentIds]
  )

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(!open); setSearch(''); setCategory(null) }}
        className={`chip flex items-center gap-1 px-2 py-0.5 text-[11px] transition-all duration-200 active:scale-95 ${
          selectedComponentIds.length > 0
            ? 'border-accent/30 text-accent bg-accent/10'
            : open
              ? 'border-accent/40 text-accent bg-accent/8'
              : 'text-text-muted hover:text-text-secondary'
        }`}
        title="选择 UI 组件"
      >
        <Box size={12} />
        组件{selectedComponentIds.length > 0 ? `(${selectedComponentIds.length})` : ''}
      </button>

      {/* 组件选择弹出面板 */}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-[420px] max-h-[480px] rounded-xl border border-border-subtle bg-bg-elevated shadow-glass animate-fade-scale flex flex-col overflow-hidden z-50">
          {/* 搜索栏 */}
          <div className="px-3 py-2 border-b border-border-subtle">
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-input px-2 py-1">
              <Search size={12} className="text-text-muted" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCategory(null) }}
                placeholder={`搜索 ${COMPONENT_CATALOG.length} 个 UI 组件...`}
                className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
              />
            </div>
          </div>
          {/* 分类标签行 */}
          <div className="flex gap-1 px-3 py-1.5 flex-wrap border-b border-border-subtle">
            <button
              onClick={() => { setCategory(null); setSearch('') }}
              className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                !category ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
              }`}
            >
              全部
            </button>
            {componentCategories.map(([cat, info]) => (
              <button
                key={cat}
                onClick={() => { setCategory(cat); setSearch('') }}
                className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  category === cat ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
                }`}
              >
                {info.nameCn} ({info.count})
              </button>
            ))}
          </div>
          {/* 组件列表 */}
          <div className="flex-1 overflow-y-auto px-2 py-1.5">
            {search.trim() || category ? (
              <>
                {filteredComponents.map((c) => {
                  const isSelected = selectedComponentIds.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleComponent(c.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                        isSelected ? 'bg-accent/10' : 'hover:bg-bg-hover'
                      }`}
                    >
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent/10">
                        <Box size={10} className="text-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs font-medium truncate ${isSelected ? 'text-accent' : 'text-text-primary'}`}>{c.nameCn}</span>
                        <span className="ml-1.5 text-[9px] text-text-muted">{c.id}</span>
                      </div>
                      {isSelected && <Check size={13} className="flex-shrink-0 text-accent" />}
                    </button>
                  )
                })}
                {filteredComponents.length === 0 && (
                  <div className="py-6 text-center text-xs text-text-muted">未找到匹配的组件</div>
                )}
              </>
            ) : (
              groupedComponents.map(([cat, comps]) => {
                const collapsed = collapsedCats.has(cat)
                const catCn = comps[0]?.categoryCn || cat
                return (
                  <div key={cat} className="mb-0.5">
                    <button
                      onClick={() => setCollapsedCats(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n })}
                      className="flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-bg-hover rounded-md transition-colors"
                    >
                      <ChevronDown size={10} className={`text-text-muted transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                      <span className="text-[11px] font-medium text-text-secondary">{catCn}</span>
                      <span className="text-[9px] text-text-muted">{comps.length}</span>
                    </button>
                    {!collapsed && (
                      <div className="space-y-0.5 px-1 pb-1">
                        {comps.map((c) => {
                          const isSelected = selectedComponentIds.includes(c.id)
                          return (
                            <button
                              key={c.id}
                              onClick={() => toggleComponent(c.id)}
                              className={`flex w-full items-center gap-2 rounded-lg pl-7 pr-2 py-1.5 text-left transition-colors ${
                                isSelected ? 'bg-accent/10' : 'hover:bg-bg-hover'
                              }`}
                            >
                              <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-accent/10">
                                <Box size={8} className="text-accent" />
                              </div>
                              <span className={`text-[11px] font-medium truncate ${isSelected ? 'text-accent' : 'text-text-primary'}`}>{c.nameCn}</span>
                              <span className="text-[9px] text-text-muted truncate">{c.id}</span>
                              {isSelected && <Check size={12} className="flex-shrink-0 text-accent" />}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
          {/* 底部已选标签 */}
          {selectedComponentIds.length > 0 && (
            <div className="border-t border-border-subtle px-3 py-2">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-text-muted">已选({selectedComponentIds.length})：</span>
                {selectedComponents.slice(0, 4).map((c) => (
                  <span key={c.id} className="chip flex items-center gap-0.5 px-1.5 py-0 text-[9px] text-accent border-accent/30 bg-accent/10">
                    <Box size={8} />
                    {c.nameCn}
                    <button onClick={(e) => { e.stopPropagation(); toggleComponent(c.id) }} className="ml-0.5 hover:text-red-400 transition-colors">
                      <X size={8} />
                    </button>
                  </span>
                ))}
                {selectedComponentIds.length > 4 && (
                  <span className="text-[9px] text-text-muted">+{selectedComponentIds.length - 4}</span>
                )}
                <button onClick={() => clearSelectedComponents()} className="ml-1 text-[9px] text-text-muted hover:text-red-400 transition-colors">
                  清空
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
