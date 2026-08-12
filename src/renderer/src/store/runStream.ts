import type { ChatMessage, StreamChunk, ToolCall, ToolResult, StreamingSegment, SegmentEvent } from '@shared/types'
import { ensureAgentsLoaded } from '@renderer/agents'
import { buildApiMessages } from './buildApiMessages'
import type { StoreState } from './useStore'
import type { AgentTodo } from './useStore'
import { StreamingBatcher, trimTrailingEmpty, computePersistSegments, flatContent, flatReasoning } from './streaming-helpers'
import { persistAssistantMessage, STREAMING_RESET, type SetState } from './stream-persist'
import { pushEvent } from './stream-events'
import { handleSupervisionChunk, handleContinuationChunk, handleTaskIntentChunk } from './stream-meta-handlers'

export async function runStream(get: () => StoreState, set: SetState, conversationId: string): Promise<void> {
  const conversation = get().conversations.find((c) => c.id === conversationId)
  if (!conversation) return
  const settings = get().settings
  if (!settings) return

  if (get().activeExperts.length > 0 || settings.mainAgentExpertId) await ensureAgentsLoaded()

  // 长任务模式：自动拉满思考强度（ultra = 工程范式 + 监督审查）
  // 注意：仅提升本次请求的生效值，不修改用户设置（关闭长任务后恢复原设定）
  const effectiveReasoningEffort = (conversation.longTask && settings.reasoningEffort !== 'off')
    ? 'ultra' as const
    : settings.reasoningEffort
  // 长任务 + ultra 时强制开启 thinkingMode — 否则注入五锁协议但 API 不发思维链（行为错乱）
  const effectiveThinkingMode = effectiveReasoningEffort !== 'off'
    ? true
    : settings.thinkingMode

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
    // 必须传 effectiveThinkingMode 而非 settings.thinkingMode —
    // 长任务模式会强制开启 thinking，若此处传 settings.thinkingMode=false，
    // 历史消息不带 reasoning_content: ''，而 agentLoop 新增的消息带 → 前缀字节不一致 → 缓存 miss
    effectiveReasoningEffort, settings.memoryEnabled, effectiveThinkingMode,
  )
  const request = {
    mode: conversation.mode, messages: apiMessages, model: settings.model,
    thinkingMode: effectiveThinkingMode, reasoningEffort: effectiveReasoningEffort,
    temperature: settings.temperature, maxTokens: 393216, sessionId: conversationId,
    autoModeLevel: get().autoModeLevel,
    // 活跃服务商 — 'deepseek'=内置，其余对应 settings.providers 中的自定义服务商
    providerId: settings.activeProviderId ?? 'deepseek',
    longTask: conversation.longTask,
  }

  const segments: StreamingSegment[] = [{ reasoning: '', content: '', toolCalls: [] }]
  const currentSeg = (): StreamingSegment => segments[segments.length - 1]

  let tokens: number | null = null
  let totalTokensAccum = 0, promptTokensAccum = 0, cacheHitTokensAccum = 0, cacheMissTokensAccum = 0
  let currentContextTokens = 0

  const collectedToolCalls: ToolCall[] = []
  const collectedToolResults: ToolResult[] = []

  // 持久化守卫 — done/catch 分支已持久化时，finally 不再二次覆盖（消除竞态）
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
      if (chunk.content && !isToolStreamUpdate) { const seg = currentSeg(); seg.content += chunk.content; pushEvent(seg, { type: 'content', text: chunk.content }); batcher.schedule() }
      if (chunk.reasoningContent) { const seg = currentSeg(); seg.reasoning += chunk.reasoningContent; pushEvent(seg, { type: 'reasoning', text: chunk.reasoningContent }); batcher.schedule() }
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
          const tcEntry = { name: chunk.toolName, status: 'calling' as const, args: chunk.toolCall.arguments ? JSON.stringify(chunk.toolCall.arguments) : undefined, toolCallId: chunk.toolCall.id }
          currentSeg().toolCalls.push(tcEntry)
          pushEvent(currentSeg(), { type: 'tool', toolName: chunk.toolName, toolCallId: chunk.toolCall.id, args: tcEntry.args, status: 'calling' })
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
        if (matched) {
          if (seg.events) {
            for (let i = seg.events.length - 1; i >= 0; i--) {
              if (seg.events[i].type === 'tool' && seg.events[i].toolCallId === resultId && seg.events[i].status === 'calling') {
                seg.events[i] = { ...seg.events[i], status: 'done', result: chunk.toolResult.content }; break
              }
            }
          }
        }
        batcher.schedule()
      }

      if (chunk.supervision) {
        handleSupervisionChunk(
          chunk.supervision, collectedToolCalls, collectedToolResults,
          currentSeg, set as unknown as (p: Record<string, unknown> | ((s: unknown) => Record<string, unknown>)) => void,
          conversationId, () => batcher.schedule()
        )
      }

      if (chunk.toolStatus === 'thinking') {
        const seg = currentSeg()
        for (let i = 0; i < seg.toolCalls.length; i++) {
          if (seg.toolCalls[i].status === 'calling') seg.toolCalls[i] = { ...seg.toolCalls[i], status: 'done' as const }
        }
        segments.push({ reasoning: '', content: '', toolCalls: [], events: [] })
        batcher.schedule()
      }

      // 子 Agent 工作过程事件 — 专家团编排时逐轮可视化专家的进度
      if (chunk.subAgentEvent) {
        const seg = currentSeg()
        if (!seg.expertEvents) seg.expertEvents = []
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

      if (chunk.continuation) {
        handleContinuationChunk(chunk.continuation, collectedToolCalls, collectedToolResults, currentSeg, () => batcher.schedule())
      }

      if (chunk.taskIntent) {
        handleTaskIntentChunk(chunk.taskIntent, collectedToolCalls, collectedToolResults, currentSeg, () => batcher.schedule())
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
        // 空响应（无内容无推理）— 移除空占位消息，避免残留空白气泡
        const assistantId = get().streamingAssistantId
        if (conversationId && assistantId) {
          set((s) => ({
            conversations: s.conversations.map((c) =>
              c.id === conversationId
                ? { ...c, messages: c.messages.filter((m) => m.id !== assistantId), updatedAt: Date.now() }
                : c
            ),
            ...STREAMING_RESET,
          }))
          void get()._persist()
        } else {
          set(STREAMING_RESET)
        }
      }
    }
    get().markTodosComplete()
  }
}
