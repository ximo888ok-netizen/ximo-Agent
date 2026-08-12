import { exec } from 'child_process'
import { promisify } from 'util'
import type { ToolResult } from '@shared/types'
import { scopeLabel, formatJsonResult, createErrorResult } from './ocr-helpers'

const execAsync = promisify(exec)

type ReviewScope = 'uncommitted' | 'branch' | 'commit'

/** 运行 OCR 代码审查 — 构建 CLI 命令、执行、格式化结果 */
export async function runOcrReview(
  toolCallId: string,
  repoPath: string,
  scope: ReviewScope,
  format: string,
  args: Record<string, unknown>,
  signal?: AbortSignal
): Promise<ToolResult> {
  const cmdParts: string[] = ['ocr', 'review']

  switch (scope) {
    case 'uncommitted':
      break

    case 'branch': {
      const fromRef = args.fromRef as string
      const toRef = args.toRef as string
      if (!fromRef || !toRef) {
        return createErrorResult(toolCallId, 'scope=branch 需要 fromRef 和 toRef 参数（如 fromRef=main, toRef=feature/pay）')
      }
      cmdParts.push('--from', fromRef, '--to', toRef)
      break
    }

    case 'commit': {
      const commitHash = args.commitHash as string
      if (!commitHash) {
        return createErrorResult(toolCallId, 'scope=commit 需要 commitHash 参数')
      }
      cmdParts.push('--commit', commitHash)
      break
    }

    default:
      return createErrorResult(toolCallId, `不支持的审查范围：${scope}`)
  }

  if (format === 'json') {
    cmdParts.push('--format', 'json')
  }

  const cmd = cmdParts.join(' ')

  try {
    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 300000,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
      signal,
      cwd: repoPath
    } as never)

    const output = String(stdout || '').trim()
    const errOutput = String(stderr || '').trim()

    if (!output && !errOutput) {
      return {
        toolCallId, toolName: 'code_review',
        content: '## ✅ 代码审查完成\n\n未发现需要关注的问题，或工作区无变更。',
        success: true,
        displayType: 'text',
        metadata: { scope, format, repoPath }
      }
    }

    if (format === 'json') {
      return formatJsonResult(toolCallId, output, scope, repoPath, errOutput)
    }

    const lines = [
      '## 🤖 AI 代码审查结果 (OCR)',
      `**审查范围**：${scopeLabel(scope, args)}`,
      `**仓库**：\`${repoPath}\``,
      '',
      output.slice(0, 50000)
    ]

    if (errOutput && !output) {
      lines.length = 4
      lines.push('```', errOutput.slice(0, 30000), '```')
    }

    return {
      toolCallId, toolName: 'code_review',
      content: lines.join('\n'),
      success: true,
      displayType: 'text',
      metadata: { scope, format, repoPath, outputLength: output.length }
    }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: number | string }

    const stdout = String(err.stdout || '').trim()
    const stderr = String(err.stderr || '').trim()

    if (stdout) {
      if (format === 'json') {
        return formatJsonResult(toolCallId, stdout, scope, repoPath, stderr)
      }

      const lines = [
        '## 🤖 AI 代码审查结果 (OCR)',
        `**审查范围**：${scopeLabel(scope, args)}`,
        `**仓库**：\`${repoPath}\``,
        '',
        stdout.slice(0, 50000)
      ]

      if (stderr) {
        lines.push('', '<details><summary>警告信息</summary>', '', '```', stderr.slice(0, 5000), '```', '', '</details>')
      }

      return {
        toolCallId, toolName: 'code_review',
        content: lines.join('\n'),
        success: true,
        displayType: 'text',
        metadata: { scope, format, repoPath, exitCode: err.code }
      }
    }

    const isCmdNotFound = err.code === 127 || (err as Error).message?.includes('not found') ||
      (err as Error).message?.includes('不是内部或外部命令') || (err as Error).message?.includes('is not recognized')

    if (isCmdNotFound) {
      return createErrorResult(toolCallId,
        'OCR 命令未找到。请先安装：\n```\nnpm install -g @alibaba-group/open-code-review\n```'
      )
    }

    const errMsg = stderr || (e as Error).message
    return createErrorResult(toolCallId, `OCR 审查执行失败：${errMsg.slice(0, 2000)}`)
  }
}
