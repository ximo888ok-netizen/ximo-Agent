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

import type { MutableMessage } from './context-manager'
import type { CompactionStats } from './types'
import {
  SUMMARY_TAG_OPEN, SUMMARY_TAG_CLOSE,
  FALLBACK_TOK_PER_CHAR, DEFAULT_TAIL_TOKENS, DEFAULT_COMPACT_TARGET,
  MIN_FOLD_TOKENS, MAX_PINNED_FIRST_USER_TOKENS, PINNED_FIRST_USER_WINDOW_FRAC,
  estimateTokens, partitionFold, extractKeyEntities, archiveMessages, summarizeMessages
} from './context-summary-helpers'

/** 判断是否为之前的摘要消息 */
export function isCompactionSummary(m: MutableMessage): boolean {
  return m.role === 'user' && m.content.trimStart().startsWith(SUMMARY_TAG_OPEN)
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
