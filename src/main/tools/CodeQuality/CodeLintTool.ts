import { exec } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

const execAsync = promisify(exec)

/**
 * CodeLintTool — 代码静态检查
 * 支持 ESLint/Prettier 集成，自动检测项目配置
 */
export class CodeLintTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'code_lint',
    description:
      '对代码文件或目录运行静态检查。支持 ESLint（代码规范）、Prettier（格式检查）。自动检测项目中是否有对应配置文件。用于代码审查前检查代码质量。',
    parameters: {
      type: 'object',
      properties: {
        targetPath: {
          type: 'string',
          description: '要检查的文件路径或目录，默认为当前目录',
          default: '.'
        },
        linter: {
          type: 'string',
          description: '检查工具：eslint（代码规范）、prettier（格式化检查）、auto（自动检测）',
          enum: ['eslint', 'prettier', 'auto'],
          default: 'auto'
        }
      },
      required: []
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    signal?: AbortSignal
  ): Promise<ToolResult> {
    const targetPath = (toolCall.arguments.targetPath as string) || '.'
    const linter = (toolCall.arguments.linter as string) || 'auto'

    onChunk?.({ toolStatus: 'calling', toolName: 'code_lint' })

    try {
      if (linter === 'prettier') {
        return await this.runPrettier(targetPath, signal, toolCall)
      }
      if (linter === 'eslint') {
        return await this.runESLint(targetPath, signal, toolCall)
      }

      // auto：先检测 prettier，再 eslint
      const prettierExists = await this.hasConfig(targetPath, '.prettierrc')
      const eslintExists = await this.hasConfig(targetPath, '.eslintrc')

      if (prettierExists) {
        return await this.runPrettier(targetPath, signal, toolCall)
      }
      if (eslintExists) {
        return await this.runESLint(targetPath, signal, toolCall)
      }

      return {
        toolCallId: toolCall.id,
        toolName: 'code_lint',
        content: '未在项目中找到 ESLint 或 Prettier 配置文件。如需代码检查，请在项目中配置 `.eslintrc.*` 或 `.prettierrc.*`。',
        success: true,
        displayType: 'text'
      }
    } catch (e) {
      return this.error(toolCall.id, `代码检查失败：${(e as Error).message}`)
    }
  }

  private async runESLint(targetPath: string, signal: AbortSignal | undefined, toolCall: { id: string }): Promise<ToolResult> {
    try {
      // 使用 JSON 格式以便解析结构化错误
      const cmd = `npx eslint "${targetPath}" --format json --no-error-on-unmatched-pattern 2>&1`
      const { stdout } = await execAsync(cmd, {
        timeout: 120000,
        maxBuffer: 5 * 1024 * 1024,
        windowsHide: true,
        signal,
        cwd: process.cwd()
      } as never)

      return this.parseESLintJson(String(stdout), toolCall.id, false)
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string }
      const esLintOutput = (err.stdout || err.stderr || '').trim()

      if (esLintOutput) {
        return this.parseESLintJson(esLintOutput, toolCall.id, true)
      }

      return this.error(toolCall.id, `ESLint 运行失败：${(e as Error).message}`)
    }
  }

  /** 解析 ESLint JSON 输出为结构化错误 */
  private parseESLintJson(rawOutput: string, toolCallId: string, hasErrors: boolean): ToolResult {
    interface ESLintMessage {
      ruleId: string | null
      severity: number  // 1=warn, 2=error
      message: string
      line: number
      column: number
      nodeType?: string
    }
    interface ESLintResult {
      filePath: string
      messages: ESLintMessage[]
      errorCount: number
      warningCount: number
    }

    let results: ESLintResult[] = []
    try {
      results = JSON.parse(rawOutput) as ESLintResult[]
    } catch {
      // JSON 解析失败，退回纯文本输出
      return {
        toolCallId,
        toolName: 'code_lint',
        content: `## ESLint 检查结果\n\`\`\`\n${rawOutput.slice(0, 50000)}\n\`\`\``,
        success: !hasErrors,
        error: hasErrors ? 'ESLint 发现问题' : undefined,
        displayType: 'text',
        metadata: { linter: 'eslint' }
      }
    }

    const totalErrors = results.reduce((sum, r) => sum + r.errorCount, 0)
    const totalWarnings = results.reduce((sum, r) => sum + r.warningCount, 0)
    const structuredIssues: Array<{
      file: string
      line: number
      column: number
      severity: 'error' | 'warning'
      rule: string
      message: string
    }> = []

    const lines: string[] = []
    if (totalErrors === 0 && totalWarnings === 0) {
      return {
        toolCallId,
        toolName: 'code_lint',
        content: '## ✅ ESLint 检查通过\n\n无错误和警告。',
        success: true,
        displayType: 'text',
        metadata: { linter: 'eslint', errors: 0, warnings: 0 }
      }
    }

    lines.push(`## 🔍 ESLint 检查结果`)
    lines.push(`**错误**: ${totalErrors} | **警告**: ${totalWarnings}\n`)

    for (const result of results) {
      if (result.messages.length === 0) continue
      const shortFile = result.filePath.split(/[/\\]/).slice(-2).join('/')
      lines.push(`### \`${shortFile}\``)

      for (const msg of result.messages) {
        const severity = msg.severity === 2 ? 'error' : 'warning'
        const icon = severity === 'error' ? '❌' : '⚠️'
        const ruleLabel = msg.ruleId ? `\`${msg.ruleId}\`` : '(no-rule)'
        lines.push(`- ${icon} **L${msg.line}:${msg.column}** ${ruleLabel} — ${msg.message}`)

        structuredIssues.push({
          file: result.filePath,
          line: msg.line,
          column: msg.column,
          severity,
          rule: msg.ruleId || 'unknown',
          message: msg.message
        })
      }
      lines.push('')
    }

    if (totalErrors > 0) {
      lines.push('> 💡 提示：可使用 `code_format` 工具（formatter=eslint）自动修复可修复的问题。')
    }

    return {
      toolCallId,
      toolName: 'code_lint',
      content: lines.join('\n'),
      success: totalErrors === 0,
      error: totalErrors > 0 ? `发现 ${totalErrors} 个错误` : undefined,
      displayType: 'text',
      metadata: {
        linter: 'eslint',
        errors: totalErrors,
        warnings: totalWarnings,
        issues: structuredIssues
      }
    }
  }

  private async runPrettier(targetPath: string, signal: AbortSignal | undefined, toolCall: { id: string }): Promise<ToolResult> {
    try {
      const cmd = `npx prettier --check "${targetPath}" 2>&1`
      const { stdout } = await execAsync(cmd, {
        timeout: 120000,
        maxBuffer: 5 * 1024 * 1024,
        windowsHide: true,
        signal,
        cwd: process.cwd()
      } as never)

      return {
        toolCallId: toolCall.id,
        toolName: 'code_lint',
        content: `Prettier 格式检查通过：\n\`\`\`\n${String(stdout).trim()}\n\`\`\``,
        success: true,
        displayType: 'text',
        metadata: { linter: 'prettier' }
      }
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string }
      const output = String(err.stdout || err.stderr || '').trim()
      if (output) {
        return {
          toolCallId: toolCall.id,
          toolName: 'code_lint',
          content: `## Prettier 格式问题\n以下文件格式不符合 Prettier 规范，可运行 \`npx prettier --write .\` 自动修复：\n\`\`\`\n${output.slice(0, 30000)}\n\`\`\``,
          success: false,
          error: 'Prettier 发现格式问题',
          displayType: 'text',
          metadata: { linter: 'prettier' }
        }
      }

      return this.error(toolCall.id, `Prettier 运行失败：${(e as Error).message}`)
    }
  }

  /** 检查配置文件是否存在 */
  private async hasConfig(cwd: string, baseName: string): Promise<boolean> {
    try {
      const { readdir } = await import('fs/promises')
      const files = await readdir(cwd)
      return files.some((f) => f.startsWith(baseName) || f === `${baseName}.json` || f === `${baseName}.js` || f === `${baseName}.cjs` || f === `${baseName}.mjs`)
    } catch {
      return false
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'code_lint', content: '', success: false, error: msg }
  }
}
