/**
 * 工具执行模块 — 从 agent-loop.ts 提取
 *
 * 负责工具调用的完整生命周期：
 *   权限评估 → 并行执行 → 结果处理 → 监督审查
 */

import type { ChatRequest, ToolCall, ToolResult, ToolContext, ToolDefinition } from '@shared/types'
import type { MutableMessage } from '@shared/cache'
import { toolRegistry } from '@main/tools'
import { isRecording, appendStep } from '@main/SkillStore'
import { getCheckpointStore } from '@main/CheckpointStore'
import { evaluate, extractSubject, getConfigForMode, YOLO_CONFIG, SAFE_CONFIG } from '@main/Permission'
import { agentConfig, truncateToolResult, sanitizeContent } from './context'
import type { SingleCallResult, StreamHandlers } from './types'
import { runSupervisionCheck, needsCorrection, buildCorrectionMessage } from './supervisor'
import type { AgentRoundSnapshot } from './supervisor'

/** 工具执行所需的参数 */
export interface ExecuteToolCallsParams {
  result: SingleCallResult
  messages: MutableMessage[]
  tools: ToolDefinition[] | undefined
  request: ChatRequest
  handlers: StreamHandlers
  context?: ToolContext
  sessionId?: string
  round: number
  originalTask: string
  supervisionEnabled: boolean
  apiKey: string
  baseUrl: string
}

/**
 * 单工具执行兜底超时 — 个别工具（terminal、fetch、playwright 等）在极端情况下可能永不 resolve：
 * 子进程不退出、网络连接挂起等。这里用 Promise.race 包一层，超时后返回错误 ToolResult，
 * 避免整个 Agent Loop 卡死在这一轮工具执行上。
 */
const TOOL_EXEC_TIMEOUT_MS = 180_000 // 3 分钟兜底，正常工具远不会触及

function withToolTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), ms)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

/** 权限评估结果：被取消的工具调用 ID 集合 */
async function checkPermissions(
  toolCalls: ToolCall[],
  request: ChatRequest,
  handlers: StreamHandlers,
  messages: MutableMessage[]
): Promise<Set<string>> {
  const permConfig = handlers.autoModeLevel === 'yolo' || handlers.yoloMode
    ? YOLO_CONFIG
    : handlers.autoModeLevel === 'safe'
      ? SAFE_CONFIG
      : getConfigForMode(request.mode)

  const cancelledIds = new Set<string>()

  for (const tc of toolCalls) {
    const subject = extractSubject(tc.name, tc.arguments)
    const decision = evaluate(permConfig, tc.name, subject)

    if (decision === 'deny') {
      cancelledIds.add(tc.id)
      const deniedResult: ToolResult = {
        toolCallId: tc.id, toolName: tc.name,
        content: '此工具在当前模式下被禁止执行',
        success: false, error: '权限拒绝：该工具在当前模式下不可用'
      }
      handlers.onChunk({ toolResult: deniedResult, toolStatus: 'done', toolName: tc.name })
      // 与渲染层 buildApiMessages 重建格式保持一致（Error: 前缀），避免前缀字节漂移导致缓存 miss
      messages.push({ role: 'tool', content: 'Error: 权限拒绝：该工具在当前模式下不可用', tool_call_id: tc.id })
    } else if (decision === 'ask') {
      if (handlers.requestConfirmation) {
        const toolLabel = tc.name.replace(/_/g, ' ')
        const argSummary = Object.entries(tc.arguments)
          .slice(0, 3)
          .map(([k, v]) => `${k}: ${typeof v === 'string' ? v.slice(0, 60) : JSON.stringify(v)?.slice(0, 60)}`)
          .join(', ')
        const confirmed = await handlers.requestConfirmation(tc.name, `工具: ${toolLabel}\n参数: ${argSummary || '(无)'}`)
        if (!confirmed) {
          cancelledIds.add(tc.id)
          const cancelledResult: ToolResult = {
            toolCallId: tc.id, toolName: tc.name,
            content: '用户取消了此操作', success: false, error: '用户取消执行'
          }
          handlers.onChunk({ toolResult: cancelledResult, toolStatus: 'done', toolName: tc.name })
          // 与渲染层重建格式保持一致（Error: 前缀）
          messages.push({ role: 'tool', content: 'Error: 用户取消执行', tool_call_id: tc.id })
        }
      } else {
        // fail-closed：requestConfirmation 未注入时按 deny 处理
        cancelledIds.add(tc.id)
        const deniedResult: ToolResult = {
          toolCallId: tc.id, toolName: tc.name,
          content: '无法确认操作：未提供确认回调，出于安全考虑拒绝执行',
          success: false, error: '权限拒绝：requestConfirmation 未注入'
        }
        handlers.onChunk({ toolResult: deniedResult, toolStatus: 'done', toolName: tc.name })
        messages.push({ role: 'tool', content: 'Error: 权限拒绝：requestConfirmation 未注入', tool_call_id: tc.id })
      }
    }
  }

  return cancelledIds
}

