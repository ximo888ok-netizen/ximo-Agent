import type { ChatMessage, StreamChunk, ToolCall, ToolResult, StreamingSegment, SegmentEvent } from '@shared/types'
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

/** 向 segment 的 events 数组推送事件，连续同类型文本事件自动合并 */
function pushEvent(seg: { events?: SegmentEvent[] }, event: SegmentEvent): void {
  if (!seg.events) seg.events = []
  if (event.type === 'reasoning' || event.type === 'content') {
    const last = seg.events[seg.events.length - 1]
    if (last && last.type === event.type) {
      last.text = (last.text || '') + (event.text || '')
      return
    }
  }
  seg.events.push(event)
}

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
    effectiveReasoningEffort, settings.memoryEnabled, settings.thinkingMode,
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
        pushEvent(currentSeg(), { type: 'tool', toolName: '监督审查', toolCallId: supId, args: JSON.stringify({ round: sup.round, verdict: sup.verdict }), result: formattedResult, status: 'done' })
        // 缓存友好：主进程已将纠正消息注入 messages 末尾，此处同步持久化为会话 system 消息，
        // 确保重建消息列表时位置与字节一致（否则下一轮用户消息前缀从纠正处断裂）
        if (sup.message) {
          const msgId = `supervision-msg-${sup.round}`
          set((s) => {
            const conv = s.conversations.find((c) => c.id === conversationId)
            // 去重：同一轮监督纠正消息只追加一次（防止同轮多次推送导致重复）
            if (conv?.messages.some((m) => m.id === msgId)) return {}
            return {
              conversations: s.conversations.map((c) =>
                c.id === conversationId
                  ? { ...c, messages: [...c.messages, { id: msgId, role: 'system' as const, content: sup.message!, timestamp: Date.now() }] }
                  : c
              ),
            }
          })
        }
        batcher.schedule()
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

      if (chunk.continuation) {
        const cont = chunk.continuation
        const contId = `continuation-${cont.segment}`
        const contMsg = `🔄 自动续跑 ${cont.segment}/${cont.maxSegments}（已完成 ${cont.completedRounds} 轮）`
        collectedToolCalls.push({ id: contId, name: '自动续跑', arguments: { segment: cont.segment, maxSegments: cont.maxSegments, completedRounds: cont.completedRounds } })
        collectedToolResults.push({ toolCallId: contId, toolName: '自动续跑', content: contMsg, success: true })
        currentSeg().toolCalls.push({ name: '自动续跑', status: 'done' as const, args: JSON.stringify({ segment: cont.segment, maxSegments: cont.maxSegments }), result: contMsg, toolCallId: contId })
        pushEvent(currentSeg(), { type: 'tool', toolName: '自动续跑', toolCallId: contId, args: JSON.stringify({ segment: cont.segment, maxSegments: cont.maxSegments }), result: contMsg, status: 'done' })
        batcher.schedule()
      }

      if (chunk.taskIntent) {
        const ti = chunk.taskIntent
        const intentId = 'task-intent-analysis'
        const intentMsg = [
          `**真实意图**：${ti.intent}`,
          ti.successCriteria.length > 0 ? `**验收标准**：\n${ti.successCriteria.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}` : '',
          ti.constraints.length > 0 ? `**约束与风险**：\n${ti.constraints.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}` : '',
          ti.phases.length > 0 ? `**建议阶段**：\n${ti.phases.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}` : '',
        ].filter(Boolean).join('\n')
        collectedToolCalls.push({ id: intentId, name: '任务意图分析', arguments: { intent: ti.intent } })
        collectedToolResults.push({ toolCallId: intentId, toolName: '任务意图分析', content: intentMsg, success: true })
        currentSeg().toolCalls.push({ name: '任务意图分析', status: 'done' as const, args: ti.intent.slice(0, 200), result: intentMsg, toolCallId: intentId })
        pushEvent(currentSeg(), { type: 'tool', toolName: '任务意图分析', toolCallId: intentId, args: ti.intent.slice(0, 200), result: intentMsg, status: 'done' })
        batcher.schedule()
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
 * 安全兜底：10s 后 finally 仍未执行（主进程崩溃/IPC 断开等极端情况），
 * 强制重置流式状态，避免用户卡在 isStreaming=true 无法操作。
 */
export async function cancelStream(get: () => StoreState, set: SetState): Promise<void> {
  await window.api.chat.cancel()

  // 安全兜底：10s 后 finally 块仍未执行时，强制重置
  setTimeout(() => {
    if (!get().isStreaming) return
    const state = get()
    const convId = state.streamingConversationId
    const assistantId = state.streamingAssistantId
    if (convId && assistantId && (state.streamingContent || state.streamingReasoning)) {
      // 有内容 — 尽力持久化（toolCalls/toolResults 局部变量无法访问，此处不包含）
      const persistSegments = computePersistSegments(state.streamingSegments)
      set((s) => buildPersistPatch(s, convId, {
        content: state.streamingContent, reasoningContent: state.streamingReasoning || undefined,
        segments: persistSegments, model: state.settings?.model,
        tokens: state.streamingTokens ?? undefined, cacheHitTokens: state.streamingCacheHitTokens ?? undefined,
      }, state.streamingTokens ? { total: state.streamingTokens, prompt: state.streamingPromptTokens ?? 0, cacheHit: state.streamingCacheHitTokens ?? 0, cacheMiss: state.streamingCacheMissTokens ?? 0 } : null, undefined, state.streamingContextTokens ?? undefined))
      void state._persist()
    } else if (convId && assistantId) {
      // 空响应 — 移除空占位消息
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === convId ? { ...c, messages: c.messages.filter((m) => m.id !== assistantId), updatedAt: Date.now() } : c
        ),
        ...STREAMING_RESET,
      }))
      void state._persist()
    } else {
      set(STREAMING_RESET)
    }
    get().markTodosComplete()
  }, 10_000)
}
