/**
 * Context Summary — LLM 摘要压缩，参考 Reasonix 的 compact() 设计
 *
 * 当上下文窗口占用达到 compact 阈值（80%）时：
 * 1. 计算 pinned prefix（system + 第一个用户消息 + 之前的摘要）
 * 2. 计算 tail budget（保留最近的 16384 tokens 或窗口 50%）
 * 3. 将 pinned prefix 和 tail 之间的消息区域分离为 kept/fold
 * 4. 归档 fold 区域到 .jsonl
 * 5. 调用 LLM 生成结构化摘要
 * 6. 用 pinned + kept + summary + tail 替换消息
 */

import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import type { MutableMessage } from './context-manager'
import type { CompactionStats } from './types'

const SUMMARY_TAG_OPEN = '<compaction-summary>'
const SUMMARY_TAG_CLOSE = '</compaction-summary>'

const SUMMARY_SYSTEM_PROMPT = [
  "You are compacting the earlier part of a coding agent's conversation to save context.",
  "The agent keeps your summary alongside the user's own turns (kept verbatim) and the recent tail; your job is to fold the assistant/tool work into a briefing it can resume from.",
  "Write under these exact headings, omitting a heading only if it has no content:",
  "",
  "## Key references",
  "A concise index of every file path, function name, variable name, class name, and identifier mentioned in the folded messages. List them as bullet points \u2014 this is the quick-reference the agent scans first, so be thorough and exact. Do NOT include descriptions here, just the identifiers.",
  "",
  "## Standing facts & constraints",
  'Everything the user stated that still governs the work \u2014 names, paths, IDs, versions, tokens, preferences, and hard "never do X" rules \u2014 in their own words. Be exhaustive; this is the durable contract, so prefer over- to under-including.',
  "",
  "## Goal",
  "The user's request and intent.",
  "",
  "## Decisions & rationale",
  "Key choices made so far and why \u2014 so they are not re-litigated or reversed.",
  "",
  "## Files & code",
  "Files read or modified, with the specific facts that matter: signatures, line locations, data shapes, and exact edits applied. Be concrete; this is what lets the agent act without re-reading everything.",
  "",
  "## Commands & outcomes",
  "Commands run (builds, tests, git) and their relevant results \u2014 what passed, what failed, and the error text that matters.",
  "",
  "## Errors & fixes",
  "Problems hit and how they were resolved (or not), so the same dead ends are not repeated.",
  "",
  "## Pending & next step",
  "What is still in progress or unstarted, and the single most concrete next action to take.",
  "",
  "Rules: be terse \u2014 bullet points and fragments, not prose. Preserve identifiers, paths, and numbers exactly. Do NOT invent anything not present in the messages; if something is unknown, leave it out rather than guessing.",
].join('\n')

const FALLBACK_TOK_PER_CHAR = 0.25
const DEFAULT_TAIL_TOKENS = 16384
const DEFAULT_COMPACT_TARGET = 0.5
const MIN_FOLD_TOKENS = 400
const MAX_PINNED_FIRST_USER_TOKENS = 1500
const PINNED_FIRST_USER_WINDOW_FRAC = 0.15

/** 判断是否为之前的摘要消息 */
export function isCompactionSummary(m: MutableMessage): boolean {
  return m.role === 'user' && m.content.trimStart().startsWith(SUMMARY_TAG_OPEN)
}

/** 估算消息 token 数 — ~4 chars/token */
function estimateTokens(s: string): number {
  return Math.ceil((s?.length ?? 0) * FALLBACK_TOK_PER_CHAR)
}

/** 计算 pinned prefix 长度 — system + 第一个用户消息（小）+ 之前的摘要 */
export function pinnedPrefixLen(messages: MutableMessage[], contextWindow: number): number {
  let i = 0
  if (i < messages.length && messages[i].role === 'system') i++
  if (i < messages.length && messages[i].role === 'user' && !isCompactionSummary(messages[i])) {
    const budget = Math.min(MAX_PINNED_FIRST_USER_TOKENS, Math.floor(contextWindow * PINNED_FIRST_USER_WINDOW_FRAC))
    if (estimateTokens(messages[i].content) <= budget) i++
  }
  while (i < messages.length && isCompactionSummary(messages[i])) i++
  return i
}

