/**
 * context-summary 内部辅助函数 — 从 context-summary.ts 提取
 */

import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import type { MutableMessage } from './context-manager'

export const SUMMARY_TAG_OPEN = '<compaction-summary>'
export const SUMMARY_TAG_CLOSE = '</compaction-summary>'

export const SUMMARY_SYSTEM_PROMPT = [
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

export const FALLBACK_TOK_PER_CHAR = 0.25
export const DEFAULT_TAIL_TOKENS = 16384
export const DEFAULT_COMPACT_TARGET = 0.5
export const MIN_FOLD_TOKENS = 400
export const MAX_PINNED_FIRST_USER_TOKENS = 1500
export const PINNED_FIRST_USER_WINDOW_FRAC = 0.15

/** 估算消息 token 数 — ~4 chars/token */
export function estimateTokens(s: string): number {
  return Math.ceil((s?.length ?? 0) * FALLBACK_TOK_PER_CHAR)
}

/** 分离 kept/fold — 小用户消息和之前的摘要保留，其余折叠 */
export function partitionFold(region: MutableMessage[]): { kept: MutableMessage[]; fold: MutableMessage[] } {
  const kept: MutableMessage[] = []
  const fold: MutableMessage[] = []
  for (const m of region) {
    if (m.role === 'user' && m.content.trimStart().startsWith(SUMMARY_TAG_OPEN) || (m.role === 'user' && estimateTokens(m.content) < 200)) {
      kept.push(m)
    } else {
      fold.push(m)
    }
  }
  return { kept, fold }
}

/** 将消息渲染为文本（用于摘要输入） */
export function renderTranscript(msgs: MutableMessage[]): string {
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
 */
export function extractKeyEntities(msgs: MutableMessage[]): {
  filePaths: string[]
  commands: string[]
  toolNames: string[]
} {
  const filePathSet = new Set<string>()
  const commandSet = new Set<string>()
  const toolNameSet = new Set<string>()

  const filePathRe = /(?:\.?\/|[A-Za-z]:\\)[\w\-./\\]+\.[a-zA-Z]{1,8}/g
  const commandRe = /^>\s+(.+)$/gm

  for (const m of msgs) {
    if (m.role === 'tool' && m.content) {
      const matches = m.content.matchAll(filePathRe)
      for (const match of matches) {
        const p = match[0]
        if (p.length >= 5 && p.length <= 200) filePathSet.add(p)
      }
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
export async function archiveMessages(msgs: MutableMessage[]): Promise<string | null> {
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
export async function summarizeMessages(
  apiKey: string, baseUrl: string, model: string,
  region: MutableMessage[], signal?: AbortSignal
): Promise<string | null> {
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions'
  const transcript = renderTranscript(region)
  const entities = extractKeyEntities(region)

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
