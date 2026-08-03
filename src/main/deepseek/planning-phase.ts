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
    request.maxTokens, handlers
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
