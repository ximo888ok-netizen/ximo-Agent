import { useState, useEffect, useMemo, useRef } from 'react'
import { Users, Search, Check, X } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { AGENT_DIVISIONS, AGENTS_BY_DIVISION, searchAgents, getAgentById, ensureAgentsLoaded } from '@renderer/agents'

export function ExpertPicker(): React.ReactElement {
  const activeExperts = useStore((s) => s.activeExperts)
  const toggleExpert = useStore((s) => s.toggleExpert)

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [division, setDivision] = useState<string | null>(null)
  const [agentsReady, setAgentsReady] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 按需加载专家数据
  useEffect(() => {
    if (open && !agentsReady) {
      ensureAgentsLoaded().then(() => setAgentsReady(true))
    }
  }, [open, agentsReady])

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const expertResults = useMemo(() => {
    if (search.trim()) return searchAgents(search)
    if (division) return AGENTS_BY_DIVISION[division] ?? []
    return []
  }, [search, division])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(!open); setSearch(''); setDivision(null) }}
        className={`chip flex items-center gap-1 px-2 py-0.5 text-[11px] transition-all duration-200 active:scale-95 ${
          activeExperts.length > 0
            ? 'border-accent/30 text-accent bg-accent/10'
            : open
              ? 'border-accent/40 text-accent bg-accent/8'
              : 'text-text-muted hover:text-text-secondary'
        }`}
        title="选择AI专家"
      >
        <Users size={12} />
        专家{activeExperts.length > 0 ? `(${activeExperts.length})` : ''}
      </button>

      {/* 专家选择弹出面板 */}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-[440px] max-h-[480px] rounded-xl border border-border-subtle bg-bg-elevated shadow-glass animate-fade-scale flex flex-col overflow-hidden z-50">
          {/* 搜索栏 */}
          <div className="px-3 py-2 border-b border-border-subtle">
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-input px-2 py-1">
              <Search size={12} className="text-text-muted" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setDivision(null) }}
                placeholder="搜索专家名称或描述..."
                className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
              />
            </div>
          </div>
          {/* 部门标签行 */}
          <div className="flex gap-1 px-3 py-1.5 flex-wrap border-b border-border-subtle">
            <button
              onClick={() => { setDivision(null); setSearch('') }}
              className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                !division ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
              }`}
            >
              全部
            </button>
            {AGENT_DIVISIONS.map((div) => (
              <button
                key={div.key}
                onClick={() => { setDivision(div.key); setSearch('') }}
                className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  division === div.key ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
                }`}
              >
                {div.label}
              </button>
            ))}
          </div>
          {/* 专家列表 */}
          <div className="flex-1 overflow-y-auto px-2 py-1.5">
            {search.trim() || division ? (
              <>
                {expertResults.map((agent) => {
                  const isActive = activeExperts.includes(agent.id)
                  return (
                    <button
                      key={agent.id}
                      onClick={() => toggleExpert(agent.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                        isActive ? 'bg-accent/10' : 'hover:bg-bg-hover'
                      }`}
                    >
                      <span className="text-base flex-shrink-0">{agent.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-medium truncate ${isActive ? 'text-accent' : 'text-text-primary'}`}>{agent.name}</span>
                        </div>
                        <p className="text-[10px] text-text-muted truncate">{agent.description}</p>
                      </div>
                      {isActive && <Check size={13} className="flex-shrink-0 text-accent" />}
                    </button>
                  )
                })}
                {expertResults.length === 0 && (
                  <div className="py-6 text-center text-xs text-text-muted">未找到匹配的专家</div>
                )}
              </>
            ) : (
              // 默认模式：按部门分组，每部门展示前 2 位
              AGENT_DIVISIONS.map((div) => {
                const agents = (AGENTS_BY_DIVISION[div.key] ?? []).slice(0, 2)
                if (agents.length === 0) return null
                return (
                  <div key={div.key} className="mb-1">
                    <button
                      onClick={() => setDivision(div.key)}
                      className="flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-bg-hover rounded-md transition-colors"
                    >
                      <span
                        className="flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold"
                        style={{ backgroundColor: div.color + '20', color: div.color }}
                      >
                        {div.label[0]}
                      </span>
                      <span className="text-[11px] font-medium text-text-secondary">{div.label}</span>
                      <span className="text-[9px] text-text-muted">{AGENTS_BY_DIVISION[div.key]?.length ?? 0}</span>
                    </button>
                    {agents.map((agent) => {
                      const isActive = activeExperts.includes(agent.id)
                      return (
                        <button
                          key={agent.id}
                          onClick={() => toggleExpert(agent.id)}
                          className={`flex w-full items-center gap-2 rounded-lg pl-8 pr-2 py-1.5 text-left transition-colors ${
                            isActive ? 'bg-accent/10' : 'hover:bg-bg-hover'
                          }`}
                        >
                          <span className="text-sm flex-shrink-0">{agent.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <span className={`text-[11px] font-medium truncate ${isActive ? 'text-accent' : 'text-text-primary'}`}>{agent.name}</span>
                          </div>
                          {isActive && <Check size={12} className="flex-shrink-0 text-accent" />}
                        </button>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>
          {/* 底部已选标签 */}
          {activeExperts.length > 0 && (
            <div className="border-t border-border-subtle px-3 py-2">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-text-muted">已选：</span>
                {activeExperts.slice(0, 5).map((id) => {
                  const agent = getAgentById(id)
                  if (!agent) return null
                  return (
                    <span key={id} className="chip flex items-center gap-0.5 px-1.5 py-0 text-[9px] text-accent border-accent/30 bg-accent/10">
                      {agent.emoji} {agent.name}
                      <button onClick={(e) => { e.stopPropagation(); toggleExpert(id) }} className="ml-0.5 hover:text-red-400 transition-colors">
                        <X size={8} />
                      </button>
                    </span>
                  )
                })}
                {activeExperts.length > 5 && (
                  <span className="text-[9px] text-text-muted">+{activeExperts.length - 5}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
