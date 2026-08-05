import type { ChatMessage, StreamChunk, ToolCall, ToolResult, StreamingSegment } from '@shared/types'
import { ensureAgentsLoaded } from '@renderer/agents'
import { buildApiMessages } from './buildApiMessages'
import type { StoreState } from './useStore'
import type { AgentTodo } from './useStore'
import { StreamingBatcher, trimTrailingEmpty, computePersistSegments, flatContent, flatReasoning } from './streaming-helpers'

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
function persistAssistantMessage(
  get: () => StoreState, set: SetState, conversationId: string, msgPatch: Partial<ChatMessage>,
  convTokens: { total: number; prompt: number; cacheHit: number; cacheMiss?: number } | null,
  error?: string, contextTokens?: number,
): void {
  set((s) => buildPersistPatch(s, conversationId, msgPatch, convTokens, error, contextTokens))
  void get()._persist()
}

export async function runStream(get: () => StoreState, set: SetState, conversationId: string): Promise<void> {
  const conversation = get().conversations.find((c) => c.id === conversationId)
  if (!conversation) return
  const settings = get().settings
  if (!settings) return

  if (get().activeExperts.length > 0 || settings.mainAgentExpertId) await ensureAgentsLoaded()

  const apiMessages = await buildApiMessages(
    conversation, settings.customPrompt, get().activeExperts, settings.orchestratorEnforce,
    get().browserOpen, get().computerUseRunning, get().activeStyleId,
    settings.mainAgentCustomPrompt, settings.mainAgentExpertId,
    {
      maxToolResultChars: settings.maxToolResultChars ?? 8000,
      maxContextChars: settings.maxContextChars ?? 300000,
      recentKeep: settings.contextRecentKeep ?? 5,
      snippedKeep: settings.contextSnippedKeep ?? 200,
      prunedKeep: settings.contextPrunedKeep ?? 80,
    },
    settings.reasoningEffort, settings.memoryEnabled, settings.thinkingMode,
  )
  const request = {
    mode: conversation.mode, messages: apiMessages, model: settings.model,
    thinkingMode: settings.thinkingMode, reasoningEffort: settings.reasoningEffort,
    temperature: settings.temperature, maxTokens: 393216, sessionId: conversationId,
    autoModeLevel: get().autoModeLevel,
    // 活跃服务商 — 'deepseek'=内置，其余对应 settings.providers 中的自定义服务商
    providerId: settings.activeProviderId ?? 'deepseek',
  }

  const segments: StreamingSegment[] = [{ reasoning: '', content: '', toolCalls: [] }]
  const currentSeg = (): StreamingSegment => segments[segments.length - 1]

  let tokens: number | null = null
  let totalTokensAccum = 0, promptTokensAccum = 0, cacheHitTokensAccum = 0, cacheMissTokensAccum = 0
  let currentContextTokens = 0

  const collectedToolCalls: ToolCall[] = []
  const collectedToolResults: ToolResult[] = []

  // 持久化守卫 — done/catch 分支已持久化时，finally 不再二次覆盖（消除竞态）
  // 背景：done 分支（chunk.done）与 catch 分支都会持久化，finally 无条件再执行一次，
  // 导致流式结束时被二次写入覆盖（且不对称持久化 toolCalls/toolResults）。
  let persistedRef = false

  const batcher = new StreamingBatcher(
    (segCopy) => set({
      streamingSegments: segCopy,
      streamingContent: flatContent(segments),
      streamingReasoning: flatReasoning(segments),
      streamingToolCalls: segments.flatMap(s => s.toolCalls),
    }),
    () => segments,
  )

  try {
    await window.api.chat.stream(request, (chunk: StreamChunk) => {
      const isToolStreamUpdate = chunk.toolStatus !== undefined && chunk.toolName !== undefined && chunk.toolCall === undefined
      if (chunk.content && !isToolStreamUpdate) { currentSeg().content += chunk.content; batcher.schedule() }
      if (chunk.reasoningContent) { currentSeg().reasoning += chunk.reasoningContent; batcher.schedule() }
      if (chunk.usage) {
        tokens = chunk.usage.totalTokens
        totalTokensAccum += chunk.usage.totalTokens
        promptTokensAccum += chunk.usage.promptTokens
        cacheHitTokensAccum += chunk.usage.promptCacheHitTokens ?? 0
        cacheMissTokensAccum += chunk.usage.promptCacheMissTokens ?? 0
        currentContextTokens = chunk.usage.totalTokens
        set({ streamingTokens: totalTokensAccum, streamingCacheHitTokens: cacheHitTokensAccum, streamingCacheMissTokens: cacheMissTokensAccum, streamingPromptTokens: promptTokensAccum, streamingContextTokens: currentContextTokens })
      }

      if (chunk.toolStatus === 'calling' && chunk.toolName) {
        if (chunk.toolCall) {
          collectedToolCalls.push(chunk.toolCall)
          currentSeg().toolCalls.push({ name: chunk.toolName, status: 'calling' as const, args: chunk.toolCall.arguments ? JSON.stringify(chunk.toolCall.arguments) : undefined, toolCallId: chunk.toolCall.id })
        } else {
          const seg = currentSeg()
          for (let i = seg.toolCalls.length - 1; i >= 0; i--) {
            if (seg.toolCalls[i].name === chunk.toolName && seg.toolCalls[i].status === 'calling') {
              seg.toolCalls[i] = { ...seg.toolCalls[i], result: chunk.content }; break
            }
          }
        }
        batcher.schedule()
      }

      if (chunk.toolResult) {
        collectedToolResults.push(chunk.toolResult)
        if (chunk.toolResult.toolName === 'todo_write' && chunk.toolResult.success && chunk.toolResult.metadata?.todos) {
          const todos = chunk.toolResult.metadata.todos as AgentTodo[]
          if (Array.isArray(todos) && todos.length > 0 && conversationId) {
            set((s) => ({ agentTodosByConv: { ...s.agentTodosByConv, [conversationId]: todos } }))
          }
        }
        if (chunk.toolResult.success && chunk.toolResult.metadata?.settingsPatch) {
          const patch = chunk.toolResult.metadata.settingsPatch as Record<string, unknown>
          if (Object.keys(patch).length > 0) void get().updateSettings(patch)
        }

        const resultId = chunk.toolResult.toolCallId
        const seg = currentSeg()
        let matched = false
        for (let i = 0; i < seg.toolCalls.length; i++) {
          if (resultId && seg.toolCalls[i].toolCallId === resultId) {
            seg.toolCalls[i] = { ...seg.toolCalls[i], status: 'done' as const, result: chunk.toolResult.content }; matched = true; break
          }
        }
        if (!matched) {
          for (let i = seg.toolCalls.length - 1; i >= 0; i--) {
            if (seg.toolCalls[i].name === chunk.toolResult.toolName && seg.toolCalls[i].status === 'calling') {
              seg.toolCalls[i] = { ...seg.toolCalls[i], status: 'done' as const, result: chunk.toolResult.content }; break
            }
          }
        }
        batcher.schedule()
      }

      if (chunk.supervision) {
        const sup = chunk.supervision
        const verdictLabel: Record<string, string> = { on_track: '✅ 正常', lazy: '⚠️ 偷懒', off_track: '⚠️ 跑偏', violation: '🚫 违规' }
        const formattedResult = [
          `第 ${sup.round} 轮审查：${verdictLabel[sup.verdict] ?? sup.verdict}`, `严重程度：${sup.severity}`,
          ...(sup.issues.length > 0 ? [`问题：\n${sup.issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}`] : []),
          ...(sup.correction ? [`纠正指令：${sup.correction}`] : []),
        ].join('\n')
        const supId = `supervision-${sup.round}`
        collectedToolCalls.push({ id: supId, name: '监督审查', arguments: { round: sup.round, verdict: sup.verdict, severity: sup.severity } })
        collectedToolResults.push({ toolCallId: supId, toolName: '监督审查', content: formattedResult, success: sup.verdict === 'on_track' })
        currentSeg().toolCalls.push({ name: '监督审查', status: 'done' as const, args: JSON.stringify({ round: sup.round, verdict: sup.verdict, severity: sup.severity }), result: formattedResult, toolCallId: supId })
        // 缓存友好：主进程已将纠正消息注入 messages 末尾，此处同步持久化为会话 system 消息，
        // 确保重建消息列表时位置与字节一致（否则下一轮用户消息前缀从纠正处断裂）
        if (sup.message) {
          set((s) => ({
            conversations: s.conversations.map((c) =>
              c.id === conversationId
                ? { ...c, messages: [...c.messages, { id: `supervision-msg-${sup.round}`, role: 'system' as const, content: sup.message!, timestamp: Date.now() }] }
                : c
            ),
          }))
        }
        batcher.schedule()
      }

      if (chunk.toolStatus === 'thinking') {
        const seg = currentSeg()
        for (let i = 0; i < seg.toolCalls.length; i++) {
          if (seg.toolCalls[i].status === 'calling') seg.toolCalls[i] = { ...seg.toolCalls[i], status: 'done' as const }
        }
        segments.push({ reasoning: '', content: '', toolCalls: [] })
        batcher.schedule()
      }

      // 子 Agent 工作过程事件 — 专家团编排时逐轮可视化专家的进度
      if (chunk.subAgentEvent) {
        const seg = currentSeg()
        if (!seg.expertEvents) seg.expertEvents = []
        // 去重：同一专家的同一阶段事件只追加一次（避免主进程多次推送同一 started/finished）
        const lastEvent = seg.expertEvents[seg.expertEvents.length - 1]
        const isDuplicate = lastEvent &&
          lastEvent.expertId === chunk.subAgentEvent.expertId &&
          lastEvent.stage === chunk.subAgentEvent.stage &&
          lastEvent.detail === chunk.subAgentEvent.detail
        if (!isDuplicate) {
          seg.expertEvents.push({ ...chunk.subAgentEvent })
          batcher.schedule()
        }
      }

      if (chunk.done) {
        batcher.cancel()
        trimTrailingEmpty(segments)
        const allContent = flatContent(segments)
        const allReasoning = flatReasoning(segments)
        const persistSegments = computePersistSegments(segments)

        if (chunk.error) {
          const hasTokenData = totalTokensAccum > 0
          if (get().streamingAssistantId && (allContent || allReasoning || hasTokenData)) {
            persistAssistantMessage(get, set, conversationId, {
              content: allContent, reasoningContent: allReasoning || undefined, segments: persistSegments,
              tokens: hasTokenData ? totalTokensAccum : undefined, cacheHitTokens: cacheHitTokensAccum > 0 ? cacheHitTokensAccum : undefined,
            }, hasTokenData ? { total: totalTokensAccum, prompt: promptTokensAccum, cacheHit: cacheHitTokensAccum, cacheMiss: cacheMissTokensAccum } : null, chunk.error, currentContextTokens || undefined)
            persistedRef = true
          } else {
            set({ error: chunk.error, ...STREAMING_RESET })
            persistedRef = true
          }
          return
        }

        const finalTokens = tokens ?? get().streamingTokens
        const hasToolData = collectedToolCalls.length > 0 || collectedToolResults.length > 0
        persistAssistantMessage(get, set, conversationId, {
          content: allContent || get().streamingContent, reasoningContent: allReasoning || undefined,
          segments: persistSegments, model: get().settings?.model, tokens: finalTokens ?? undefined,
          cacheHitTokens: cacheHitTokensAccum || undefined,
          toolCalls: hasToolData ? collectedToolCalls : undefined, toolResults: hasToolData ? collectedToolResults : undefined,
        }, { total: totalTokensAccum, prompt: promptTokensAccum, cacheHit: cacheHitTokensAccum, cacheMiss: cacheMissTokensAccum }, undefined, currentContextTokens || undefined)
        persistedRef = true
      }
    })
  } catch (e) {
    batcher.cancel()
    trimTrailingEmpty(segments)
    const msg = e instanceof Error ? e.message : String(e)
    const allContent = flatContent(segments)
    const allReasoning = flatReasoning(segments)
    const persistSegments = computePersistSegments(segments)
    const hasTokenData = totalTokensAccum > 0

    if (conversationId && get().streamingAssistantId && (allContent || allReasoning || hasTokenData)) {
      persistAssistantMessage(get, set, conversationId, {
        content: allContent, reasoningContent: allReasoning || undefined, segments: persistSegments,
        tokens: hasTokenData ? totalTokensAccum : undefined, cacheHitTokens: cacheHitTokensAccum > 0 ? cacheHitTokensAccum : undefined,
      }, hasTokenData ? { total: totalTokensAccum, prompt: promptTokensAccum, cacheHit: cacheHitTokensAccum, cacheMiss: cacheMissTokensAccum } : null, `发送失败：${msg}`, currentContextTokens || undefined)
    } else {
      set({ error: `发送失败：${msg}`, ...STREAMING_RESET })
    }
  } finally {
    batcher.cancel()
    if (get().isStreaming) {
      trimTrailingEmpty(segments)
      const finalContent = flatContent(segments) || get().streamingContent
      const finalReasoning = flatReasoning(segments) || get().streamingReasoning
      const persistSegments = computePersistSegments(segments)
      const hasToolData = collectedToolCalls.length > 0 || collectedToolResults.length > 0

      if (conversationId && get().streamingAssistantId && (finalContent || finalReasoning)) {
        persistAssistantMessage(get, set, conversationId, {
          content: finalContent, reasoningContent: finalReasoning || undefined, segments: persistSegments,
          model: get().settings?.model, tokens: (tokens ?? get().streamingTokens) ?? undefined,
          cacheHitTokens: cacheHitTokensAccum || undefined,
          toolCalls: hasToolData ? collectedToolCalls : undefined, toolResults: hasToolData ? collectedToolResults : undefined,
        }, { total: totalTokensAccum, prompt: promptTokensAccum, cacheHit: cacheHitTokensAccum, cacheMiss: cacheMissTokensAccum }, undefined, currentContextTokens || undefined)
      } else {
        set(STREAMING_RESET)
      }
    }
    get().markTodosComplete()
  }
}

