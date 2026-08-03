import { useState, useMemo, useCallback } from 'react'
import { ChevronDown, ChevronRight, Search, Palette } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import type { StyleEntry } from '@shared/types'
import designSystemsCatalog from './design-systems-catalog.json'
import { SearchBox, BackButton, Section, ColorSwatch, UseButton, EmptyState } from './template-shared'

const STYLES = designSystemsCatalog as StyleEntry[]

export function StylesTab(): React.ReactElement {
  const sendMessage = useStore((s) => s.sendMessage)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set())

  const grouped = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const filtered = q ? STYLES.filter(s => s.id.includes(q) || s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q)) : STYLES
    const groups: Record<string, StyleEntry[]> = {}
    for (const s of filtered) { if (!groups[s.category]) groups[s.category] = []; groups[s.category].push(s) }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [searchQuery])

  const handleUse = useCallback((s: StyleEntry) => {
    sendMessage(`请使用设计风格系统生成 UI。先用 design_style(action="get", style_id="${s.id}") 获取风格上下文（DESIGN.md 设计指南 + tokens.css CSS 变量），然后将 :root { ... } 粘贴到 HTML <style> 中，所有样式引用 var(--name)。\n\n请基于 ${s.name} 风格生成：[请描述你要生成的页面或组件]`)
  }, [sendMessage])

  const selected = STYLES.find(s => s.id === selectedId)

  if (selected) return <StyleDetail style={selected} onBack={() => setSelectedId(null)} onUse={() => handleUse(selected)} />

  const toggleCat = (cat: string) => setCollapsedCats(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n })

  return (
    <>
      <div className="px-1.5 py-1.5 border-b border-border-subtle shrink-0">
        <SearchBox value={searchQuery} onChange={setSearchQuery} placeholder={`搜索 ${STYLES.length} 个风格...`} />
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-1">
        {grouped.map(([category, styles]) => {
          const collapsed = collapsedCats.has(category)
          return (
            <div key={category} className="mb-0.5">
              <button onClick={() => toggleCat(category)} className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left transition-colors hover:bg-bg-elevated/50">
                {collapsed ? <ChevronRight size={10} className="text-text-muted" /> : <ChevronDown size={10} className="text-text-muted" />}
                <span className="text-[10px] font-semibold text-text-secondary truncate">{category}</span>
                <span className="ml-auto rounded-full bg-bg-elevated/80 px-1 text-[8px] text-text-muted">{styles.length}</span>
              </button>
              {!collapsed && (
                <div className="grid grid-cols-1 gap-0.5 px-1 pb-1">
                  {styles.map(s => <StyleRow key={s.id} style={s} onClick={() => setSelectedId(s.id)} />)}
                </div>
              )}
            </div>
          )
        })}
        {grouped.length === 0 && <EmptyState icon={Search} text="未找到匹配的风格" />}
      </div>
    </>
  )
}

// ─── 风格行 ────────────────────────────────────────────

function StyleRow({ style, onClick }: { style: StyleEntry; onClick: () => void }): React.ReactElement {
  const accent = style.tokens.accent || '#666'
  const bg = style.tokens.bg || '#fff'
  const fg = style.tokens.fg || '#111'

  const isDark = useMemo(() => {
    const hex = bg.replace('#', '')
    if (hex.length < 6) return false
    const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16)
    return (r + g + b) / 3 < 128
  }, [bg])

  return (
    <button onClick={onClick} title={style.name} className="group flex items-center gap-1.5 rounded-md border border-border-subtle bg-bg-elevated/40 px-1.5 py-1 transition-all hover:border-accent/30 hover:bg-bg-elevated/70 active:scale-95">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded ring-1 ring-white/10" style={{ backgroundColor: bg }}>
        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />
      </div>
      <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-text-primary group-hover:text-accent transition-colors">{style.name}</span>
      <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: fg, opacity: 0.4 }} />
    </button>
  )
}

// ─── 风格详情 ──────────────────────────────────────────

function StyleDetail({ style, onBack, onUse }: { style: StyleEntry; onBack: () => void; onUse: () => void }): React.ReactElement {
  const accent = style.tokens.accent || '#666', bg = style.tokens.bg || '#fff', fg = style.tokens.fg || '#111', surface = style.tokens.surface || '#f5f5f5'
  return (
    <div className="flex flex-col p-2 overflow-y-auto">
      <BackButton onBack={onBack} />
      <div className="rounded-lg overflow-hidden ring-1 ring-white/5">
        <div className="flex items-center gap-2 p-2.5" style={{ backgroundColor: bg, color: fg }}>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: surface }}>
            <Palette size={18} style={{ color: accent }} />
          </div>
          <div>
            <h3 className="text-xs font-semibold">{style.name}</h3>
            <p className="text-[9px] opacity-60">{style.category}</p>
          </div>
        </div>
      </div>
      <Section title="风格 ID"><code className="rounded bg-bg-elevated/80 px-1.5 py-0.5 text-[10px] text-accent">{style.id}</code></Section>
      <Section title="核心色板">
        <div className="grid grid-cols-1 gap-1">
          <ColorSwatch label="Accent" value={accent} />
          <ColorSwatch label="Background" value={bg} />
          <ColorSwatch label="Foreground" value={fg} />
          <ColorSwatch label="Surface" value={surface} />
        </div>
      </Section>
      <Section title="使用方法">
        <div className="space-y-1">
          {['调用 design_style 获取 tokens.css', '粘贴 :root { ... } 到 <style>', '用 var(--accent) 等变量'].map((text, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[8px] font-semibold text-accent">{i + 1}</span>
              <span className="text-[10px] leading-relaxed text-text-secondary">{text}</span>
            </div>
          ))}
        </div>
      </Section>
      <UseButton onClick={onUse} label={`使用 ${style.name}`} />
    </div>
  )
}