/** 计算 tail 开始位置 — 从末尾向前，直到 token 预算用完 */
export function tailStart(messages: MutableMessage[], head: number, budgetTokens: number, minKeep: number): number {
  let start = messages.length
  let acc = 0
  for (let i = messages.length - 1; i > head; i--) {
    const c = estimateTokens(messages[i].content)
    if (messages.length - i > minKeep && acc + c > budgetTokens) break
    acc += c
    start = i
  }
  while (start > head && start < messages.length && messages[start].role === 'tool') start--
  return start
}

/** 分离 kept/fold — 小用户消息和之前的摘要保留，其余折叠 */
function partitionFold(region: MutableMessage[]): { kept: MutableMessage[]; fold: MutableMessage[] } {
  const kept: MutableMessage[] = []
  const fold: MutableMessage[] = []
  for (const m of region) {
    if (isCompactionSummary(m) || (m.role === 'user' && estimateTokens(m.content) < 200)) {
      kept.push(m)
    } else {
      fold.push(m)
    }
  }
  return { kept, fold }
}

/** 将消息渲染为文本（用于摘要输入） */
function renderTranscript(msgs: MutableMessage[]): string {
  const parts: string[] = []
  for (const m of msgs) {
    switch (m.role) {
      case 'user':
        parts.push('[user]\n' + m.content + '\n')
        break
      case 'assistant':
        if (m.content) parts.push('[assistant]\n' + m.content)
        if (m.tool_calls) {
          const tcs = m.tool_calls as Array<{ function?: { name?: string; arguments?: string } }>
          for (const tc of tcs) {
            parts.push('[assistant calls ' + (tc.function?.name ?? '') + '] ' + (tc.function?.arguments ?? '').slice(0, 200))
          }
        }
        parts.push('')
        break
      case 'tool':
        parts.push('[tool result]\n' + (m.content ?? '').slice(0, 500) + '\n')
        break
      case 'system':
        parts.push('[system]\n' + m.content + '\n')
        break
    }
  }
  return parts.join('\n')
}

/**
 * 预扫描 fold 区域，提取关键实体（文件路径、命令、工具名）。
 *
 * 这些实体作为「已确认存在」的提示附加到 LLM 摘要输入中，
 * 帮助 LLM 在生成 Key references 部分时不遗漏重要标识符。
 * 同时作为摘要消息头部的前置索引，让下一轮 Agent 快速定位涉及的对象。
 */
function extractKeyEntities(msgs: MutableMessage[]): {
  filePaths: string[]
  commands: string[]
  toolNames: string[]
} {
  const filePathSet = new Set<string>()
  const commandSet = new Set<string>()
  const toolNameSet = new Set<string>()

  // 文件路径正则：匹配 /path/to/file.ext 或 C:\path\to\file.ext 或 ./relative/path.ext
  const filePathRe = /(?:\.?\/|[A-Za-z]:\\)[\w\-./\\]+\.[a-zA-Z]{1,8}/g
  // 命令行：匹配 `> command` 格式（terminal_exec 输出）
  const commandRe = /^>\s+(.+)$/gm

  for (const m of msgs) {
    if (m.role === 'tool' && m.content) {
      // 提取文件路径
      const matches = m.content.matchAll(filePathRe)
      for (const match of matches) {
        const p = match[0]
        // 过滤太短或太长的误匹配
        if (p.length >= 5 && p.length <= 200) filePathSet.add(p)
      }
      // 提取命令
      const cmdMatches = m.content.matchAll(commandRe)
      for (const match of cmdMatches) {
        const cmd = match[1].trim()
        if (cmd.length >= 2 && cmd.length <= 200) commandSet.add(cmd)
      }
    }
    if (m.role === 'assistant' && m.tool_calls) {
      const tcs = m.tool_calls as Array<{ function?: { name?: string } }>
      for (const tc of tcs) {
        if (tc.function?.name) toolNameSet.add(tc.function.name)
      }
    }
  }

  return {
    filePaths: [...filePathSet].slice(0, 30),
    commands: [...commandSet].slice(0, 15),
    toolNames: [...toolNameSet]
  }
}

/** 归档消息到 .jsonl */
async function archiveMessages(msgs: MutableMessage[]): Promise<string | null> {
  try {
    const dir = join(tmpdir(), 'ximo-agent-compaction-archive')
    await mkdir(dir, { recursive: true })
    const path = join(dir, 'archive-' + Date.now() + '.jsonl')
    const lines = msgs.map(m => JSON.stringify(m)).join('\n')
    await writeFile(path, lines, 'utf-8')
    return path
  } catch {
    return null
  }
}

