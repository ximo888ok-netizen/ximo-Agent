import { useMemo } from 'react'
import { BarChart3, X, TrendingUp, MessageSquare, Coins } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import type { Mode } from '@shared/types'

const MODE_LABELS: Record<Mode, string> = {
  office: '办公',
  coding: '编程',
  design: '设计'
}

const MODE_COLORS: Record<Mode, string> = {
  office: 'text-blue-400',
  coding: 'text-emerald-400',
  design: 'text-purple-400'
}

/** Token 统计面板 — 汇总全量对话的 token 用量 */
export function TokenStatsModal(): React.ReactElement | null {
  const show = useStore((s) => s.showTokenStats)
  const setShow = useStore((s) => s.setShowTokenStats)
  const conversations = useStore((s) => s.conversations)

  const stats = useMemo(() => {
    let totalTokens = 0
    let totalMessages = 0
    let totalAssistant = 0
    const byMode: Record<string, number> = { office: 0, coding: 0, design: 0 }
    const byDay: Record<string, number> = {}

    for (const conv of conversations) {
      for (const msg of conv.messages) {
        totalMessages++
        if (msg.role === 'assistant') totalAssistant++
        if (msg.tokens) {
          totalTokens += msg.tokens
          byMode[conv.mode] = (byMode[conv.mode] ?? 0) + msg.tokens
          const day = new Date(msg.timestamp).toLocaleDateString('zh-CN')
          byDay[day] = (byDay[day] ?? 0) + msg.tokens
        }
      }
    }

    const sortedDays = Object.entries(byDay).sort((a, b) => b[1] - a[1]).slice(0, 7)
    const maxDayTokens = sortedDays.length > 0 ? sortedDays[0][1] : 1

    return { totalTokens, totalMessages, totalAssistant, byMode, sortedDays, maxDayTokens }
  }, [conversations])

  if (!show) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md animate-fade-in"
      onClick={() => setShow(false)}
    >
      <div
        className="glass-panel mx-4 w-full max-w-lg p-6 animate-fade-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <BarChart3 size={16} />
            </div>
            <h3 className="text-sm font-semibold text-text-primary">Token 用量统计</h3>
          </div>
          <button onClick={() => setShow(false)} className="icon-btn rounded-lg p-1">
            <X size={16} />
          </button>
        </div>

        {/* 汇总卡片 */}
        <div className="mb-5 grid grid-cols-3 gap-3">
          <div className="ios-card p-3 text-center">
            <Coins size={16} className="mx-auto mb-1 text-accent" />
            <div className="text-lg font-bold text-text-primary">{stats.totalTokens.toLocaleString()}</div>
            <div className="text-[10px] text-text-muted">总 Tokens</div>
          </div>
          <div className="ios-card p-3 text-center">
            <MessageSquare size={16} className="mx-auto mb-1 text-blue-400" />
            <div className="text-lg font-bold text-text-primary">{stats.totalMessages}</div>
            <div className="text-[10px] text-text-muted">总消息数</div>
          </div>
          <div className="ios-card p-3 text-center">
            <TrendingUp size={16} className="mx-auto mb-1 text-emerald-400" />
            <div className="text-lg font-bold text-text-primary">{stats.totalAssistant}</div>
            <div className="text-[10px] text-text-muted">AI 回复</div>
          </div>
        </div>

        {/* 按模式分布 */}
        <div className="mb-5">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">按模式分布</h4>
          <div className="space-y-2">
            {(['office', 'coding', 'design'] as Mode[]).map((mode) => {
              const tokens = stats.byMode[mode] ?? 0
              const percent = stats.totalTokens > 0 ? (tokens / stats.totalTokens) * 100 : 0
              return (
                <div key={mode} className="flex items-center gap-2">
                  <span className={`w-10 text-xs font-medium ${MODE_COLORS[mode]}`}>{MODE_LABELS[mode]}</span>
                  <div className="relative h-6 flex-1 overflow-hidden rounded-lg bg-bg-surface border border-border-subtle">
                    <div
                      className="absolute inset-y-0 left-0 rounded-lg bg-accent/20 transition-all duration-500"
                      style={{ width: `${percent}%` }}
                    />
                    <span className="absolute inset-y-0 left-2 flex items-center text-[10px] text-text-secondary">
                      {tokens.toLocaleString()} ({percent.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 按天分布 */}
        {stats.sortedDays.length > 0 && (
          <div>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">近 7 天用量</h4>
            <div className="space-y-1.5">
              {stats.sortedDays.map(([day, tokens]) => (
                <div key={day} className="flex items-center gap-2">
                  <span className="w-20 text-[11px] text-text-muted">{day}</span>
                  <div className="relative h-4 flex-1 overflow-hidden rounded bg-bg-surface border border-border-subtle">
                    <div
                      className="absolute inset-y-0 left-0 rounded bg-accent/15 transition-all duration-500"
                      style={{ width: `${(tokens / stats.maxDayTokens) * 100}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-[10px] text-text-secondary">{tokens.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {stats.totalTokens === 0 && (
          <div className="py-6 text-center text-xs text-text-muted">
            暂无 Token 使用记录
          </div>
        )}
      </div>
    </div>
  )
}
