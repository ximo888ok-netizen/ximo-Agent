import { spawn, type ChildProcess } from 'child_process'
import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk, ToolContext } from '@shared/types'

/**
 * CommandWhitelist — 安全命令白名单
 * 仅允许白名单内的命令执行，拦截危险操作
 */
export class CommandWhitelist {
  // 允许的命令前缀（非完整命令，只是前缀匹配）
  private static allowedPrefixes = [
    'node', 'npm', 'npx', 'yarn', 'pnpm', 'bun',
    'python', 'python3', 'pip', 'pip3',
    'go', 'cargo', 'rustc', 'rustup',
    'java', 'javac', 'mvn', 'gradle',
    'git', 'docker', 'kubectl', 'helm',
    'ls', 'dir', 'cat', 'head', 'tail', 'echo', 'pwd', 'cd',
    'type', 'whoami', 'hostname', 'date', 'time',
    'mkdir', 'touch', 'cp', 'mv', 'rm', 'rmdir',
    'find', 'grep', 'sort', 'wc', 'uniq',
    'curl', 'wget', 'ping',
    'chmod', 'chown',
    'tsc', 'eslint', 'prettier', 'jest', 'vitest', 'tsx',
    'dotnet', 'msbuild',
    'powershell', 'pwsh',
  ]

  // 禁止的命令模式
  private static blockedPatterns = [
    /rm\s+-rf\s+\//,
    /rm\s+-rf\s+~/,
    /rm\s+-rf\s+\*$/,
    /dd\s+if=/,
    /mkfs\./,
    />\s*\/dev\//,
    /:\(\)\s*\{/,
    /chmod\s+777/,
    /format\s+\w:/i,
    /del\s+\/f\s+\/s/,
    /shutdown/,
    /reboot/,
    /taskkill\s+\/f\s+\/im\s+explorer/i,
  ]

  static async isAllowed(command: string): Promise<{ allowed: boolean; reason?: string }> {
    const trimmed = command.trim()

    // 检查禁止模式
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(trimmed)) {
        return { allowed: false, reason: `命令匹配禁止模式：${pattern}` }
      }
    }

    // 检查白名单前缀
    const firstWord = trimmed.split(/\s+/)[0].toLowerCase()
    if (!firstWord) {
      return { allowed: false, reason: '空命令' }
    }

    for (const prefix of this.allowedPrefixes) {
      if (firstWord === prefix || firstWord.startsWith(prefix + '.')) {
        return { allowed: true }
      }
    }

    // 允许本地路径引用的可执行文件（如 "./node_modules/.bin/eslint"）
    // 但必须验证文件确实存在且以白名单中的命令名结尾，防止 "C:\恶意脚本.exe" 等绕过
    if (firstWord.includes('/') || firstWord.includes('\\')) {
      const { existsSync } = await import('fs')
      const { resolve, basename } = await import('path')
      const resolved = resolve(firstWord)
      const baseName = basename(resolved).toLowerCase()
      // 检查最终可执行文件名是否在白名单中
      const isWhitelisted = this.allowedPrefixes.some(
        (prefix) => baseName === prefix || baseName.startsWith(prefix + '.')
      )
      if (isWhitelisted && existsSync(resolved)) {
        return { allowed: true }
      }
      return { allowed: false, reason: `路径引用的命令 "${firstWord}" 不在白名单中或文件不存在` }
    }

    return { allowed: false, reason: `命令 "${firstWord}" 不在白名单中` }
  }
}

/**
 * TerminalExecTool — 执行系统终端命令
 * 支持超时控制和取消，受白名单限制
 */