/** 并行执行所有未取消的工具调用 */
async function executeActiveCalls(
  activeCalls: ToolCall[],
  onChunk: StreamHandlers['onChunk'],
  signal: AbortSignal | undefined,
  context: ToolContext | undefined,
  sessionId: string | undefined
): Promise<PromiseSettledResult<{ tc: ToolCall; result: ToolResult }>[]> {
  return Promise.allSettled(
    activeCalls.map(async (tc): Promise<{ tc: ToolCall; result: ToolResult }> => {
      const tool = toolRegistry.get(tc.name)
      if (!tool) {
        return { tc, result: { toolCallId: tc.id, toolName: tc.name, content: '', success: false, error: `未知工具：${tc.name}` } }
      }

      // Checkpoint: writer 工具执行前记录文件快照
      if (sessionId && agentConfig.checkpointEnabled) {
        const store = getCheckpointStore(sessionId)
        const writerTools = ['file_edit', 'file_write', 'multi_edit', 'move_file', 'file_delete']
        if (writerTools.includes(tc.name)) {
          const filePath = (tc.arguments.filePath as string) || (tc.arguments.sourcePath as string) || ''
          if (filePath) {
            const { resolve, normalize } = await import('path')
            await store.snapshot(normalize(resolve(filePath)))
          }
        }
      }

      const toolResult = await withToolTimeout(
        tool.execute(tc, onChunk, signal, context),
        TOOL_EXEC_TIMEOUT_MS,
        () => ({
          toolCallId: tc.id, toolName: tc.name,
          content: '', success: false,
          error: `工具执行超时（超过 ${TOOL_EXEC_TIMEOUT_MS / 1000}s 无响应），已自动中断以避免卡死`
        })
      )
      return { tc, result: toolResult }
    })
  )
}

/**
 * 执行工具调用的完整流程：权限评估 → 并行执行 → 结果处理 → 监督审查
 *
 * @returns 更新后的 tools 数组（动态工具创建可能新增）
 */
