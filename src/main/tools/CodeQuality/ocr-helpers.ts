import type { ToolResult } from '@shared/types'

type ReviewScope = 'uncommitted' | 'branch' | 'commit'

// execAsync 的类型 — 与 CodeReviewTool 中一致
type ExecAsync = (cmd: string, options?: Record<string, unknown>) => Promise<{ stdout: string; stderr: string }>

/**
 * OCR (Open Code Review) 辅助函数 — 纯函数 + 独立 exec 调用，
 * 从 CodeReviewTool 类中提取以控制文件行数。
 */

// ── 错误结果构造 ──────────────────────────────────────────

export function createErrorResult(id: string, msg: string): ToolResult {
  return { toolCallId: id, toolName: 'code_review', content: '', success: false, error: msg }
}

// ── OCR 安装检查 ──────────────────────────────────────────

/** 检查 OCR CLI 是否已安装 — 尝试多种子命令兼容不同版本 */
export async function isOcrInstalled(
  execAsync: ExecAsync,
  signal?: AbortSignal
): Promise<boolean> {
  try {
    await execAsync('ocr --version 2>&1 || ocr version 2>&1', {
      timeout: 10000, windowsHide: true, signal
    } as never)
    return true
  } catch {
    // Windows 上 ocr --version 可能返回非零退出码但命令存在
    try {
      await execAsync('ocr --help 2>&1', {
        timeout: 10000, windowsHide: true, signal
      } as never)
      return true
    } catch {
      return false
    }
  }
}

// ── 审查范围标签 ──────────────────────────────────────────

/** 生成审查范围的可读标签 */
export function scopeLabel(scope: ReviewScope, args: Record<string, unknown>): string {
  switch (scope) {
    case 'uncommitted':
      return '未提交的工作区变更'
    case 'branch':
      return `${args.fromRef || '?'} → ${args.toRef || '?'} 分支差异`
    case 'commit':
      return `提交 ${args.commitHash || '?'}`
    default:
      return scope
  }
}

// ── JSON 审查意见提取 ─────────────────────────────────────

interface ReviewItem {
  file: string
  line: number | null
  severity: string
  rule: string | null
  message: string
}

interface ExtractedReview {
  items: ReviewItem[]
  summary: string | null
}

/** 从 JSON 输出中提取审查意见项 — 兼容多种可能的 JSON 结构 */
export function extractReviewItems(parsed: unknown): ExtractedReview {
  const items: ReviewItem[] = []
  let summary: string | null = null

  const data = parsed as Record<string, unknown>

  // 尝试多种可能的 JSON 结构
  // 结构 1: { reviews: [...] }
  // 结构 2: { results: [...] }
  // 结构 3: { comments: [...] }
  // 结构 4: { issues: [...] }
  // 结构 5: 数组形式 [...]
  let rawItems: unknown[] = []

  if (Array.isArray(data)) {
    rawItems = data
  } else if (Array.isArray(data.reviews)) {
    rawItems = data.reviews
  } else if (Array.isArray(data.results)) {
    rawItems = data.results
  } else if (Array.isArray(data.comments)) {
    rawItems = data.comments
  } else if (Array.isArray(data.issues)) {
    rawItems = data.issues
  }

  if (typeof data.summary === 'string') {
    summary = data.summary
  } else if (typeof data.total === 'number') {
    summary = `共 ${data.total} 条`
  }

  for (const raw of rawItems) {
    const item = raw as Record<string, unknown>
    const file = String(item.file || item.filePath || item.file_path || item.path || '未知文件')
    const line = (item.line || item.lineNumber || item.line_number) as number | undefined
    const severity = String(item.severity || item.level || item.type || 'info')
    const rule = (item.rule || item.ruleId || item.rule_id) as string | undefined
    const message = String(item.message || item.content || item.description || item.comment || '')

    if (file || message) {
      items.push({
        file,
        line: line ? Number(line) : null,
        severity,
        rule: rule || null,
        message: message || '(无描述)'
      })
    }
  }

  return { items, summary }
}

// ── JSON 结果格式化 ───────────────────────────────────────

/** 解析 JSON 格式输出并格式化为 Markdown */
export function formatJsonResult(
  toolCallId: string,
  rawOutput: string,
  scope: ReviewScope,
  repoPath: string,
  stderr: string
): ToolResult {
  let parsed: unknown = null
  let parseError = ''

  try {
    parsed = JSON.parse(rawOutput)
  } catch {
    parseError = 'JSON 解析失败，以原始文本展示'
  }

  const lines = [
    '## 🤖 AI 代码审查结果 (OCR)',
    `**审查范围**：${scopeLabel(scope, {} as Record<string, unknown>)}`,
    `**仓库**：\`${repoPath}\``,
    ''
  ]

  if (parseError) {
    lines.push(`> ⚠️ ${parseError}`, '', '```json', rawOutput.slice(0, 50000), '```')
  } else {
    const reviewData = extractReviewItems(parsed)
    if (reviewData.items.length > 0) {
      lines.push(`**发现 ${reviewData.items.length} 条审查意见**：\n`)

      for (const item of reviewData.items) {
        const icon = item.severity === 'error' ? '❌' : item.severity === 'warning' ? '⚠️' : '💡'
        lines.push(`### ${icon} \`${item.file}${item.line ? `:${item.line}` : ''}\``)
        if (item.rule) lines.push(`**规则**：\`${item.rule}\``)
        lines.push('', item.message, '')
      }

      if (reviewData.summary) {
        lines.push('', '---', '', `**摘要**：${reviewData.summary}`)
      }
    } else {
      lines.push('```json', JSON.stringify(parsed, null, 2).slice(0, 50000), '```')
    }
  }

  if (stderr) {
    lines.push('', '<details><summary>警告信息</summary>', '', '```', stderr.slice(0, 5000), '```', '', '</details>')
  }

  return {
    toolCallId, toolName: 'code_review',
    content: lines.join('\n'),
    success: true,
    displayType: 'text',
    metadata: {
      scope, format: 'json', repoPath,
      itemCount: parsed ? extractReviewItems(parsed).items.length : 0
    }
  }
}
