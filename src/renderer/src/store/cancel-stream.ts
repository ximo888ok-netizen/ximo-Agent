import { computePersistSegments } from './streaming-helpers'
import { buildPersistPatch, persistAssistantMessage, STREAMING_RESET, type SetState } from './stream-persist'
import type { StoreState } from './useStore'

/**
 * 取消流式传输 — 只触发 abort，持久化由 runStream 的 finally 块统一处理。
 *
 * 设计原因：
 * runStream 的 finally 块有完整的局部变量上下文（segments、collectedToolCalls、
 * collectedToolResults），能持久化完整数据。此处无法访问这些局部变量，
 * 强行持久化会导致 toolCalls/toolResults 丢失、推理内容被丢弃（仅检查 streamingContent）、
 * 使用陈旧的 store 状态（batcher 可能未 flush）等问题。
 *
 * 流程：
 * 1. cancelStream 调用 chat:cancel → 主进程 abort controller
 * 2. abort 导致 fetch 抛出 → agent loop 检测 signal.aborted → 发送 done chunk
 * 3. runStream 的 done 分支持久化完整数据（含 toolCalls/toolResults）
 * 4. 若 done chunk 未到达 → runStream 的 finally 块兜底持久化
 *
 * 立即解锁 isStreaming：
 * cancel 后立即将 isStreaming 置 false，避免用户取消后立即发送新消息被
 * sendMessage 的 isStreaming 检查静默丢弃。runStream 的 done/catch/finally
 * 块不依赖 isStreaming 进行持久化（done handler 无条件持久化，catch 无条件持久化，
 * finally 检查 isStreaming 但 done/catch 已先执行），因此提前解锁不会导致数据丢失。
 *
 * 安全兜底：10s 后 runStream 仍未完成持久化（streamingConversationId 未清空），
 * 强制重置流式状态，避免残留。
 */
export async function cancelStream(get: () => StoreState, set: SetState): Promise<void> {
  await window.api.chat.cancel()

  // 立即解除 isStreaming 锁 — 避免用户取消后立即发送新消息被静默丢弃。
  // 不重置 streamingConversationId/streamingAssistantId 等其他状态，
  // 让 runStream 的 done/catch/finally 块正常持久化。
  if (get().isStreaming) {
    set({ isStreaming: false })
  }

  // 安全兜底：10s 后 runStream 仍未完成持久化时，强制重置
  // 检查 streamingConversationId（而非 isStreaming，后者已提前重置）
  setTimeout(() => {
    const state = get()
    const convId = state.streamingConversationId
    const assistantId = state.streamingAssistantId
    if (!convId || !assistantId) return // runStream 已完成持久化
    if (state.streamingContent || state.streamingReasoning) {
      // 有内容 — 尽力持久化（toolCalls/toolResults 局部变量无法访问，此处不包含）
      const persistSegments = computePersistSegments(state.streamingSegments)
      set((s) => buildPersistPatch(s, convId, {
        content: state.streamingContent, reasoningContent: state.streamingReasoning || undefined,
        segments: persistSegments, model: state.settings?.model,
        tokens: state.streamingTokens ?? undefined, cacheHitTokens: state.streamingCacheHitTokens ?? undefined,
      }, state.streamingTokens ? { total: state.streamingTokens, prompt: state.streamingPromptTokens ?? 0, cacheHit: state.streamingCacheHitTokens ?? 0, cacheMiss: state.streamingCacheMissTokens ?? 0 } : null, undefined, state.streamingContextTokens ?? undefined))
      void state._persist()
    } else {
      // 空响应 — 移除空占位消息
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === convId ? { ...c, messages: c.messages.filter((m) => m.id !== assistantId), updatedAt: Date.now() } : c
        ),
        ...STREAMING_RESET,
      }))
      void state._persist()
    }
    get().markTodosComplete()
  }, 10_000)
}