export async function executeToolCalls(params: ExecuteToolCallsParams): Promise<ToolDefinition[] | undefined> {
  const { result, messages, tools, request, handlers, context, sessionId, round, originalTask, supervisionEnabled, apiKey, baseUrl } = params
  const { onChunk, signal } = handlers

  // 通知前端：正在执行工具
  for (const tc of result.toolCalls) {
    onChunk({ toolStatus: 'calling', toolName: tc.name, toolCall: tc })
  }

  // A2 reasoning_content 本地保留请求剥离（空字符串 key）
  const assistantMsg: MutableMessage = {
    role: 'assistant',
    content: result.content || '',
    tool_calls: result.toolCalls.map((tc) => ({
      id: tc.id, type: 'function',
      function: { name: tc.name, arguments: JSON.stringify(tc.arguments) }
    }))
  }
  if (request.thinkingMode && request.reasoningEffort !== 'off') {
    assistantMsg.reasoning_content = ''
  }
  messages.push(assistantMsg)

  // 监督审查 — 在工具执行期间并行运行（非阻塞）
  let supervisionPromise: ReturnType<typeof runSupervisionCheck> | null = null
  if (supervisionEnabled && !signal?.aborted) {
    const snapshot: AgentRoundSnapshot = {
      round, originalTask,
      reasoning: result.reasoningContent,
      content: result.content,
      toolCalls: result.toolCalls.map(tc => ({ name: tc.name, args: JSON.stringify(tc.arguments).slice(0, 300) })),
      toolResults: []
    }
    supervisionPromise = runSupervisionCheck(apiKey, baseUrl, request.model, request.reasoningEffort, snapshot, signal)
  }

  // 权限评估
  const cancelledIds = await checkPermissions(result.toolCalls, request, handlers, messages)

  // 并行执行所有未取消的工具调用
  const activeCalls = result.toolCalls.filter((tc) => !cancelledIds.has(tc.id))
  const execResults = await executeActiveCalls(activeCalls, onChunk, signal, context, sessionId)

  // 按顺序处理结果
  let updatedTools = tools
  for (let i = 0; i < execResults.length; i++) {
    const item = execResults[i]
    const tc = activeCalls[i]

    if (item.status === 'fulfilled') {
      const { result: toolResult } = item.value
      onChunk({ toolResult, toolStatus: 'done', toolName: tc.name })

      // 动态工具创建 — 将新工具定义加入 tools 数组
      if (tc.name === 'create_tool' && toolResult.success && toolResult.metadata?.newToolDefinition) {
        updatedTools = [...(updatedTools || []), toolResult.metadata.newToolDefinition as ToolDefinition]
      }

      // 录制钩子
      if (isRecording() && tc.name !== 'skill_record' && tc.name !== 'skill_invoke') {
        appendStep({
          tool: tc.name,
          arguments: tc.arguments,
          description: toolResult.success ? undefined : toolResult.error
        })
      }

      // 工具执行失败时，将 error 信息作为 content 传给 LLM
      // 失败统一为 "Error: xxx" 格式 — 与渲染层 buildApiMessages 重建格式（`Error: ${result.error}`）一致，避免前缀字节漂移
      const toolContent = toolResult.success
        ? toolResult.content
        : `Error: ${toolResult.error || toolResult.content || '工具执行失败'}`
      messages.push({
        role: 'tool',
        content: sanitizeContent(truncateToolResult(toolContent)),
        tool_call_id: tc.id
      })
    } else {
      const msg = item.reason instanceof Error ? item.reason.message : String(item.reason)
      const errorResult: ToolResult = {
        toolCallId: tc.id, toolName: tc.name,
        content: '', success: false, error: msg
      }
      onChunk({ toolResult: errorResult, toolStatus: 'done', toolName: tc.name })
      messages.push({ role: 'tool', content: `Error: ${msg}`, tool_call_id: tc.id })
    }
  }

  // 监督审查 — 收集并行运行的监督结果
  if (supervisionPromise) {
    // 兜底超时：即使 runSupervisionCheck 内部超时失效，也不阻塞 Agent Loop 继续
    const supervisionResult = await Promise.race([
      supervisionPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 45_000))
    ])
    if (supervisionResult) {
      // 纠正消息全文 — 随 chunk 发送给渲染层持久化，重建消息时保持一致（缓存友好）
      const correctionMessage = needsCorrection(supervisionResult)
        ? buildCorrectionMessage(supervisionResult, round)
        : undefined
      onChunk({
        supervision: {
          verdict: supervisionResult.verdict,
          issues: supervisionResult.issues,
          correction: supervisionResult.correction,
          severity: supervisionResult.severity,
          round,
          ...(correctionMessage ? { message: correctionMessage } : {})
        }
      })
      if (correctionMessage) {
        // 末尾追加（在所有工具结果之后）— Loop 内前缀保持 append-only 稳定；
        // 渲染层持久化该消息后，重建消息列表时可保持位置与字节一致
        messages.push({ role: 'system', content: correctionMessage })
      }
    }
  }

  // 检测 todo_write 是否已标记全部任务完成 — 若是则注入收尾指令并剥离工具，强制 LLM 给出最终总结
  let allTodosDone = false
  for (const item of execResults) {
    if (item.status !== 'fulfilled') continue
    const tr = item.value.result
    if (tr.toolName === 'todo_write' && tr.success && tr.metadata) {
      const meta = tr.metadata as { done?: number; total?: number; active?: number; pending?: number }
      if (meta.total && meta.done === meta.total && (meta.active ?? 0) === 0 && (meta.pending ?? 0) === 0) {
        allTodosDone = true
        break
      }
    }
  }

  if (allTodosDone) {
    messages.push({
      role: 'system',
      content: '所有任务已标记为完成。请基于已有工作成果，直接给出最终总结回复，无需再调用任何工具。'
    })
    onChunk({ toolStatus: 'thinking' })
    return undefined
  }

  // 工具执行完毕，继续下一轮循环
  onChunk({ toolStatus: 'thinking' })

  return updatedTools
}
