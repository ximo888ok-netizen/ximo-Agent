import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import type { ComponentMeta } from './types'
import { COMPONENTS } from './constants'
import { ComponentChip } from './ComponentChip'

export function ComponentDock(): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState('')

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

  return (
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
  )
}
