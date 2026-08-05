import type { ChatRequest, ToolDefinition, ToolContext } from '@shared/types'
import { getCheckpointStore } from '@main/CheckpointStore'
import { callDeepSeekStream } from './api'
import { agentConfig } from './context'
import type { StreamHandlers } from './types'
import { ContextManager, compactWithSummary } from '@shared/cache'
import type { MutableMessage } from '@shared/cache'
import { captureShape, compareShape } from '@main/cache/prefix-shape'
import type { PrefixShape } from '@shared/cache/types'
import { runPlanningPhase } from './planning-phase'
import { executeToolCalls } from './tool-execution'

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

  // 监督审查 — ultra 思考强度时启用
  const supervisionEnabled = request.reasoningEffort === 'ultra'
  const originalTask = messages.find(m => m.role === 'user')?.content?.slice(0, 1000) || ''

  // B1/B2 四档 compaction + stuck 保护
  const ctxManager = new ContextManager()

  // D2 PrefixShape 哈希诊断
  let lastPrefixShape: PrefixShape | null = null

  // 上下文窗口 — 由 chat-handler 按活跃服务商注入 agentConfig（内置 DeepSeek 1M）
  const contextWindow = agentConfig.contextWindow

  let round = 0

  while (round < agentConfig.maxToolRounds) {
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

  // 达到最大轮次，强制再请求一次让 LLM 总结（不传 tools，防止再次触发工具调用）
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
  }
}