/** 调用 LLM 生成摘要 — 附加预提取实体作为提示 */
async function summarizeMessages(
  apiKey: string, baseUrl: string, model: string,
  region: MutableMessage[], signal?: AbortSignal
): Promise<string | null> {
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions'
  const transcript = renderTranscript(region)
  const entities = extractKeyEntities(region)

  // 将预提取实体作为前置提示附加到 transcript
  const entityHints: string[] = []
  if (entities.filePaths.length > 0) {
    entityHints.push('[Pre-extracted file paths found in folded messages]\n' + entities.filePaths.map((p) => '- ' + p).join('\n'))
  }
  if (entities.commands.length > 0) {
    entityHints.push('[Pre-extracted commands run]\n' + entities.commands.map((c) => '- ' + c).join('\n'))
  }
  if (entities.toolNames.length > 0) {
    entityHints.push('[Tools used]\n' + entities.toolNames.map((t) => '- ' + t).join('\n'))
  }
  const userContent = entityHints.length > 0
    ? entityHints.join('\n\n') + '\n\n---\n\n' + transcript
    : transcript

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: userContent }
        ],
        max_tokens: 4096,
        stream: false
      }),
      signal
    })

    if (!response.ok) return null
    const data = await response.json()
    return data?.choices?.[0]?.message?.content?.trim() || null
  } catch {
    return null
  }
}

/** 完整的摘要压缩流程 — 参考 Reasonix compact() */
export async function compactWithSummary(
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: MutableMessage[],
  contextWindow: number,
  recentKeep: number,
  signal?: AbortSignal
): Promise<CompactionStats> {
  const empty: CompactionStats = { tier: 'none', snippedResults: 0, prunedResults: 0, savedChars: 0, stuckPaused: false }

  // 1. 计算 head（pinned prefix）和 start（tail 开始）
  const head = pinnedPrefixLen(messages, contextWindow)
  const budget = Math.min(DEFAULT_TAIL_TOKENS, Math.floor(contextWindow * DEFAULT_COMPACT_TARGET))
  const minKeep = Math.max(2, recentKeep)
  const start = tailStart(messages, head, budget, minKeep)

  if (start - head < 2) return empty

  const region = messages.slice(head, start)

  // 2. 分离 kept/fold
  const { kept, fold } = partitionFold(region)
  if (fold.length === 0) return empty

  // 3. 经济性检查 — fold 区域太小不值得摘要调用
  const foldTokens = fold.reduce((s, m) => s + estimateTokens(m.content), 0)
  if (foldTokens < MIN_FOLD_TOKENS) return empty

  // 4. 归档原始消息
  await archiveMessages(fold)

  // 5. 调用 LLM 生成摘要（附加预提取实体提示）
  let summary = await summarizeMessages(apiKey, baseUrl, model, fold, signal)
  if (!summary) {
    // LLM 摘要失败时，将预提取实体作为退路摘要
    const entities = extractKeyEntities(fold)
    const entityLines: string[] = []
    if (entities.filePaths.length > 0) entityLines.push('**Files:** ' + entities.filePaths.join(', '))
    if (entities.commands.length > 0) entityLines.push('**Commands:** ' + entities.commands.join(', '))
    if (entities.toolNames.length > 0) entityLines.push('**Tools:** ' + entities.toolNames.join(', '))
    const fallbackEntity = entityLines.length > 0 ? '\n' + entityLines.join('\n') : ''
    summary = fold.length + ' earlier message(s) were folded here to free context, but the automatic summary was unavailable.' + fallbackEntity + '\nAsk the user if you need details from before this point.'
  }

  // 6. 用 pinned + kept + summary + tail 替换消息
  const summaryMsg: MutableMessage = {
    role: 'user',
    content: SUMMARY_TAG_OPEN + '\nSummary of earlier conversation (older messages were compacted to save context):\n' + summary + '\n' + SUMMARY_TAG_CLOSE
  }

  const compacted = [
    ...messages.slice(0, head),
    ...kept,
    summaryMsg,
    ...messages.slice(start)
  ]

  const savedChars = region.reduce((s, m) => s + (m.content?.length ?? 0), 0) - summary.length

  // 原地替换
  messages.length = 0
  messages.push(...compacted)

  return {
    tier: 'compact',
    snippedResults: 0,
    prunedResults: fold.length,
    savedChars,
    stuckPaused: false
  }
}
