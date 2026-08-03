/**
 * 监督审查 Agent — ultra 思考强度专用
 *
 * 在主 Agent Loop 的每轮工具调用后并行运行，审查主 Agent 是否：
 * 1. 偷懒（跳过验证步骤、用占位符代替实现、未读取完整文件就修改）
 * 2. 跑偏（偏离用户原始任务目标）
 * 3. 违反五锁协议（未确认计划就写代码、超出范围修改等）
 *
 * 审查结果通过 StreamChunk.supervision 推送到前端，
 * 若发现问题则将纠正指令注入主 Agent 的上下文。
 */

import type { ReasoningEffort } from '@shared/types'
import { toApiEffort } from './api'

// ---------- 类型 ----------

export interface SupervisionResult {
  verdict: 'on_track' | 'lazy' | 'off_track' | 'violation'
  issues: string[]
  correction?: string
  severity: 'low' | 'medium' | 'high'
}

export interface AgentRoundSnapshot {
  /** 当前轮次（从 1 开始） */
  round: number
  /** 用户原始任务 */
  originalTask: string
  /** 主 Agent 本轮的思考链摘要 */
  reasoning: string
  /** 主 Agent 本轮的正文输出 */
  content: string
  /** 主 Agent 本轮请求的工具调用 */
  toolCalls: { name: string; args: string }[]
  /** 已完成的工具调用及其结果摘要 */
  toolResults: { name: string; success: boolean; summary: string }[]
}

// ---------- 常量 ----------

/** 监督 Agent 超时（毫秒）— 超时则跳过本轮监督 */
const SUPERVISOR_TIMEOUT_MS = 30_000

/** 监督 Agent 系统提示词 */
const SUPERVISOR_SYSTEM_PROMPT = `你是监督审查 Agent，负责监督主 Agent 的工作质量。

## 你的职责
审查主 Agent 在当前轮次的工作，判断它是否存在以下问题：

1. **偷懒 (lazy)**：跳过必要的验证步骤、用占位符/TODO 代替实现、未读取完整文件就修改、仅修复表面症状而非根因、敷衍回答
2. **跑偏 (off_track)**：偏离用户原始任务目标、做无关的改进或重构、插入无关的技术闲聊
3. **违规 (violation)**：违反五锁协议——未确认计划就写代码、超出确认范围修改、遇到不确定时猜测而非上报、未验证就标记完成、引入未经许可的依赖
4. **正常 (on_track)**：主 Agent 正在正确执行任务，无上述问题

## 输出格式
严格输出以下 JSON（不要输出其他任何内容）：
\`\`\`json
{
  "verdict": "on_track | lazy | off_track | violation",
  "issues": ["具体问题描述"],
  "correction": "如果发现问题，给出主 Agent 必须遵守的纠正指令；无问题则为空字符串",
  "severity": "low | medium | high"
}
\`\`\`

## 审查标准
- severity=high：严重偷懒或违规（如：未读文件就改代码、用占位符交付、完全跑偏）
- severity=medium：中度问题（如：跳过验证步骤、做了少量计划外修改）
- severity=low：轻微问题（如：回答略显简略但方向正确）
- verdict=on_track 时 severity 应为 low，issues 为空数组

## 重要原则
- 你是监督者，不是执行者——只审查、只纠正，不替代主 Agent 工作
- 纠正指令必须具体、可操作，主 Agent 会直接看到并执行
- 如果主 Agent 正在按计划正常工作，不要过度干预`

// ---------- 核心函数 ----------

/**
 * 运行一次监督审查 — 非流式 API 调用，返回结构化审查结果。
 *
 * 设计为可并行：在主 Agent 执行工具期间运行，不阻塞主流程。
 * 超时或出错时返回 null，不影响主 Agent。
 */
