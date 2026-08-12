import { exec } from 'child_process'
import { promisify } from 'util'
import { resolve } from 'path'
import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'
import {
  isOcrInstalled,
  createErrorResult,
} from './ocr-helpers'
import { checkOcrStatus } from './ocr-status-checker'
import { runOcrReview } from './ocr-review-runner'

const execAsync = promisify(exec)

type ReviewAction = 'review' | 'config' | 'status'
type ReviewScope = 'uncommitted' | 'branch' | 'commit'

/**
 * CodeReviewTool — 阿里 OCR (Open Code Review) 集成
 * 基于 AI + 工程规则的混合架构代码审查，读取 Git diff 并生成结构化审查意见。
 * 需要先安装：npm install -g @alibaba-group/open-code-review
 */
export class CodeReviewTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'code_review',
    description:
      '使用阿里开源 OCR (Open Code Review) 对 Git 变更进行 AI 代码审查。采用「确定性工程 + LLM Agent」混合架构，内置 NPE、SQL 注入、XSS、线程安全等规则，支持自定义规则。审查范围来自 Git diff。需先安装 `npm i -g @alibaba-group/open-code-review` 并配置 LLM。首次使用可先用 action=status 检查安装状态。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '操作类型：review（运行审查）、config（配置 LLM）、status（检查安装状态）',
          enum: ['review', 'config', 'status']
        },
        scope: {
          type: 'string',
          description: '审查范围（仅 review）：uncommitted（未提交变更，默认）、branch（分支间差异，需配 fromRef/toRef）、commit（指定提交，需配 commitHash）',
          enum: ['uncommitted', 'branch', 'commit'],
          default: 'uncommitted'
        },
        fromRef: {
          type: 'string',
          description: '起始分支/引用（仅 scope=branch，如 main）'
        },
        toRef: {
          type: 'string',
          description: '目标分支/引用（仅 scope=branch，如 feature/pay）'
        },
        commitHash: {
          type: 'string',
          description: '提交哈希（仅 scope=commit，如 abc123）'
        },
        format: {
          type: 'string',
          description: '输出格式：text（可读文本，默认）、json（结构化，供 CI 消费）',
          enum: ['text', 'json'],
          default: 'text'
        },
        repoPath: {
          type: 'string',
          description: 'Git 仓库路径，默认为当前目录',
          default: '.'
        },
        configKey: {
          type: 'string',
          description: '配置键名（仅 action=config，如 llm.url / llm.auth_token / llm.model）'
        },
        configValue: {
          type: 'string',
          description: '配置值（仅 action=config）'
        }
      },
      required: ['action']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    signal?: AbortSignal
  ): Promise<ToolResult> {
    const action = toolCall.arguments.action as ReviewAction
    const repoPath = resolve((toolCall.arguments.repoPath as string) || '.')

    onChunk?.({ toolStatus: 'calling', toolName: 'code_review' })

    try {
      switch (action) {
        case 'status':
          return await checkOcrStatus(toolCall.id, repoPath, signal)

        case 'config': {
          const key = toolCall.arguments.configKey as string
          const value = toolCall.arguments.configValue as string
          if (!key || value === undefined) {
            return createErrorResult(toolCall.id, 'config 操作需要 configKey 和 configValue 参数。可用键：llm.url、llm.auth_token、llm.model')
          }
          return await this.setConfig(toolCall.id, key, value, signal)
        }

        case 'review': {
          const installed = await isOcrInstalled(execAsync, signal)
          if (!installed) {
            return createErrorResult(toolCall.id,
              'OCR 未安装。请先运行：\n```\nnpm install -g @alibaba-group/open-code-review\n```\n安装后使用 `code_review` (action=config) 配置 LLM。'
            )
          }

          const scope = (toolCall.arguments.scope as ReviewScope) || 'uncommitted'
          const format = (toolCall.arguments.format as string) || 'text'
          return await runOcrReview(toolCall.id, repoPath, scope, format, toolCall.arguments, signal)
        }

        default:
          return createErrorResult(toolCall.id, `不支持的操作：${action}`)
      }
    } catch (e) {
      return createErrorResult(toolCall.id, `代码审查失败：${(e as Error).message}`)
    }
  }

  // ---------------------------------------------------------------------------
  // 配置 LLM
  // ---------------------------------------------------------------------------

  private async setConfig(
    toolCallId: string,
    key: string,
    value: string,
    signal?: AbortSignal
  ): Promise<ToolResult> {
    const validKeys = ['llm.url', 'llm.auth_token', 'llm.model']
    if (!validKeys.includes(key)) {
      return createErrorResult(toolCallId, `不支持的配置键：${key}。可用键：${validKeys.join(', ')}`)
    }

    const displayValue = key === 'llm.auth_token'
      ? `${value.slice(0, 6)}****${value.slice(-4)}`
      : value

    try {
      const cmd = `ocr config set ${key} "${value}"`
      const { stdout, stderr } = await execAsync(cmd, {
        timeout: 15000, windowsHide: true, signal
      } as never)

      const output = String(stdout || stderr || '').trim()
      const lines = [
        `## ⚙️ OCR 配置更新`,
        `**键**：\`${key}\``,
        `**值**：\`${displayValue}\``,
        '',
        output ? `\`\`\`\n${output}\n\`\`\`` : '配置已保存。'
      ]

      return {
        toolCallId, toolName: 'code_review',
        content: lines.join('\n'), success: true,
        displayType: 'text',
        metadata: { key, configured: true }
      }
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string }
      const output = String(err.stdout || err.stderr || '').trim()
      if (output) {
        return createErrorResult(toolCallId, `OCR 配置失败：${output.slice(0, 1000)}`)
      }
      return createErrorResult(toolCallId, `OCR 配置失败：${(e as Error).message}`)
    }
  }
}
