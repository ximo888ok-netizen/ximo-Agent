import type { ChatMessage, StoreState } from './useStore'

export type SetState = (
  partial: Partial<StoreState> | ((s: StoreState) => Partial<StoreState>)
) => void

/** 流式结束后的通用重置字段 */
export const STREAMING_RESET: Partial<StoreState> = {
  isStreaming: false,
  streamingContent: '',
  streamingReasoning: '',
  streamingSegments: [],
  streamingConversationId: null,
  streamingAssistantId: null,
  streamingTokens: null,
  streamingCacheHitTokens: null,
  streamingCacheMissTokens: null,
  streamingPromptTokens: null,
  streamingContextTokens: null,
  streamingToolCalls: [],
}

/** 构造「持久化 assistant 消息 + 重置流式状态」的 state patch */
export function buildPersistPatch(
  s: StoreState, conversationId: string, msgPatch: Partial<ChatMessage>,
  convTokens: { total: number; prompt: number; cacheHit: number; cacheMiss?: number } | null,
  error?: string, contextTokens?: number,
): Partial<StoreState> {
  const assistantId = s.streamingAssistantId
  return {
    conversations: s.conversations.map((c) =>
      c.id === conversationId
        ? {
            ...c,
            messages: c.messages.map((m) => m.id === assistantId ? { ...m, ...msgPatch, timestamp: Date.now() } : m),
            ...(convTokens ? {
              totalTokens: (c.totalTokens ?? 0) + convTokens.total,
              promptTokens: (c.promptTokens ?? 0) + convTokens.prompt,
              cacheHitTokens: (c.cacheHitTokens ?? 0) + convTokens.cacheHit,
              cacheMissTokens: (c.cacheMissTokens ?? 0) + (convTokens.cacheMiss ?? 0),
            } : {}),
            ...(contextTokens !== undefined ? { contextTokens } : {}),
            updatedAt: Date.now(),
          }
        : c,
    ),
    ...(error !== undefined ? { error } : {}),
    ...STREAMING_RESET,
  }
}

/** 统一持久化助手消息：更新 state + 触发磁盘写入 */
export function persistAssistantMessage(
  get: () => StoreState, set: SetState, conversationId: string, msgPatch: Partial<ChatMessage>,
  convTokens: { total: number; prompt: number; cacheHit: number; cacheMiss?: number } | null,
  error?: string, contextTokens?: number,
): void {
  set((s) => buildPersistPatch(s, conversationId, msgPatch, convTokens, error, contextTokens))
  void get()._persist()
}
