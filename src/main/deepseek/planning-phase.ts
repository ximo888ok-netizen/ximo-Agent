/**
 * 规划阶段 — 让 Agent 先理解任务、选出所需工具
 *
 * 用文本目录（~300 tokens）替代完整工具 schema（~15000 tokens），
 * LLM 输出任务理解 + [TOOLS] 工具列表，解析后精简工具集。
 * 规划结果保留在 messages 中作为执行阶段的上下文。
 */

import type { ChatRequest, ToolDefinition } from '@shared/types'
import type { MutableMessage } from '@shared/cache'
import { callDeepSeekStream } from './api'
import { agentConfig } from './context'
import type { StreamHandlers } from './types'

/** 构建工具文本目录（~300 tokens 替代 ~15000 tokens 的完整 schema） */
function buildToolCatalog(tools: ToolDefinition[]): string {
  const lines = tools.map(t => {
    const firstLine = t.description.split('\n')[0].slice(0, 100)
    return `- ${t.name}: ${firstLine}`
  })
  return lines.join('\n')
}

/** 从 LLM 规划输出中解析 [TOOLS] 标签内的工具名 */
function parseRequiredTools(content: string, allTools: ToolDefinition[]): ToolDefinition[] | null {
  const match = content.match(/\[TOOLS\]\s*(.*?)\s*\[\/TOOLS\]/i)
  if (!match) return null

  const names = match[1].split(/[,，\s]+/).map(s => s.trim()).filter(Boolean)
  if (names.length === 0) return null

  const nameSet = new Set(names.map(n => n.toLowerCase()))
  const filtered = allTools.filter(t => nameSet.has(t.name.toLowerCase()))

  // 至少匹配到 1 个，且不是全部（否则无过滤收益）
  if (filtered.length === 0 || filtered.length >= allTools.length) return null

  return filtered
}

/**
 * 规划阶段 — 让 Agent 先理解任务、选出所需工具
 *
 * 用文本目录替代完整工具 schema，prompt 从 ~15000 tokens 降到 ~300 tokens。
 * LLM 输出任务理解 + [TOOLS] 工具列表，解析后精简工具集。
 * 规划结果保留在 messages 中作为执行阶段的上下文。
 */
export async function runPlanningPhase(
  apiKey: string,
  baseUrl: string,
  request: ChatRequest,
  messages: MutableMessage[],
  tools: ToolDefinition[],
  handlers: StreamHandlers
): Promise<ToolDefinition[] | null> {
  const catalog = buildToolCatalog(tools)

  const planPrompt = [
    '## 任务规划阶段',
    '在执行任务前，请先理解用户需求，然后从以下工具中选出本次任务真正需要的：',
    '',
    catalog,
    '',
    '输出格式：',
    '1. 任务理解（1-2句话）',
    '2. 需要的工具，在末尾用 [TOOLS] 工具名1, 工具名2 [/TOOLS] 格式列出',
    '3. 简要执行步骤（2-5步）',
    '',
    '这是规划阶段，不要调用工具。保持精简。'
  ].join('\n')

  // 规划调用使用独立消息副本，不污染主消息前缀
  const planMessages: MutableMessage[] = [
    ...messages,
    { role: 'system', content: planPrompt }
  ]

  handlers.onChunk({ toolStatus: 'thinking', toolName: 'planning' })

  const result = await callDeepSeekStream(
    apiKey, baseUrl, request.model, planMessages, undefined,
    request.thinkingMode, request.reasoningEffort, request.temperature,
    request.maxTokens, handlers, agentConfig.capabilities
  )

  if (result.finishReason === 'error' || !result.content) return null

  // 解析所需工具
  const filtered = parseRequiredTools(result.content, tools)
  if (!filtered) return null

  // 保留规划结果到主消息数组，作为执行阶段的上下文
  messages.push({
    role: 'assistant',
    content: result.content
  })
  messages.push({
    role: 'system',
    content: '以上是你的任务规划。现在按计划执行，只使用你选定的工具。不要重复规划，直接开始。'
  })

  return filtered
}

// ---------- 任务意图深度分析（长任务模式专用）----------

