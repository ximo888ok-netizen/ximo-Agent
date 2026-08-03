import { createHash } from 'crypto'
import type { ToolDefinition } from '@shared/types/tools'
import { normalizeToolSchemas } from '@shared/cache/tool-normalize'
import type { PrefixShape, CacheDiagnostics, NormalizedUsage } from '@shared/cache/types'

/**
 * PrefixShape 哈希诊断 — 参考 Reasonix 的 cache_shape.go
 *
 * 每轮 API 请求前捕获前缀形状快照（system + tools + rewrite version），
 * 轮间对比可解释 cache miss 的原因。
 *
 * 仅在主进程使用（依赖 Node.js crypto 模块）。
 */

function shortHash(v: string): string {
  return createHash('sha256').update(v).digest('hex').slice(0, 8)
}

/** 估算 token 数 — ~4 chars/token，诊断用途足够 */
function estimateTokens(s: string): number {
  if (!s) return 0
  return Math.floor(s.length / 4)
}

/**
 * CaptureShape — 捕获当前前缀形状快照
 */
export function captureShape(
  systemPrompt: string,
  tools: ToolDefinition[],
  rewriteVersion: number
): PrefixShape {
  const normalized = normalizeToolSchemas(tools)
  const toolsJSON = JSON.stringify(normalized)
  return {
    systemHash: shortHash(systemPrompt),
    toolsHash: shortHash(toolsJSON),
    prefixHash: shortHash(systemPrompt + toolsJSON),
    logRewriteVersion: rewriteVersion,
    toolSchemaTokens: estimateTokens(toolsJSON)
  }
}

/**
 * CompareShape — 对比两个前缀形状，生成诊断信息
 *
 * - SystemHash 变 → "system"
 * - ToolsHash 变 → "tools"
 * - LogRewriteVersion 变 → "log_rewrite"
 */
export function compareShape(
  prev: PrefixShape,
  cur: PrefixShape,
  usage?: NormalizedUsage | null
): CacheDiagnostics {
  const reasons: string[] = []
  if (prev.systemHash && prev.systemHash !== cur.systemHash) {
    reasons.push('system')
  }
  if (prev.toolsHash && prev.toolsHash !== cur.toolsHash) {
    reasons.push('tools')
  }
  if (prev.logRewriteVersion !== cur.logRewriteVersion) {
    reasons.push('log_rewrite')
  }

  return {
    prefixHash: cur.prefixHash,
    prefixChanged: reasons.length > 0,
    prefixChangeReasons: reasons,
    systemHash: cur.systemHash,
    toolsHash: cur.toolsHash,
    logRewriteVersion: cur.logRewriteVersion,
    toolSchemaTokens: cur.toolSchemaTokens,
    cacheMissTokens: usage?.cacheMissTokens ?? 0,
    cacheHitTokens: usage?.cacheHitTokens ?? 0
  }
}
