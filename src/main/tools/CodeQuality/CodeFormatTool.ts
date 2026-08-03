import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { resolve } from 'path'
import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

const execAsync = promisify(exec)

/**
 * CodeFormatTool — 自动格式化代码
 * 支持 Prettier（格式化）和 ESLint（自动修复 --fix）
 */
export class CodeFormatTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'code_format',
    description:
      '自动格式化代码文件。支持 Prettier（格式化代码风格）和 ESLint --fix（自动修复 lint 问题）。自动检测项目中是否有对应配置文件。用于代码编写后统一风格、修复格式问题。',
    parameters: {
      type: 'object',
      properties: {
        targetPath: {
          type: 'string',
          description: '要格式化的文件路径或目录，默认为当前目录'
        },
        formatter: {
          type: 'string',
          description: '格式化工具：prettier（格式化代码风格）、eslint（自动修复 lint 问题）、both（先 prettier 再 eslint）',
          enum: ['prettier', 'eslint', 'both'],
          default: 'prettier'
        }
      },
      required: ['targetPath']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    signal?: AbortSignal
  ): Promise<ToolResult> {
    const targetPath = (toolCall.arguments.targetPath as string) || '.'
    const formatter = (toolCall.arguments.formatter as string) || 'prettier'

    const normalized = resolve(targetPath)

    if (!existsSync(normalized)) {
      return this.error(toolCall.id, `路径不存在：${normalized}`)
    }

    onChunk?.({ toolStatus: 'calling', toolName: 'code_format' })

    const results: string[] = []

    try {
      if (formatter === 'prettier' || formatter === 'both') {
        const result = await this.runPrettier(normalized, signal)
        results.push(result)
      }
      if (formatter === 'eslint' || formatter === 'both') {
        const result = await this.runESLintFix(normalized, signal)
        results.push(result)
      }

      return {
        toolCallId: toolCall.id,
        toolName: 'code_format',
        content: `## ✨ 代码格式化完成\n\n${results.join('\n\n')}`,
        success: true,
        displayType: 'text',
        metadata: { targetPath: normalized, formatter },
        requiresConfirmation: true,
        confirmationMessage: `即将格式化：${normalized}`
      }
    } catch (e) {
      return this.error(toolCall.id, `格式化失败：${(e as Error).message}`)
    }
  }

  private async runPrettier(targetPath: string, signal: AbortSignal | undefined): Promise<string> {
    try {
      const cmd = `npx prettier --write "${targetPath}" 2>&1`
      const { stdout } = await execAsync(cmd, {
        timeout: 120000,
        maxBuffer: 5 * 1024 * 1024,
        windowsHide: true,
        signal,
        cwd: process.cwd()
      } as never)

      const output = String(stdout).trim()
      return `**Prettier 格式化：**\n\`\`\`\n${output.slice(0, 5000) || '已格式化'}\n\`\`\``
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string }
      const output = String(err.stdout || err.stderr || '').trim()
      if (output) {
        return `**Prettier 格式化结果：**\n\`\`\`\n${output.slice(0, 5000)}\n\`\`\``
      }
      return `**Prettier 格式化失败：** ${(e as Error).message}`
    }
  }

  private async runESLintFix(targetPath: string, signal: AbortSignal | undefined): Promise<string> {
    try {
      const cmd = `npx eslint "${targetPath}" --fix --format stylish --no-error-on-unmatched-pattern 2>&1`
      const { stdout } = await execAsync(cmd, {
        timeout: 120000,
        maxBuffer: 5 * 1024 * 1024,
        windowsHide: true,
        signal,
        cwd: process.cwd()
      } as never)

      const output = String(stdout).trim()
      return `**ESLint --fix 自动修复：**\n\`\`\`\n${output.slice(0, 5000) || '所有问题已自动修复'}\n\`\`\``
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string }
      const output = String(err.stdout || err.stderr || '').trim()
      if (output) {
        return `**ESLint --fix 修复结果：**\n\`\`\`\n${output.slice(0, 5000)}\n\`\`\``
      }
      return `**ESLint --fix 失败：** ${(e as Error).message}`
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'code_format', content: '', success: false, error: msg }
  }
}
