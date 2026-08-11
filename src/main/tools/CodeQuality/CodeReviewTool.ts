import { exec } from 'child_process'
import { promisify } from 'util'
import { resolve } from 'path'
import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'
import {
  isOcrInstalled,
  scopeLabel,
  formatJsonResult,
  createErrorResult,
} from './ocr-helpers'

const execAsync = promisify(exec)

type ReviewAction = 'review' | 'config' | 'status'
type ReviewScope = 'uncommitted' | 'branch' | 'commit'

/**
 * CodeReviewTool — 阿里 OCR (Open Code Review) 集成
 * 基于 AI + 工程规则的混合架构代码审查，读取 Git diff 并生成结构化审查意见。
 * 需要先安装：npm install -g @alibaba-group/open-code-review
 *
 * 纯辅助函数（isOcrInstalled / scopeLabel / formatJsonResult / extractReviewItems）
 * 已提取到 ./ocr-helpers.ts，保持本文件聚焦于工具定义与流程编排。
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
          return await this.checkStatus(toolCall.id, repoPath, signal)

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
          return await this.runReview(toolCall.id, repoPath, scope, format, toolCall.arguments, signal)
        }

        default:
          return createErrorResult(toolCall.id, `不支持的操作：${action}`)
      }
    } catch (e) {
      return createErrorResult(toolCall.id, `代码审查失败：${(e as Error).message}`)
    }
  }

  // ---------------------------------------------------------------------------
  // 检查 OCR 安装与配置状态
  // ---------------------------------------------------------------------------

  private async checkStatus(
    toolCallId: string,
    _repoPath: string,
    signal?: AbortSignal
  ): Promise<ToolResult> {
    const lines: string[] = ['## 🔍 OCR (Open Code Review) 状态检查\n']

    // 1. 检查安装
    const installed = await isOcrInstalled(execAsync, signal)
    if (!installed) {
      lines.push('### ❌ 未安装')
      lines.push('')
      lines.push('**安装方式（推荐 NPM）：**')
      lines.push('```bash')
      lines.push('npm install -g @alibaba-group/open-code-review')
      lines.push('```')
      lines.push('')
      lines.push('安装后使用 `code_review` (action=config) 配置 LLM：')
      lines.push('- `llm.url` — LLM API 地址')
      lines.push('- `llm.auth_token` — API Key')
      lines.push('- `llm.model` — 模型名称（如 claude-opus）')
      lines.push('')
      lines.push('> 配置文件位置：`~/.opencodereview/config.json`')

      return {
        toolCallId, toolName: 'code_review',
        content: lines.join('\n'), success: true,
        displayType: 'text',
        metadata: { installed: false }
      }
    }

    // 2. 获取版本
    let version = 'unknown'
    try {
      const { stdout } = await execAsync('ocr --version', {
        timeout: 10000, windowsHide: true, signal
      } as never)
      version = String(stdout).trim()
    } catch {
      try {
        const { stdout } = await execAsync('ocr version', {
          timeout: 10000, windowsHide: true, signal
        } as never)
        version = String(stdout).trim()
      } catch { /* 版本获取失败不阻塞 */ }
    }

    lines.push('### ✅ 已安装')
    if (version && version !== 'unknown') {
      lines.push(`**版本**：\`${version.split('\n')[0]}\``)
    }
    lines.push('')

    // 3. 检查 LLM 配置
    let llmConfigured = false
    let configDetail = ''
    try {
      const { stdout } = await execAsync('ocr config list 2>&1', {
        timeout: 10000, windowsHide: true, signal
      } as never)
      const configText = String(stdout).trim()
      configDetail = configText
      llmConfigured = configText.includes('llm.url') && configText.includes('llm.auth_token') &&
        !configText.includes('""') && !configText.includes('null')
    } catch {
      try {
        const { homedir } = await import('os')
        const { join } = await import('path')
        const { readFile } = await import('fs/promises')
        const configPath = join(homedir(), '.opencodereview', 'config.json')
        const content = await readFile(configPath, 'utf-8')
        const config = JSON.parse(content)
        llmConfigured = !!(config?.llm?.url && config?.llm?.auth_token)
        configDetail = `配置文件：${configPath}`
      } catch { /* 配置文件不存在 */ }
    }

    if (llmConfigured) {
      lines.push('### ✅ LLM 已配置')
    } else {
      lines.push('### ⚠️ LLM 未配置')
      lines.push('')
      lines.push('使用以下命令配置（或通过 `code_review` action=config）：')
      lines.push('```bash')
      lines.push('ocr config set llm.url https://api.anthropic.com/v1/messages')
      lines.push('ocr config set llm.auth_token your-api-key')
      lines.push('ocr config set llm.model claude-opus')
      lines.push('```')
    }

    if (configDetail) {
      lines.push('', '<details><summary>配置详情</summary>', '', '```', configDetail.slice(0, 3000), '```', '', '</details>')
    }

    return {
      toolCallId, toolName: 'code_review',
      content: lines.join('\n'), success: true,
      displayType: 'text',
      metadata: { installed: true, version, llmConfigured }
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

  // ---------------------------------------------------------------------------
  // 运行代码审查
  // ---------------------------------------------------------------------------

  private async runReview(
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
        timeout: 300000, // AI 审查可能较慢，5 分钟超时
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

      // OCR 非零退出码可能意味着发现了问题（类似 eslint）
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
}
