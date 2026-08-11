/**
 * 跨会话知识沉淀 — Agent Loop 结束时自动提取可复用知识
 *
 * 当 Agent 完成多轮工具调用任务后（round ≥ 3 且有 tool_calls），
 * 调用 LLM 从对话历史中提取：
 *   - 解决方案（如何解决了某个问题）
 *   - 踩过的坑（什么导致了失败、如何避免）
 *   - 关键决策（为什么选择 A 而非 B）
 *
 * 提取的知识存入 KnowledgeStore（按模式分区），后续新会话可通过
 * knowledge(action="search") 工具检索，实现跨会话知识复用。
 *
 * 设计原则：
 *   - 不阻塞主流程 — 后台执行，失败静默
 *   - 经济性门控 — 只在足够复杂的会话中提取（避免简单问答浪费 API 调用）
 *   - 去重 — 标题相似的知识条目不重复写入
 */

import type { Mode } from '@shared/types'
import type { MutableMessage } from '@shared/cache'
import { addKnowledge, searchKnowledge } from '@main/KnowledgeStore'

/** 触发知识提取的最低轮次 — 低于此轮次的会话不够复杂，不值得提取 */
const MIN_ROUNDS_FOR_EXTRACTION = 3

/** 知识提取 LLM 提示词 */
const EXTRACTION_PROMPT = `You are extracting reusable knowledge from a completed coding agent session.
Analyze the conversation and extract knowledge that would help a future agent working on a similar task.

For each piece of knowledge, output a JSON object with these fields:
- "title": A concise, searchable title (e.g., "Fixing ESLint 'no-explicit-any' in TypeScript")
- "content": The detailed knowledge — what was the problem, what was the solution, why it works
- "tags": 1-5 relevant tags for categorization

Only extract knowledge that is:
1. **Reusable** — applies to future tasks, not specific to this one conversation
2. **Non-obvious** — things that required investigation, trial-and-error, or domain expertise
3. **Actionable** — a future agent can apply this knowledge directly

Do NOT extract:
- Simple facts already obvious from the code (e.g., "the project uses TypeScript")
- User preferences (those go in memory, not knowledge base)
- One-off issues that won't recur

Output a JSON array of knowledge entries. If nothing worth extracting, output an empty array [].
Output ONLY the JSON array, no other text.`

/** 提取的知识条目（LLM 输出格式） */
interface ExtractedKnowledge {
  title: string
  content: string
  tags: string[]
}

/** 判断会话是否值得提取知识 */
export function shouldExtractKnowledge(
  messages: MutableMessage[],
  round: number
): boolean {
  if (round < MIN_ROUNDS_FOR_EXTRACTION) return false
  // 至少有 2 次工具调用
  let toolCallCount = 0
  for (const m of messages) {
    if (m.role === 'assistant' && m.tool_calls) {
      toolCallCount += (m.tool_calls as unknown[]).length
    }
  }
  return toolCallCount >= 2
}

/** 将对话消息渲染为 LLM 输入文本 */
function renderForExtraction(msgs: MutableMessage[]): string {
  const parts: string[] = []
  for (const m of msgs) {
    switch (m.role) {
      case 'user':
        parts.push(`[User]: ${m.content.slice(0, 500)}`)
        break
      case 'assistant':
        if (m.content) parts.push(`[Assistant]: ${m.content.slice(0, 300)}`)
        if (m.tool_calls) {
          const tcs = m.tool_calls as Array<{ function?: { name?: string; arguments?: string } }>
          for (const tc of tcs) {
            parts.push(`[Tool call: ${tc.function?.name}] ${(tc.function?.arguments ?? '').slice(0, 100)}`)
          }
        }
        break
      case 'tool':
        parts.push(`[Tool result]: ${(m.content ?? '').slice(0, 200)}`)
        break
      // 跳过 system 消息 — 包含大量提示词，与知识提取无关
    }
  }
  return parts.join('\n')
}

/** 解析 LLM 返回的知识条目 JSON */
function parseExtractedKnowledge(raw: string): ExtractedKnowledge[] {
  let jsonStr = raw.trim()
  // 移除 markdown 代码块包裹
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim()

  try {
    const parsed = JSON.parse(jsonStr)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is ExtractedKnowledge =>
        typeof item?.title === 'string' && typeof item?.content === 'string' &&
        item.title.trim().length > 0 && item.content.trim().length > 0
      )
      .map((item) => ({
        title: item.title.trim().slice(0, 200),
        content: item.content.trim().slice(0, 4000),
        tags: Array.isArray(item.tags) ? item.tags.map(String).slice(0, 5) : []
      }))
  } catch {
    return []
  }
}

/** 检查知识库中是否已有标题相似的条目（避免重复写入） */
async function isDuplicate(mode: Mode, title: string): Promise<boolean> {
  try {
    // 用标题前 20 个字符作为搜索词
    const searchTerms = title.slice(0, 20)
    if (searchTerms.length < 5) return false
    const result = await searchKnowledge(mode, searchTerms, 1, 5)
    return result.results.some((r) => {
      // 标题相似度：完全相同或一方包含另一方
      const t1 = r.title.toLowerCase()
      const t2 = title.toLowerCase()
      return t1 === t2 || t1.includes(t2) || t2.includes(t1)
    })
  } catch {
    return false
  }
}

/**
 * 从完成的会话中提取可复用知识并存入知识库。
 *
 * 后台执行，不阻塞主流程。失败时静默返回。
 */
export async function extractKnowledgeFromConversation(
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: MutableMessage[],
  mode: Mode,
  round: number,
  signal?: AbortSignal
): Promise<void> {
  if (!shouldExtractKnowledge(messages, round)) return
  if (!apiKey) return

  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`
  const transcript = renderForExtraction(messages)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: EXTRACTION_PROMPT },
          { role: 'user', content: transcript }
        ],
        max_tokens: 2048,
        temperature: 0.3,
        stream: false
      }),
      signal
    })

    if (!response.ok) return
    const data = await response.json()
    const rawContent: string = data?.choices?.[0]?.message?.content || ''
    const entries = parseExtractedKnowledge(rawContent)

    // 逐条写入知识库（去重）
    for (const entry of entries) {
      if (await isDuplicate(mode, entry.title)) continue
      await addKnowledge(mode, {
        title: entry.title,
        content: entry.content,
        tags: entry.tags,
        source: 'auto-extracted'
      })
    }
  } catch {
    // 静默失败 — 知识提取是增强功能，不应影响主流程
  }
}
