import type { ChatRequest, ToolDefinition, ToolContext } from '@shared/types'
import { getCheckpointStore } from '@main/CheckpointStore'
import { callDeepSeekStream } from './api'
import { agentConfig } from './context'
import type { StreamHandlers } from './types'
import { ContextManager, compactWithSummary } from '@shared/cache'
import type { MutableMessage } from '@shared/cache'
import { captureShape, compareShape } from '@main/cache/prefix-shape'
import type { PrefixShape } from '@shared/cache/types'
import { runPlanningPhase, runTaskIntentAnalysis } from './planning-phase'
import { executeToolCalls } from './tool-execution'
import { extractKnowledgeFromConversation } from './knowledge-extract'

// ---------- Agent Loop：工具调用循环 ----------

/**
 * Agent Loop — 带工具调用的主循环
 * 参考 Reasonix 的 agent.go 设计：
 *   思考 → 工具调用 → 观察 → 思考 → ... → 最终回答
 *
 * 缓存优化集成（参考 Reasonix）：
 * - A1 字节稳定前缀：消息只追加不重排
 * - A2 reasoning_content 本地保留请求剥离（空字符串 key）
 * - B1/B2 四档 compaction + stuck 暂停
 * - D2 PrefixShape 哈希诊断
 */
export async function agentLoop(
  apiKey: string,
  baseUrl: string,
  request: ChatRequest,
  handlers: StreamHandlers,
  context?: ToolContext,
  sessionId?: string
): Promise<void> {
  const { onChunk, signal } = handlers

  if (!apiKey) {
    onChunk({ done: true, error: '未配置 API Key，请前往设置填写你的 DeepSeek API 密钥。' })
    return
  }

  // Checkpoint: 开启新轮次（记录用户消息的检查点）
  if (sessionId && agentConfig.checkpointEnabled) {
    const store = getCheckpointStore(sessionId)
    const lastUserMsg = [...request.messages].reverse().find(m => m.role === 'user')
    const prompt = lastUserMsg?.content?.slice(0, 200) || ''
    const turn = store.nextTurn()
    store.begin(turn, prompt, request.messages.length)
  }

  // 获取该模式对应的工具
  let tools = request.tools && request.tools.length > 0 ? request.tools : undefined

  // A1 字节稳定前缀 — 消息列表只追加，不重排序、不重写字段
  const messages: MutableMessage[] = [
    ...request.messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {})
    }))
  ]

  // ── Phase 0: 规划轮 ──
  // 用文本目录（~300 tokens）替代完整工具 schema（~15000 tokens），让 Agent 先理解任务、选出所需工具
  // 触发条件：规划轮开关开启 且 工具数 > 5 且用户消息较长（复杂任务才值得规划往返开销）
  // planningEnabled 由 settings 注入（chat-handler → request 无此字段，从 agentConfig 读取）
  const lastUserMsg = messages.filter(m => m.role === 'user').pop()
  const userMsgLen = lastUserMsg?.content?.length ?? 0
  if (agentConfig.planningEnabled && tools && tools.length > 5 && userMsgLen > 30 && !signal?.aborted) {
    const filtered = await runPlanningPhase(apiKey, baseUrl, request, messages, tools, handlers)
    if (filtered && filtered.length > 0) {
      tools = filtered
    }
  }

  // ── 长任务模式：任务意图深度分析 ──
  // 在规划阶段之前，先深度分析用户真实需求、验收标准、约束与风险
  // 分析结果注入 messages 作为执行上下文，让后续每轮工作都锚定于真实意图
  if (request.longTask && !signal?.aborted) {
    await runTaskIntentAnalysis(apiKey, baseUrl, request, messages, handlers)
  }

  // 监督审查 — ultra 思考强度时启用
  const supervisionEnabled = request.reasoningEffort === 'ultra'
  // 监督基准取「最近一条」用户消息 — 多轮会话中用户可能已切换任务方向，
  // 若始终以第一条消息为基准，监督会误判新任务为"跑偏"并注入错误纠正指令
  const userMsgs = messages.filter(m => m.role === 'user')
  const originalTask = (userMsgs[userMsgs.length - 1] ?? userMsgs[0])?.content?.slice(0, 1000) || ''

  // B1/B2 四档 compaction + stuck 保护
  const ctxManager = new ContextManager()

  // D2 PrefixShape 哈希诊断
  let lastPrefixShape: PrefixShape | null = null

  // 上下文窗口 — 由 chat-handler 按活跃服务商注入 agentConfig（内置 DeepSeek 1M）
  const contextWindow = agentConfig.contextWindow

  // ── 长任务模式续跑参数 ──
  // 每批次轮次：长任务用 longTaskRoundsPerSegment，普通模式用 maxToolRounds
  // 最大续跑批次：长任务允许 longTaskMaxContinuations 次自动续跑，普通模式为 0（不续跑）
  const roundsPerSegment = request.longTask
    ? agentConfig.longTaskRoundsPerSegment
    : agentConfig.maxToolRounds
  const maxContinuations = request.longTask ? agentConfig.longTaskMaxContinuations : 0

  let round = 0
  let continuationCount = 0

  // 外层循环：续跑批次控制（普通模式 maxContinuations=0，只执行一次）
  continuationLoop: while (true) {
    while (round < roundsPerSegment) {
      if (signal?.aborted) {
        onChunk({ done: true })
        return
      }

      round++

      // D2 捕获前缀形状 — 在 API 调用前
      const systemPrompt = messages.find(m => m.role === 'system')?.content || ''
      const prefixShape = captureShape(systemPrompt, tools || [], ctxManager.rewriteVersion)
      const prevShape = lastPrefixShape ?? prefixShape

      // 单次 API 调用（caps 透传 — 自定义服务商裁剪 DeepSeek 专属参数）
      const result = await callDeepSeekStream(
        apiKey, baseUrl, request.model, messages, tools,
        request.thinkingMode, request.reasoningEffort, request.temperature,
        request.maxTokens, handlers, agentConfig.capabilities
      )

      // D2 诊断对比 — 每轮 API 调用后
      const cacheDiag = compareShape(prevShape, prefixShape, result.usage)
      if (cacheDiag.prefixChanged || result.usage) {
        onChunk({ cacheDiagnostics: cacheDiag })
      }
      lastPrefixShape = prefixShape

      // B1/B2 maybeCompact — 每轮 API 调用后根据 usage 决定是否压缩
      if (result.usage && contextWindow > 0) {
        const compactStats = ctxManager.maybeCompact({
          messages,
          config: {
            maxToolResultChars: agentConfig.maxToolResultChars,
            maxContextChars: agentConfig.maxContextChars,
            recentKeep: agentConfig.recentKeep,
            snippedKeep: agentConfig.snippedKeep,
            prunedKeep: agentConfig.prunedKeep
          },
          promptTokens: result.usage.promptTokens,
          contextWindow
        })
        if (compactStats.tier === 'soft') {
          onChunk({ toolStatus: 'thinking', toolName: 'context' })
        }
        // compact/force 阶段 — 调用 LLM 生成摘要替换旧消息
        if (compactStats.tier === 'compact' || compactStats.tier === 'force') {
          await compactWithSummary(
            apiKey, baseUrl, request.model,
            messages, contextWindow, agentConfig.recentKeep, signal
          )
        }
      }

      // 错误处理
      if (result.finishReason === 'error') {
        onChunk({ done: true, error: result.error })
        return
      }

      // LLM 直接返回文本（无工具调用） → 结束
      if (result.finishReason === 'stop' || result.finishReason === 'length') {
        onChunk({ done: true })
        // 跨会话知识沉淀 — 后台提取，不阻塞返回（复杂会话才提取，简单问答自动跳过）
        if (round >= 3) {
          void extractKnowledgeFromConversation(
            apiKey, baseUrl, request.model, messages, request.mode, round, signal
          ).catch(() => { /* 静默失败 */ })
        }
        return
      }

      // LLM 请求调用工具 — 委托给 tool-execution 模块
      if (result.finishReason === 'tool_calls' && result.toolCalls.length > 0) {
        tools = await executeToolCalls({
          result, messages, tools, request, handlers, context, sessionId,
          round, originalTask, supervisionEnabled, apiKey, baseUrl
        })
        continue
      }

      // 理论上不应该到这里
      onChunk({ done: true })
      return
    }

    // 内层 while 正常退出 = round >= roundsPerSegment（达到本批次轮次上限）
    // 长任务模式且未超过续跑安全阀 → 自动续跑
    if (continuationCount < maxContinuations) {
      continuationCount++
      const totalRoundsDone = continuationCount * roundsPerSegment
      onChunk({
        continuation: {
          segment: continuationCount + 1,
          maxSegments: maxContinuations + 1,
          completedRounds: totalRoundsDone
        }
      })
      // 注入续跑指令 — 让 LLM 知道这是自动续跑而非新任务，继续未完成的工作
      messages.push({
        role: 'user',
        content: `[自动续跑 ${continuationCount}/${maxContinuations}] 你已经完成了 ${totalRoundsDone} 轮工具调用。请检查 todo_write 中的任务状态，继续从上次中断处工作。不要重复已完成的工作，直接继续未完成的任务。如果所有任务已完成，请给出最终总结。`
      })
      round = 0
      onChunk({ toolStatus: 'thinking', toolName: 'continuation' })
      continue continuationLoop
    }

    break continuationLoop
  }

  // 达到最大轮次（或续跑安全阀上限），强制再请求一次让 LLM 总结（不传 tools，防止再次触发工具调用）
  onChunk({ toolStatus: 'thinking' })
  messages.push({
    role: 'user',
    content: '你已经完成了所有工具调用。请基于已有信息直接给出最终回答，不要再调用任何工具。'
  })
  const finalResult = await callDeepSeekStream(
    apiKey, baseUrl, request.model, messages, undefined,
    request.thinkingMode, request.reasoningEffort, request.temperature, request.maxTokens, handlers,
    agentConfig.capabilities
  )
  if (finalResult.finishReason === 'error') {
    onChunk({ done: true, error: finalResult.error })
  } else {
    onChunk({ done: true })
    // 跨会话知识沉淀 — 后台提取
    if (round >= 3) {
      void extractKnowledgeFromConversation(
        apiKey, baseUrl, request.model, messages, request.mode, round, signal
      ).catch(() => { /* 静默失败 */ })
    }
  }
}
