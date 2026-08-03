import type { ToolCall } from '@shared/types'
import type { SingleCallResult } from './types'
import { truncateToolResult as _truncate, type AgentConfig } from '@shared/context-compress'

// ---------- 常量 ----------

/** Agent Loop 可配置参数 — 从 settings 注入，默认值与 DEFAULT_SETTINGS 一致 */
export const agentConfig = {
  maxToolRounds: 30,
  maxToolResultChars: 8000,
  maxContextChars: 300000,
  recentKeep: 5,
  snippedKeep: 200,
  prunedKeep: 80,
  checkpointEnabled: true
}

/** 从外部设置 agent 配置（由 index.ts 在 agentLoop 调用前注入） */
export function configureAgentLoop(config: Partial<typeof agentConfig>): void {
  Object.assign(agentConfig, config)
}

// ---------- 工具函数 ----------

/** 构造错误返回值 */
export function errorResult(error: string): SingleCallResult {
  return { finishReason: 'error', content: '', reasoningContent: '', toolCalls: [], error }
}

/** 从流式累积的 toolCallsAcc 中收集最终 ToolCall[] */
export function collectToolCalls(acc: Map<number, { id: string; name: string; arguments: string }>): ToolCall[] {
  return Array.from(acc.values()).map((tc) => {
    let args: Record<string, unknown> = {}
    try { args = JSON.parse(tc.arguments) } catch { /* keep empty */ }
    return { id: tc.id, name: tc.name, arguments: args } as ToolCall
  })
}

/** 截断超长工具结果，防爆上下文 — 委托给 shared/context-compress 保持逻辑一致 */
export function truncateToolResult(content: string): string {
  return _truncate(content, agentConfig as AgentConfig)
}

/**
 * 净化文本内容，移除会导致 API JSON 解析失败的不可见字符。
 *
 * 根因：web_search / web_fetch 抓取的网页内容中可能包含：
 * - 控制字符（0x00-0x1F 除 \n \r \t）
 * - 孤立 Unicode 代理对（lone surrogates, 0xD800-0xDFFF）
 * - 非 printable 字符（0x7F）
 * 这些字符经 JSON.stringify 后产生的转义序列，部分 API JSON 解析器无法正确解析，
 * 报 "unexpected end of hex escape" 错误。
 */
export function sanitizeContent(text: string): string {
  if (!text) return text
  // 移除控制字符（保留 \n \r \t）和 DEL 字符
  // 移除孤立代理对（0xD800-0xDFFF）
  return text
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[\uD800-\uDFFF]/g, '\uFFFD')
}