export class TerminalExecTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'terminal_exec',
    description:
      '执行系统终端命令。支持超时控制（默认 60s，最大 300s）。仅允许白名单内的安全命令。用于编译代码、运行测试、安装依赖、执行脚本等场景。命令结果包含 stdout、stderr 和退出码。',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: '要执行的终端命令（单行）'
        },
        cwd: {
          type: 'string',
          description: '工作目录，默认为当前项目目录',
          default: '.'
        },
        timeout: {
          type: 'number',
          description: '超时秒数，默认 60s，最大 300s',
          default: 60
        }
      },
      required: ['command']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
    context?: ToolContext
  ): Promise<ToolResult> {
    const command = (toolCall.arguments.command as string) || ''
    const cwd = (toolCall.arguments.cwd as string) || '.'
    const timeout = Math.min((toolCall.arguments.timeout as number) || (context?.terminalTimeout ?? 60), 300)
    const outputLimit = context?.terminalOutputLimit ?? 50000

    if (!command) {
      return this.error(toolCall.id, '缺少 command 参数')
    }

    // 安全检查
    const check = await CommandWhitelist.isAllowed(command)
    if (!check.allowed) {
      return this.error(toolCall.id, `${check.reason}\n\n命令已拦截。如需执行此命令，请联系管理员或手动在终端执行。`)
    }

    onChunk?.({ toolStatus: 'calling', toolName: 'terminal_exec' })

    return new Promise<ToolResult>((resolve) => {
      const startTime = Date.now()
      const isWin = process.platform === 'win32'
      const shell = isWin ? 'powershell.exe' : '/bin/bash'
      // Windows: 强制 UTF-8 输出编码，避免 GBK 乱码
      const encodingPrefix = isWin
        ? 'chcp 65001 > $null; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; '
        : ''
      const shellArgs = isWin ? ['-NoProfile', '-Command', encodingPrefix + command] : ['-c', command]

      const child: ChildProcess = spawn(shell, shellArgs, {
        cwd,
        windowsHide: true,
        env: {
          ...process.env,
          FORCE_COLOR: '0',
          NO_COLOR: '1',
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
          LANG: 'en_US.UTF-8'
        }
      })

      let stdout = ''
      let stderr = ''
      let finished = false
      let streamDirty = false

      const finish = (result: ToolResult): void => {
        if (finished) return
        finished = true
        clearInterval(streamInterval)
        clearTimeout(timeoutHandle)
        if (signal) signal.removeEventListener('abort', onAbort)
        resolve(result)
      }

      // 实时流式输出 — 500ms 节流 + dirty flag 避免无效发送
      const streamInterval = setInterval(() => {
        if (streamDirty && (stdout || stderr)) {
          streamDirty = false
          onChunk?.({
            toolStatus: 'calling',
            toolName: 'terminal_exec',
            content: `[实时输出]\n${stdout.slice(-2000)}${stderr ? '\n[stderr]\n' + stderr.slice(-1000) : ''}`
          })
        }
      }, 500)

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString('utf-8')
        streamDirty = true
      })

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString('utf-8')
        streamDirty = true
      })

      const onAbort = (): void => {
        if (finished) return
        child.kill('SIGTERM')
        if (process.platform === 'win32' && child.pid) {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
        }
        // 兑底：若 SIGTERM 后子进程仍不退出（close 事件不触发），5s 后强制完成，避免 Promise 永不 resolve
        setTimeout(() => {
          if (!finished) {
            finish(this.error(toolCall.id, '命令已被取消'))
          }
        }, 5_000)
      }

      child.on('close', (exitCode: number | null) => {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1)
        const code = exitCode ?? 0
        const killed = signal?.aborted === true || exitCode === null

        let output = stdout
        let errOutput = stderr
        if (output.length > outputLimit) {
          output = output.slice(0, outputLimit) + `\n...(输出被截断，共 ${output.length} 字符)`
        }
        if (errOutput.length > outputLimit) {
          errOutput = errOutput.slice(0, outputLimit) + `\n...(输出被截断，共 ${errOutput.length} 字符)`
        }

        let content = `\`\`\`\n> ${command}\n`
        if (output) content += `${output}\n`
        if (errOutput) content += `[stderr]\n${errOutput}\n`
        content += `\`\`\`\n\n**退出码**: ${code} | **耗时**: ${duration}s`
        if (killed) content += ` | **状态**: 超时或被取消`

        // 命令执行失败时，自动引导 AI 分析错误并修复
        if (code !== 0 && !killed && errOutput) {
          content += `\n\n⚠️ **命令执行失败，请分析上方错误输出并修复：**\n`
          content += `- 如果是编译错误，请用 file_read 读取报错文件的相关行（用 startLine/endLine 参数），然后用 file_edit 修复\n`
          content += `- 如果是依赖缺失，请用 dependency_check 安装缺失的包\n`
          content += `- 如果是语法错误，请定位具体文件和行号后修复\n`
          content += `- 修复后请重新执行命令验证`
        }

        finish({
          toolCallId: toolCall.id,
          toolName: 'terminal_exec',
          content,
          success: code === 0 && !killed,
          displayType: 'code',
          metadata: { command, cwd, exitCode: code, duration, killed },
          requiresConfirmation: true,
          confirmationMessage: `即将执行命令：${command}`
        })
      })

      child.on('error', (err: Error) => {
        finish(this.error(toolCall.id, `命令执行失败：${err.message}`))
      })

      // 超时处理
      const timeoutHandle = setTimeout(() => {
        if (!finished) {
          child.kill('SIGTERM')
          if (process.platform === 'win32' && child.pid) {
            spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
          }
          // 兑底：若 SIGTERM 后子进程仍不退出（close 事件不触发），5s 后强制完成，避免 Promise 永不 resolve
          setTimeout(() => {
            if (!finished) {
              finish({
                toolCallId: toolCall.id,
                toolName: 'terminal_exec',
                content: `\`\`\`\n> ${command}\n\n**状态**: 执行超时（${timeout}s），进程未正常退出，已强制终止`,
                success: false,
                displayType: 'code',
                metadata: { command, cwd, exitCode: null, duration: ((Date.now() - startTime) / 1000).toFixed(1), killed: true },
                requiresConfirmation: true,
                confirmationMessage: `即将执行命令：${command}`
              })
            }
          }, 5_000)
        }
      }, timeout * 1000)

      // 支持 AbortSignal 取消
      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true })
      }
    })
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'terminal_exec', content: '', success: false, error: msg }
  }
}
