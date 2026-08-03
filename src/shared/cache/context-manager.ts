import type { AgentConfig } from '../context-compress'
import type { CompactionStats } from './types'

/**
 * ContextManager — 参考 Reasonix 的 maybeCompact() + compactStuck 机制
 *
 * 四档 compaction（按 prompt 占窗口比例）：
 *   50% soft  — 仅通知，不动前缀（保持缓存命中）
 *   60% snip  — 机械裁剪陈旧 tool results（保留配对，前缀大部分仍命中）
 *   80% compact — 调用 LLM 生成摘要替换旧消息（由 agent-loop 执行）
 *   90% force  — 强制 compact，跳过经济性检查
 *
 * stuck 保护：连续 ≥ 2 次 compact 后仍未降到 trigger 以下 → 暂停自动压缩，
 * 让 prefix append-only 增长，命中率自然恢复。
 *
 * 注意：compaction 只在 agent-loop 内部运行，作用于 messages 副本。
 * 压缩不重置会话聚合计数器（D1）。
 */

/** 消息类型约束 — 允许原地修改 content */
export interface MutableMessage {
  role: string
  content: string
  tool_calls?: unknown
  tool_call_id?: string
  /** A2 reasoning_content 空 key — DeepSeek thinking 模式下 tool_calls turn 必须带此 key */
  reasoning_content?: string
}

/** compaction 决策输入 */
export interface CompactInput {
  messages: MutableMessage[]
  config: AgentConfig
  /** 最近一次 API 调用的 promptTokens（来自 usage） */
  promptTokens: number
  /** 上下文窗口大小（tokens），0 = 禁用 */
  contextWindow: number
}

const SOFT_RATIO = 0.5
const SNIP_RATIO = 0.6
const COMPACT_RATIO = 0.8
const FORCE_RATIO = 0.9

export class ContextManager {
  /** 连续压缩次数 — 达到 2 次触发 stuck 暂停 */
  consecutiveCompacts = 0
  /** stuck 暂停标志 — 暂停期间不再自动压缩 */
  compactStuck = false
  /** soft 通知标志 — 每次接近只通知一次 */
  softNoticed = false
  /** 历史重写版本号 — 每次 snip/compact/prune 递增，用于 PrefixShape 诊断 */
  rewriteVersion = 0

  /**
   * maybeCompact — 每轮 API 调用后根据 usage 决定是否压缩
   *
   * 返回 CompactionStats 描述执行的 tier 和效果。
   * 压缩直接修改 messages 数组（原地）。
   */
  maybeCompact(input: CompactInput): CompactionStats {
    const { messages, config, promptTokens, contextWindow } = input
    const empty: CompactionStats = {
      tier: 'none', snippedResults: 0, prunedResults: 0, savedChars: 0, stuckPaused: this.compactStuck
    }

    if (contextWindow <= 0 || promptTokens === 0) return empty

    const soft = contextWindow * SOFT_RATIO
    const snip = contextWindow * SNIP_RATIO
    const high = contextWindow * COMPACT_RATIO
    const force = contextWindow * FORCE_RATIO

    // ── soft 阶段：仅通知，不动前缀 ──
    if (promptTokens >= soft && promptTokens < snip && !this.softNoticed) {
      this.softNoticed = true
      return { ...empty, tier: 'soft' }
    }

    // ── snip 阶段：机械裁剪陈旧 tool results ──
    if (promptTokens >= snip && promptTokens < high) {
      const stats = this.snipStaleToolResults(messages, config)
      if (stats.snippedResults > 0) {
        this.rewriteVersion++
        return stats
      }
      return empty
    }

    // ── 低于 trigger：清除 stuck 状态 ──
    if (promptTokens < high) {
      this.consecutiveCompacts = 0
      this.compactStuck = false
      return empty
    }

    // ── compact / force 阶段 — 不做机械裁剪，返回信号由 agentLoop 调用 LLM 摘要 ──
    if (this.compactStuck) {
      return { ...empty, stuckPaused: true }
    }

    const isForce = promptTokens >= force
    this.rewriteVersion++
    this.consecutiveCompacts++
    if (this.consecutiveCompacts >= 2) {
      this.compactStuck = true
    }
    return { ...empty, tier: isForce ? 'force' : 'compact', stuckPaused: this.compactStuck }
  }

  /** 重置状态 — 切换会话时调用 */
  reset(): void {
    this.consecutiveCompacts = 0
    this.compactStuck = false
    this.softNoticed = false
    this.rewriteVersion = 0
  }

  // ── 内部方法 ──

  private snipStaleToolResults(messages: MutableMessage[], config: AgentConfig): CompactionStats {
    const protectFrom = Math.max(1, messages.length - config.recentKeep)
    let snipped = 0
    let savedChars = 0

    for (let i = 1; i < protectFrom; i++) {
      const m = messages[i]
      // 跳过已被 trimContext 或前一轮 snip 截断的内容，避免双重截断
      if (m.role === 'tool' && m.content && m.content.length > config.snippedKeep + 100 && !m.content.includes('[...已自动截断') && !m.content.includes('[...已省略')) {
        savedChars += m.content.length - (config.snippedKeep + 40)
        m.content = m.content.slice(0, config.snippedKeep) + '\n[...已自动截断以节省上下文空间]'
        snipped++
      }
    }
    return { tier: 'snip', snippedResults: snipped, prunedResults: 0, savedChars, stuckPaused: false }
  }

}