/** 任务意图分析的系统提示词 */
const INTENT_ANALYSIS_PROMPT = `你是一名资深需求分析师与工程架构师。请对用户的任务请求进行深度分析。

## 分析要求
超越用户字面表述，挖掘真实需求：
1. **真实意图**：用户说的背后，用户真正想要达成什么？什么是"做完"的标志？
2. **验收标准**：列出可验证的验收标准——什么条件下任务算成功完成？
3. **约束与风险**：技术约束、依赖风险、潜在的坑（如兼容性、性能、安全）
4. **任务阶段**：将任务拆解为有序的执行阶段，每阶段有明确的产出

## 输出格式
严格输出以下 JSON：
\`\`\`json
{
  "intent": "用户真实意图的精炼描述",
  "successCriteria": ["验收标准1", "验收标准2", ...],
  "constraints": ["约束/风险1", "约束/风险2", ...],
  "phases": ["阶段1: 描述与产出", "阶段2: 描述与产出", ...]
}
\`\`\`
只输出 JSON，不要输出其他内容。`

/** 从 LLM 输出中解析任务意图分析结果 */
function parseTaskIntent(raw: string): { intent: string; successCriteria: string[]; constraints: string[]; phases: string[] } | null {
  let jsonStr = raw.trim()
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim()

  try {
    const parsed = JSON.parse(jsonStr)
    if (typeof parsed.intent !== 'string' || !parsed.intent) return null
    return {
      intent: parsed.intent,
      successCriteria: Array.isArray(parsed.successCriteria) ? parsed.successCriteria.map(String) : [],
      constraints: Array.isArray(parsed.constraints) ? parsed.constraints.map(String) : [],
      phases: Array.isArray(parsed.phases) ? parsed.phases.map(String) : []
    }
  } catch { return null }
}

/**
 * 任务意图深度分析 — 长任务模式启动时运行
 *
 * 在规划阶段和工具执行之前，先用一次 LLM 调用深度分析用户需求：
 * - 超越字面表述，挖掘真实意图与验收标准
 * - 识别隐含约束与潜在风险
 * - 建议分阶段执行路径
 *
 * 分析结果注入 messages 作为执行上下文锚点，并推送 taskIntent chunk 到前端展示。
 * 失败时静默跳过（不阻塞主流程）。
 */
export async function runTaskIntentAnalysis(
  apiKey: string,
  baseUrl: string,
  request: ChatRequest,
  messages: MutableMessage[],
  handlers: StreamHandlers
): Promise<void> {
  const lastUserMsg = messages.filter(m => m.role === 'user').pop()
  if (!lastUserMsg || !lastUserMsg.content) return

  // 独立消息副本 — 不污染主消息前缀
  const analysisMessages: MutableMessage[] = [
    { role: 'system', content: INTENT_ANALYSIS_PROMPT },
    { role: 'user', content: lastUserMsg.content }
  ]

  handlers.onChunk({ toolStatus: 'thinking', toolName: 'intent-analysis' })

  try {
    const result = await callDeepSeekStream(
      apiKey, baseUrl, request.model, analysisMessages, undefined,
      request.thinkingMode, request.reasoningEffort, request.temperature,
      4096, handlers, agentConfig.capabilities
    )

    if (result.finishReason === 'error' || !result.content) return

    const parsed = parseTaskIntent(result.content)
    if (!parsed) return

    // 推送到前端展示
    handlers.onChunk({ taskIntent: parsed })

    // 注入 messages 作为执行上下文锚点 — 后续每轮工作都基于此分析
    const intentSummary = [
      '## 任务意图分析结果',
      `**真实意图**：${parsed.intent}`,
      parsed.successCriteria.length > 0
        ? `**验收标准**：\n${parsed.successCriteria.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}`
        : '',
      parsed.constraints.length > 0
        ? `**约束与风险**：\n${parsed.constraints.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}`
        : '',
      parsed.phases.length > 0
        ? `**建议执行阶段**：\n${parsed.phases.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}`
        : '',
      '',
      '请基于以上分析执行任务。每一步工作都应指向满足验收标准。遇到约束/风险时主动规避或上报。'
    ].filter(Boolean).join('\n')

    messages.push({ role: 'system', content: intentSummary })
  } catch {
    // 分析失败不阻塞主流程
  }
}
