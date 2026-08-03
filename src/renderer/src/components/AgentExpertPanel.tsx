import { useState, useMemo, useEffect } from 'react'
import { X, Search, ChevronRight, Users, Sparkles, Star } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { AGENT_DIVISIONS, AGENTS_BY_DIVISION, searchAgents, getAgentById, ensureAgentsLoaded } from '@renderer/agents'
import type { AgentExpert } from '@shared/types'

/**
 * AgentExpertPanel — AI 专家库面板（替换原插件市场）
 * 展示 254 位来自 agency-agents 的 AI 专家，可激活为实际可用的专家
 */
export function AgentExpertPanel(): React.ReactElement | null {
  const showAgentPanel = useStore((s) => s.showAgentPanel)
  const setShowAgentPanel = useStore((s) => s.setShowAgentPanel)
  const activeExperts = useStore((s) => s.activeExperts)
  const toggleExpert = useStore((s) => s.toggleExpert)

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDivision, setSelectedDivision] = useState<string | null>(null)
  const [agentsReady, setAgentsReady] = useState(false)

  // 面板打开时加载专家数据
  useEffect(() => {
    if (showAgentPanel && !agentsReady) {
      ensureAgentsLoaded().then(() => setAgentsReady(true))
    }
  }, [showAgentPanel, agentsReady])

  const filteredAgents = useMemo(() => {
    if (searchQuery.trim()) {
      return searchAgents(searchQuery)
    }
    if (selectedDivision) {
      return AGENTS_BY_DIVISION[selectedDivision] ?? []
    }
    return []
  }, [searchQuery, selectedDivision])

  const handleActivate = (agent: AgentExpert): void => {
    toggleExpert(agent.id)
  }

  if (!showAgentPanel) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={() => setShowAgentPanel(false)}
    >
      <div
        className="glass-panel flex h-[85vh] w-[900px] max-w-[95vw] flex-col overflow-hidden animate-fade-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-muted shadow-lg shadow-accent/20">
              <Users size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">AI 专家库</h2>
              <p className="text-xs text-text-muted">254 位专家 · 17 个部门 · 一键激活</p>
            </div>
          </div>
          <button onClick={() => setShowAgentPanel(false)} className="icon-btn rounded-lg p-1.5">
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* 左侧：部门列表 */}
          <nav className="glass w-52 flex-shrink-0 border-r border-border-subtle overflow-y-auto p-2">
            <div className="mb-2 px-2">
              <div className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-input px-2.5 py-1.5">
                <Search size={13} className="text-text-muted" />
                <input
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setSelectedDivision(null) }}
                  placeholder="搜索专家..."
                  className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
                />
              </div>
            </div>
            {AGENT_DIVISIONS.map((div) => {
              const count = AGENTS_BY_DIVISION[div.key]?.length ?? 0
              const activeCount = (AGENTS_BY_DIVISION[div.key] ?? []).filter(a => activeExperts.includes(a.id)).length
              const isSelected = selectedDivision === div.key
              return (
                <button
                  key={div.key}
                  onClick={() => { setSelectedDivision(isSelected ? null : div.key); setSearchQuery('') }}
                  className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isSelected
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                  }`}
                >
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold"
                    style={{ backgroundColor: div.color + '20', color: div.color }}
                  >
                    {div.label[0]}
                  </span>
                  <span className="flex-1 text-left truncate">{div.label}</span>
                  <span className="text-[10px] text-text-muted">{count}</span>
                  {activeCount > 0 && (
                    <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent/20 px-1 text-[9px] font-bold text-accent">
                      {activeCount}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          {/* 右侧：专家列表 */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {searchQuery.trim() ? (
              <div>
                <p className="mb-3 text-xs text-text-muted">
                  搜索「{searchQuery}」— 找到 {filteredAgents.length} 位专家
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {filteredAgents.map((agent) => (
                    <AgentCard key={agent.id} agent={agent} isActive={activeExperts.includes(agent.id)} onActivate={handleActivate} />
                  ))}
                </div>
                {filteredAgents.length === 0 && (
                  <div className="mt-12 text-center text-sm text-text-muted">未找到匹配的专家</div>
                )}
              </div>
            ) : selectedDivision ? (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold"
                    style={{ backgroundColor: AGENT_DIVISIONS.find(d => d.key === selectedDivision)?.color + '20', color: AGENT_DIVISIONS.find(d => d.key === selectedDivision)?.color }}
                  >
                    {AGENT_DIVISIONS.find(d => d.key === selectedDivision)?.label[0]}
                  </span>
                  <h3 className="text-sm font-semibold text-text-primary">
                    {AGENT_DIVISIONS.find(d => d.key === selectedDivision)?.label}
                  </h3>
                  <span className="text-xs text-text-muted">{filteredAgents.length} 位专家</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {filteredAgents.map((agent) => (
                    <AgentCard key={agent.id} agent={agent} isActive={activeExperts.includes(agent.id)} onActivate={handleActivate} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                  <Sparkles size={28} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">选择部门或搜索专家</h3>
                  <p className="mt-1.5 text-sm text-text-muted max-w-md">
                    从左侧选择部门浏览专家，或使用搜索框直接查找。激活专家后，AI 将以该专家的专业视角回答问题。
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap justify-center gap-2">
                  {AGENT_DIVISIONS.slice(0, 6).map((div) => (
                    <button
                      key={div.key}
                      onClick={() => setSelectedDivision(div.key)}
                      className="chip flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary hover:border-accent/30 hover:text-accent transition-all"
                    >
                      <span style={{ color: div.color }}>{div.label[0]}</span>
                      {div.label}
                      <span className="text-text-muted">({AGENTS_BY_DIVISION[div.key]?.length ?? 0})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 底部：已激活专家状态 */}
        {activeExperts.length > 0 && (
          <div className="flex items-center gap-2 border-t border-border-subtle px-4 py-2.5">
            <Star size={13} className="text-accent" />
            <span className="text-xs text-text-muted">已激活 {activeExperts.length} 位专家：</span>
            <div className="flex flex-1 flex-wrap gap-1 overflow-hidden">
              {activeExperts.slice(0, 5).map((id) => {
                const agent = getAgentById(id)
                if (!agent) return null
                return (
                  <span key={id} className="chip flex items-center gap-1 px-2 py-0.5 text-[10px] text-accent border-accent/30 bg-accent/10">
                    {agent.emoji} {agent.name}
                  </span>
                )
              })}
              {activeExperts.length > 5 && (
                <span className="text-[10px] text-text-muted">+{activeExperts.length - 5} 更多</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** 专家卡片 */
function AgentCard({ agent, isActive, onActivate }: { agent: AgentExpert; isActive: boolean; onActivate: (a: AgentExpert) => void }): React.ReactElement {
  const divInfo = AGENT_DIVISIONS.find(d => d.key === agent.division)
  return (
    <div
      className={`ios-card flex items-start gap-3 p-3 transition-all cursor-pointer ${
        isActive ? 'border-accent/40 shadow-glow' : ''
      }`}
      onClick={() => onActivate(agent)}
    >
      <span className="mt-0.5 text-xl flex-shrink-0">{agent.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-text-primary truncate">{agent.name}</h4>
          {divInfo && (
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium"
              style={{ backgroundColor: divInfo.color + '15', color: divInfo.color }}
            >
              {divInfo.label}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-text-muted line-clamp-2">{agent.description}</p>
        {agent.vibe && (
          <p className="mt-1 text-[11px] italic text-text-muted/70">"{agent.vibe}"</p>
        )}
      </div>
      <button
        className={`mt-0.5 flex-shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${
          isActive
            ? 'bg-accent/20 text-accent'
            : 'bg-bg-hover text-text-secondary hover:bg-accent/10 hover:text-accent'
        }`}
      >
        {isActive ? <Star size={11} /> : <ChevronRight size={11} />}
        {isActive ? '已激活' : '激活'}
      </button>
    </div>
  )
}
