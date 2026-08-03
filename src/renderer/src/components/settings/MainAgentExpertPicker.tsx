import { useState, useEffect, useMemo } from 'react'
import { Users, Search } from 'lucide-react'
import { ensureAgentsLoaded, getAgentById, searchAgents, ALL_AGENTS } from '@renderer/agents'

export function MainAgentExpertPicker({ selectedId, onSelect }: {
  selectedId: string | undefined
  onSelect: (id: string | undefined) => void
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (open && !ready) {
      ensureAgentsLoaded().then(() => setReady(true))
    }
  }, [open, ready])

  const selected = selectedId ? getAgentById(selectedId) : undefined

  const filtered = useMemo(() => {
    if (!ready) return []
    if (search.trim()) return searchAgents(search)
    return ALL_AGENTS.slice(0, 50)
  }, [search, ready])

  return (
    <div className="ios-card p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={selected ? 'text-accent' : 'text-text-muted'}><Users size={15} /></span>
          <div>
            <p className="text-sm font-medium text-text-primary">专家注入</p>
            <p className="text-xs text-text-muted">
              {selected ? `${selected.emoji} ${selected.name}` : '未选择专家，主 Agent 使用默认行为'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {selected && (
            <button
              onClick={() => onSelect(undefined)}
              className="rounded-lg px-2 py-1 text-xs text-text-muted hover:text-red-400 transition-colors"
            >
              清除
            </button>
          )}
          <button
            onClick={() => setOpen(!open)}
            className="rounded-lg bg-bg-elevated px-3 py-1.5 text-xs text-text-primary hover:bg-bg-hover transition-colors"
          >
            {open ? '收起' : '选择'}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-input px-2.5 py-1.5">
            <Search size={13} className="text-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索专家..."
              className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto space-y-1">
            {!ready ? (
              <div className="py-4 text-center text-xs text-text-muted">加载中...</div>
            ) : filtered.length === 0 ? (
              <div className="py-4 text-center text-xs text-text-muted">未找到匹配的专家</div>
            ) : (
              filtered.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => { onSelect(agent.id); setOpen(false) }}
                  className={`flex w-full items-center gap-2 rounded-lg p-2 text-left transition-colors ${
                    selectedId === agent.id ? 'bg-accent/15 text-accent' : 'hover:bg-bg-hover'
                  }`}
                >
                  <span className="text-base flex-shrink-0">{agent.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{agent.name}</p>
                    <p className="text-[10px] text-text-muted truncate">{agent.description}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