export async function runSupervisionCheck(
  apiKey: string,
  baseUrl: string,
  model: string,
  reasoningEffort: ReasoningEffort,
  snapshot: AgentRoundSnapshot,
  signal?: AbortSignal
): Promise<SupervisionResult | null> {
  if (!apiKey) return null

  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`

  // 构建审查上下文 — 只发送摘要，不发送完整消息历史，控制成本
  const toolCallSummary = snapshot.toolCalls.length > 0
    ? snapshot.toolCalls.map((tc, i) => `  ${i + 1}. ${tc.name}(${tc.args.slice(0, 200)})`).join('\n')
    : '  (本轮无工具调用)'

  const toolResultSummary = snapshot.toolResults.length > 0
    ? snapshot.toolResults.map((tr, i) =>
        `  ${i + 1}. ${tr.name}: ${tr.success ? '✅' : '❌'} ${tr.summary.slice(0, 300)}`
      ).join('\n')
    : '  (暂无工具结果)'

  const reasoningSnippet = snapshot.reasoning.slice(0, 800)
  const contentSnippet = snapshot.content.slice(0, 800)

  const userMessage = `## 用户原始任务
${snapshot.originalTask.slice(0, 1000)}

## 主 Agent 第 ${snapshot.round} 轮工作

### 思考链摘要
${reasoningSnippet || '(无思考链)'}

### 正文输出摘要
${contentSnippet || '(无正文输出)'}

### 本轮请求的工具调用
${toolCallSummary}

### 已完成的工具结果
${toolResultSummary}

请审查主 Agent 在本轮的工作，输出 JSON 审查结果。`

  // 构建请求体
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: SUPERVISOR_SYSTEM_PROMPT },
      { role: 'user', content: userMessage }
    ],
    stream: false,
    max_tokens: 1024,
    temperature: 0.3
  }

  // 监督 Agent 也使用思考模式（如果主 Agent 使用了）
  if (reasoningEffort !== 'off') {
    body.enable_thinking = true
    body.reasoning_effort = toApiEffort(reasoningEffort)
  }

  // 超时控制 — 不阻塞主 Agent
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SUPERVISOR_TIMEOUT_MS)
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true })

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    const rawContent: string = data?.choices?.[0]?.message?.content || ''

    return parseSupervisionResult(rawContent)
  } catch {
    // 超时或网络错误 — 不影响主 Agent
    return null
  } finally {
    clearTimeout(timeout)
  }
}

// ---------- 辅助函数 ----------

/** 从 LLM 响应中解析 JSON 审查结果 */
function parseSupervisionResult(raw: string): SupervisionResult | null {
  // 尝试从 markdown 代码块中提取 JSON
  let jsonStr = raw.trim()

  // 移除可能的 markdown 代码块包裹
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim()
  }

  try {
    const parsed = JSON.parse(jsonStr)

    // 验证字段
    const verdict = parsed.verdict
    if (verdict !== 'on_track' && verdict !== 'lazy' && verdict !== 'off_track' && verdict !== 'violation') {
      return null
    }

    return {
      verdict,
      issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
      correction: typeof parsed.correction === 'string' && parsed.correction.trim() ? parsed.correction.trim() : undefined,
      severity: parsed.severity === 'high' || parsed.severity === 'medium' ? parsed.severity : 'low'
    }
  } catch {
    // JSON 解析失败 — 尝试从原始文本中提取信息
    return null
  }
}

/**
 * 判断监督结果是否需要注入纠正指令。
 * 只有 verdict !== 'on_track' 且有 correction 时才注入。
 */
export function needsCorrection(result: SupervisionResult | null): result is SupervisionResult & { correction: string } {
  return result !== null && result.verdict !== 'on_track' && !!result.correction
}

/** 构建注入主 Agent 上下文的纠正消息 */
export function buildCorrectionMessage(result: SupervisionResult, round: number): string {
  const verdictLabel: Record<SupervisionResult['verdict'], string> = {
    on_track: '正常',
    lazy: '偷懒',
    off_track: '跑偏',
    violation: '违规'
  }

  return `--- 监督审查（第 ${round} 轮）---
⚠️ 审查结论：${verdictLabel[result.verdict]}（严重程度：${result.severity}）

**发现的问题：**
${result.issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

**纠正指令（必须遵守）：**
${result.correction}

请立即根据以上纠正指令调整你的工作方式。`
}
