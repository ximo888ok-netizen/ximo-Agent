import { useState, useMemo } from 'react'
import { Search, Check, Globe } from 'lucide-react'
import type { StyleEntry, ScenarioEntry, LayoutTemplate } from './types'
import { SCENARIO_ICONS, BLOCK_COLORS } from './constants'

// ─── 场景选择器弹窗 ────────────────────────────────────

export function ScenarioPicker({ scenarios, selectedId, onSelect, onClose }: {
  scenarios: ScenarioEntry[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onClose: () => void
}): React.ReactElement {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-panel border border-border-subtle bg-bg-surface shadow-xl">
        <div className="p-1.5">
          {/* 清除按钮 */}
          {selectedId && (
            <button
              onClick={() => onSelect(null)}
              className="mb-1 w-full rounded-control px-2 py-1 text-left text-caption text-text-muted hover:bg-bg-elevated active:scale-[0.97]"
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
                className={`flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left transition-colors ${
                  isSelected ? 'bg-accent/10' : 'hover:bg-bg-elevated'
                }`}
              >
                <Icon size={13} className={isSelected ? 'text-accent' : 'text-text-muted'} />
                <div className="flex-1">
                  <span className={`text-caption font-medium ${isSelected ? 'text-accent' : 'text-text-primary'}`}>
                    {scenario.name}
                  </span>
                  <span className="ml-1 text-caption text-text-muted">
                    {scenario.layouts.length} 布局
                  </span>
                </div>
                {isSelected && <Check size={13} className="text-accent" />}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ─── 布局模板卡片 ──────────────────────────────────────

export function LayoutCard({ layout, onApply }: {
  layout: LayoutTemplate
  onApply: () => void
}): React.ReactElement {
  return (
    <button aria-label={layout.desc}
      onClick={onApply}
      className="group shrink-0 w-36 rounded-card border border-border-subtle bg-bg-surface p-1.5 text-left transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] hover:border-accent/40 hover:shadow-md hover:scale-[1.02] active:scale-95"
      title={layout.desc}
    >
      {/* 迷你布局预览 */}
      <div className="mb-1.5 h-12 rounded-control bg-bg-base-soft overflow-hidden relative">
        <div className="absolute inset-1 flex flex-col gap-0.5">
          {layout.blocks.map((block, i) => (
            <div
              key={i}
              className="rounded-control transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] group-hover:opacity-80"
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
                  <div className="flex-1 rounded-control" style={{ backgroundColor: BLOCK_COLORS[block] || '#64748b' }} />
                  <div className="flex-1 rounded-control" style={{ backgroundColor: BLOCK_COLORS[block] || '#64748b' }} />
                  <div className="flex-1 rounded-control" style={{ backgroundColor: BLOCK_COLORS[block] || '#64748b' }} />
                  {block === 'grid4' && <div className="flex-1 rounded-control" style={{ backgroundColor: BLOCK_COLORS[block] || '#64748b' }} />}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      {/* 名称和描述 */}
      <div className="text-caption font-medium text-text-primary truncate">{layout.name}</div>
      <div className="text-caption text-text-muted truncate mt-0.5">{layout.desc}</div>
    </button>
  )
}

// ─── 风格选择器弹窗 ────────────────────────────────────

export function StylePicker({ styles, selectedId, onSelect, onClose }: {
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
      <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-panel border border-border-subtle bg-bg-surface shadow-xl">
        <div className="p-2">
          <div className="relative mb-1.5">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索风格..."
              className="w-full rounded-control bg-bg-elevated-soft py-1 pl-7 pr-2 text-caption focus-ring focus:ring-1 focus:ring-accent/30"
            />
          </div>

          {selectedId && (
            <button
              onClick={() => onSelect(null)}
              className="mb-1 w-full rounded-control px-2 py-1 text-left text-caption text-text-muted hover:bg-bg-elevated active:scale-[0.97]"
            >
              ✕ 清除风格绑定
            </button>
          )}

          <div className="max-h-48 overflow-y-auto">
            {filtered.map(style => (
              <button
                key={style.id}
                onClick={() => onSelect(style.id)}
                className={`flex w-full items-center gap-2 rounded-control px-2 py-1 text-left transition-colors ${
                  selectedId === style.id ? 'bg-accent/10' : 'hover:bg-bg-elevated'
                }`}
              >
                <div className="flex h-4 w-8 shrink-0 overflow-hidden rounded-control">
                  <div className="flex-1" style={{ backgroundColor: style.tokens.accent }} />
                  <div className="flex-1" style={{ backgroundColor: style.tokens.bg }} />
                  <div className="flex-1" style={{ backgroundColor: style.tokens.surface }} />
                </div>
                <span className={`flex-1 truncate text-caption ${selectedId === style.id ? 'text-accent font-medium' : 'text-text-secondary'}`}>
                  {style.name}
                </span>
                <span className="text-caption text-text-muted">{style.category}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
