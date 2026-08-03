import { Activity, Database, TrendingUp, MessagesSquare, Gauge } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import type { Conversation } from '@shared/types'

/** DeepSeek-V4 系列上下文窗口大小（1M tokens） */
const CONTEXT_WINDOW = 1_000_000

interface Props {
  conversation: Conversation | null
}

/**
 * 会话级 Token 统计 — 浮动在输入框底部右侧
 *
 * 始终显示会话累计值（D1 不随压缩重置）：
 * - 流式期间 = 会话已有累计 + 当前流式增量
 * - 非流式 = 会话累计
 *
 * 上下文占用为最近一轮 API 调用的 promptTokens（当前上下文窗口实际使用量）。
 * 缓存命中率 = Σhit / Σ(hit+miss)，比单轮更稳定。
 */
export function SessionTokenStats({ conversation }: Props): React.ReactElement {
  const isStreaming = useStore((s) => s.isStreaming)
  const streamingConvId = useStore((s) => s.streamingConversationId)
  const streamingTokens = useStore((s) => s.streamingTokens)
  const streamingCacheHit = useStore((s) => s.streamingCacheHitTokens)
  const streamingCacheMiss = useStore((s) => s.streamingCacheMissTokens)
  const streamingPrompt = useStore((s) => s.streamingPromptTokens)
  const streamingContext = useStore((s) => s.streamingContextTokens)

  const isThisStreaming = isStreaming && streamingConvId === conversation?.id

  // 流式期间：会话已有累计 + 当前流式增量（始终是单会话累计值）
  const convTotal = conversation?.totalTokens ?? 0
  const convCacheHit = conversation?.cacheHitTokens ?? 0
  const convCacheMiss = conversation?.cacheMissTokens ?? 0
  const convPrompt = conversation?.promptTokens ?? 0

  const totalTokens = isThisStreaming
    ? convTotal + (streamingTokens ?? 0)
    : convTotal
  const cacheHitTokens = isThisStreaming
    ? convCacheHit + (streamingCacheHit ?? 0)
    : convCacheHit
  const cacheMissTokens = isThisStreaming
    ? convCacheMiss + (streamingCacheMiss ?? 0)
    : convCacheMiss
  const promptTokens = isThisStreaming
    ? convPrompt + (streamingPrompt ?? 0)
    : convPrompt

  // 上下文窗口占用 — 最近一轮 promptTokens（流式期间优先用最新值）
  const contextTokens = isThisStreaming
    ? (streamingContext ?? 0) || (conversation?.contextTokens ?? 0)
    : (conversation?.contextTokens ?? 0)
  const contextPct = contextTokens > 0 ? (contextTokens / CONTEXT_WINDOW) * 100 : 0
  const contextColor = contextPct >= 80 ? '#ef4444'
    : contextPct >= 60 ? '#f97316'
    : contextPct >= 30 ? '#f59e0b'
    : '#22c55e'

  // D1 聚合命中率 = Σhit / Σ(hit+miss)，比单轮 hit/prompt 更稳定
  const totalCacheDenom = cacheHitTokens + cacheMissTokens
  const hitRate = totalCacheDenom > 0
    ? (cacheHitTokens / totalCacheDenom) * 100
    : (promptTokens > 0 ? (cacheHitTokens / promptTokens) * 100 : 0)

  // 对话轮数 = 用户消息数（每轮以一次用户提问计）
  const turns = conversation?.messages.filter((m) => m.role === 'user').length ?? 0

  return (
    <div className="flex items-center justify-end gap-2.5 px-1 pt-1 text-[11px] shrink-0">
      {/* 上下文窗口占用 */}
      {contextTokens > 0 && (
        <>
          <div className="flex items-center gap-1.5" title={`上下文窗口占用：${contextTokens.toLocaleString()} / ${CONTEXT_WINDOW.toLocaleString()} tokens (${contextPct.toFixed(1)}%)`}>
            <Gauge size={11} className="text-text-muted" />
            <span className="text-text-muted">上下文</span>
            <div className="relative h-1.5 w-16 rounded-full bg-border overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(contextPct, 100)}%`, backgroundColor: contextColor }}
              />
            </div>
            <span className="font-mono" style={{ color: contextColor }}>
              {contextPct.toFixed(1)}%
            </span>
          </div>
          <span className="text-text-muted/20">|</span>
        </>
      )}
      {/* 对话轮数 */}
      <div className="flex items-center gap-1">
        <MessagesSquare size={11} className="text-text-muted" />
        <span className="text-text-muted">轮数</span>
        <span className="font-mono text-text-secondary">{turns > 0 ? turns : '—'}</span>
      </div>
      <span className="text-text-muted/20">|</span>
      {/* 总消耗 */}
      <div className="flex items-center gap-1">
        <Activity size={11} className="text-text-muted" />
        <span className="text-text-muted">总消耗</span>
        <span className="font-mono text-text-secondary">{totalTokens > 0 ? totalTokens.toLocaleString() : '—'}</span>
      </div>
      <span className="text-text-muted/20">|</span>
      {/* 缓存命中 */}
      <div className="flex items-center gap-1">
        <Database size={11} className="text-emerald-500/70" />
        <span className="text-text-muted">缓存命中</span>
        <span className="font-mono text-emerald-500/80">{cacheHitTokens > 0 ? cacheHitTokens.toLocaleString() : '—'}</span>
      </div>
      <span className="text-text-muted/20">|</span>
      {/* 命中率 — D1 聚合公式 */}
      <div className="flex items-center gap-1" title={totalCacheDenom > 0 ? '聚合命中率 = Σhit / Σ(hit+miss)，不随压缩重置' : undefined}>
        <TrendingUp size={11} className={hitRate > 50 ? 'text-emerald-500/70' : 'text-amber-500/70'} />
        <span className="text-text-muted">命中率</span>
        <span className={`font-mono ${hitRate > 50 ? 'text-emerald-500/80' : 'text-amber-500/80'}`}>
          {(totalCacheDenom > 0 || promptTokens > 0) ? `${hitRate.toFixed(1)}%` : '—'}
        </span>
      </div>
    </div>
  )
}