/** 取消流式传输 — 持久化已生成的内容并重置状态 */
export async function cancelStream(get: () => StoreState, set: SetState): Promise<void> {
  await window.api.chat.cancel()
  const state = get()
  const { streamingConversationId: convId, streamingContent, streamingAssistantId } = state
  const accumTotal = state.streamingTokens ?? 0
  const accumCacheHit = state.streamingCacheHitTokens ?? 0
  const accumCacheMiss = state.streamingCacheMissTokens ?? 0
  const accumPrompt = state.streamingPromptTokens ?? 0
  const streamContext = state.streamingContextTokens ?? 0
  const hasTokenData = accumTotal > 0
  // 计算持久化 segments（仅多轮时保留）
  const segs = state.streamingSegments
  const persistSegments = segs && segs.length > 1
    ? segs.filter(s => s.reasoning || s.content || s.toolCalls.length > 0).map(s => ({
        reasoning: s.reasoning,
        content: s.content,
        toolCalls: s.toolCalls.map(tc => ({ ...tc, status: 'done' as const }))
      }))
    : undefined
  if (convId && streamingContent && streamingAssistantId) {
    set((s) => buildPersistPatch(s, convId, {
      content: streamingContent,
      reasoningContent: state.streamingReasoning || undefined,
      segments: persistSegments,
      model: state.settings?.model,
      tokens: hasTokenData ? accumTotal : undefined,
      cacheHitTokens: accumCacheHit > 0 ? accumCacheHit : undefined
    }, hasTokenData ? { total: accumTotal, prompt: accumPrompt, cacheHit: accumCacheHit, cacheMiss: accumCacheMiss } : null, undefined, streamContext || undefined))
    void state._persist()
    return
  }
  set(STREAMING_RESET)
}
