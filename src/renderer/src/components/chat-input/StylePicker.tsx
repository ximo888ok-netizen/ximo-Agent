import { useState, useEffect, useMemo, useRef } from 'react'
import { Palette, Search, Check, X, ChevronDown } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { STYLE_CATALOG } from './constants'

export function StylePicker(): React.ReactElement {
  const activeStyleId = useStore((s) => s.activeStyleId)
  const setActiveStyleId = useStore((s) => s.setActiveStyleId)

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

  const styleCategories = useMemo(() => {
    const cats: Record<string, number> = {}
    for (const s of STYLE_CATALOG) { cats[s.category] = (cats[s.category] || 0) + 1 }
    return Object.entries(cats).sort(([, a], [, b]) => b - a)
  }, [])

  const filteredStyles = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = STYLE_CATALOG
    if (category) list = list.filter((s) => s.category === category)
    if (q) list = list.filter((s) => s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q))
    return list
  }, [search, category])

  const groupedStyles = useMemo(() => {
    const groups: Record<string, typeof STYLE_CATALOG> = {}
    for (const s of filteredStyles) { if (!groups[s.category]) groups[s.category] = []; groups[s.category].push(s) }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [filteredStyles])

  const activeStyle = useMemo(() => STYLE_CATALOG.find((s) => s.id === activeStyleId) ?? null, [activeStyleId])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(!open); setSearch(''); setCategory(null) }}
        className={`chip flex items-center gap-1 px-2 py-0.5 text-[11px] transition-all duration-200 active:scale-95 ${
          activeStyleId
            ? 'border-accent/30 text-accent bg-accent/10'
            : open
              ? 'border-accent/40 text-accent bg-accent/8'
              : 'text-text-muted hover:text-text-secondary'
        }`}
        title="绑定设计风格"
      >
        <Palette size={12} />
        风格{activeStyleId ? '' : ''}
      </button>

      {/* 风格选择弹出面板 */}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-[420px] max-h-[480px] rounded-xl border border-border-subtle bg-bg-elevated shadow-glass animate-fade-scale flex flex-col overflow-hidden z-50">
          {/* 搜索栏 */}
          <div className="px-3 py-2 border-b border-border-subtle">
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-input px-2 py-1">
              <Search size={12} className="text-text-muted" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCategory(null) }}
                placeholder={`搜索 ${STYLE_CATALOG.length} 个设计风格...`}
                className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
              />
            </div>
          </div>
          {/* 分类标签行 */}
          <div className="flex gap-1 px-3 py-1.5 flex-wrap border-b border-border-subtle max-h-[100px] overflow-y-auto">
            <button
              onClick={() => { setCategory(null); setSearch('') }}
              className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                !category ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
              }`}
            >
              全部
            </button>
            {styleCategories.map(([cat, count]) => (
              <button
                key={cat}
                onClick={() => { setCategory(cat); setSearch('') }}
                className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  category === cat ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
                }`}
              >
                {cat} ({count})
              </button>
            ))}
          </div>
          {/* 风格列表 */}
          <div className="flex-1 overflow-y-auto px-2 py-1.5">
            {search.trim() || category ? (
              <>
                {filteredStyles.map((s) => {
                  const isActive = s.id === activeStyleId
                  const accent = s.tokens.accent || '#666'
                  const bg = s.tokens.bg || '#fff'
                  return (
                    <button
                      key={s.id}
                      onClick={() => { setActiveStyleId(isActive ? null : s.id); if (!isActive) setOpen(false) }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                        isActive ? 'bg-accent/10' : 'hover:bg-bg-hover'
                      }`}
                    >
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded ring-1 ring-white/10" style={{ backgroundColor: bg }}>
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs font-medium truncate ${isActive ? 'text-accent' : 'text-text-primary'}`}>{s.name}</span>
                        <span className="ml-1.5 text-[9px] text-text-muted">{s.category}</span>
                      </div>
                      {isActive && <Check size={13} className="flex-shrink-0 text-accent" />}
                    </button>
                  )
                })}
                {filteredStyles.length === 0 && (
                  <div className="py-6 text-center text-xs text-text-muted">未找到匹配的风格</div>
                )}
              </>
            ) : (
              groupedStyles.map(([cat, styles]) => {
                const collapsed = collapsedCats.has(cat)
                return (
                  <div key={cat} className="mb-0.5">
                    <button
                      onClick={() => setCollapsedCats(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n })}
                      className="flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-bg-hover rounded-md transition-colors"
                    >
                      <ChevronDown size={10} className={`text-text-muted transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                      <span className="text-[11px] font-medium text-text-secondary">{cat}</span>
                      <span className="text-[9px] text-text-muted">{styles.length}</span>
                    </button>
                    {!collapsed && (
                      <div className="space-y-0.5 px-1 pb-1">
                        {styles.map((s) => {
                          const isActive = s.id === activeStyleId
                          const accent = s.tokens.accent || '#666'
                          const bg = s.tokens.bg || '#fff'
                          return (
                            <button
                              key={s.id}
                              onClick={() => { setActiveStyleId(isActive ? null : s.id); if (!isActive) setOpen(false) }}
                              className={`flex w-full items-center gap-2 rounded-lg pl-7 pr-2 py-1.5 text-left transition-colors ${
                                isActive ? 'bg-accent/10' : 'hover:bg-bg-hover'
                              }`}
                            >
                              <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded ring-1 ring-white/10" style={{ backgroundColor: bg }}>
                                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
                              </div>
                              <span className={`text-[11px] font-medium truncate ${isActive ? 'text-accent' : 'text-text-primary'}`}>{s.name}</span>
                              {isActive && <Check size={12} className="flex-shrink-0 text-accent" />}
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
          {activeStyleId && activeStyle && (
            <div className="border-t border-border-subtle px-3 py-2">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-text-muted">已绑定：</span>
                <span className="chip flex items-center gap-0.5 px-1.5 py-0 text-[9px] text-accent border-accent/30 bg-accent/10">
                  <Palette size={8} />
                  {activeStyle.name}
                  <button onClick={(e) => { e.stopPropagation(); setActiveStyleId(null) }} className="ml-0.5 hover:text-red-400 transition-colors">
                    <X size={8} />
                  </button>
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
