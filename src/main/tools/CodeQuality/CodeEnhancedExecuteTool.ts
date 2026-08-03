import { exec } from 'child_process'
import { promisify } from 'util'
import type { Context } from 'vm'
import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk, ToolContext } from '@shared/types'

const execAsync = promisify(exec)

const LANGUAGE_CMD: Record<string, { ext: string; cmd: string; installHint: string }> = {
  javascript: { ext: '.js', cmd: 'node "{file}"', installHint: 'Node.js 已内置' },
  typescript: { ext: '.ts', cmd: 'npx tsx "{file}"', installHint: '需要 npx tsx（npx 已内置）' },
  python: { ext: '.py', cmd: 'python "{file}"', installHint: '需要安装 Python 3' },
  python3: { ext: '.py', cmd: 'python3 "{file}"', installHint: '需要安装 Python 3' },
  go: { ext: '.go', cmd: 'go run "{file}"', installHint: '需要安装 Go' },
  rust: { ext: '.rs', cmd: 'rustc "{file}" -o /tmp/rust_exec && /tmp/rust_exec', installHint: '需要安装 Rust' },
  shell: { ext: '.sh', cmd: 'bash "{file}"', installHint: '需要 bash（Linux/macOS）或 WSL' },
  powershell: { ext: '.ps1', cmd: 'powershell -ExecutionPolicy Bypass -File "{file}"', installHint: 'Windows PowerShell' },
}

/**
 * CodeEnhancedExecuteTool — 增强版代码执行
 * 替代原有 CodeExecuteTool，支持多语言真实运行环境
 */

export class CodeEnhancedExecuteTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'code_execute',
    description:
      '在真实运行环境中执行代码。支持 JavaScript、TypeScript、Python、Go、Rust 等多种语言（需要本地安装对应运行时）。代码在临时文件中执行，超时可配置（默认 60s，最大 300s）。结果包含输出内容、退出码和执行耗时。',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: '要执行的代码'
        },
        language: {
          type: 'string',
          description: '代码语言',
          enum: ['javascript', 'typescript', 'python', 'python3', 'go', 'rust', 'shell', 'powershell'],
          default: 'javascript'
        },
        timeout: {
          type: 'number',
          description: '超时秒数，默认 60s，最大 300s',
          default: 60
        }
      },
      required: ['code']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
    context?: ToolContext
  ): Promise<ToolResult> {
    const code = (toolCall.arguments.code as string) || ''
    const language = (toolCall.arguments.language as string) || 'javascript'
    const timeout = Math.min((toolCall.arguments.timeout as number) || (context?.codeExecTimeout ?? 60), 300)

    if (!code) {
      return this.error(toolCall.id, '缺少 code 参数')
    }

    const langConfig = LANGUAGE_CMD[language]
    if (!langConfig) {
      return this.error(toolCall.id, `不支持的语言: ${language}。支持: ${Object.keys(LANGUAGE_CMD).join(', ')}`)
    }

    onChunk?.({ toolStatus: 'calling', toolName: 'code_execute' })

    // 对于 JavaScript 和 TypeScript，使用 vm 沙箱（更快更安全）
    if (language === 'javascript' || language === 'typescript') {
      return this.executeJS(code, language, timeout, toolCall, signal)
    }

    // 其他语言使用临时文件 + child_process
    return this.executeInFile(code, language, timeout, langConfig, toolCall, signal)
  }

  /** VM 沙箱执行 JS/TS */
  private async executeJS(
    code: string,
    _language: string,
    timeout: number,
    toolCall: ToolCall,
    signal?: AbortSignal
  ): Promise<ToolResult> {
    const vm = await import('vm')
    const logs: string[] = []
    const errors: string[] = []

    const sandbox: Context = vm.createContext({
      console: {
        log: (...args: unknown[]) => {
          logs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' '))
        },
        error: (...args: unknown[]) => {
          errors.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' '))
        },
        warn: (...args: unknown[]) => {
          logs.push('[warn] ' + args.map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' '))
        }
      },
      JSON, Math, Date, Array, Object, String, Number, Boolean,
      Map, Set, RegExp, parseInt, parseFloat, isNaN, isFinite,
      Promise, Error, Buffer
    })

    const startTime = Date.now()

    // 使用 AbortController 实现超时
    const abortController = new AbortController()
    const timeoutId = setTimeout(() => abortController.abort(), timeout * 1000)

    if (signal) {
      signal.addEventListener('abort', () => abortController.abort(), { once: true })
    }

    try {
      let executableCode = code
      // 简单的 TS 类型剥离
      if (_language === 'typescript') {
        executableCode = code
          .replace(/:\s*(string|number|boolean|void|any|never|unknown|bigint|symbol|null|undefined)(\s*[=,);}\]])/g, '$2')
          .replace(/:\s*(string|number|boolean|void|any|never|unknown|bigint|symbol|null|undefined)\s*$/gm, '')
          .replace(/:\s*(\w+(\[\])?)\s*(=)/g, '$3')
          .replace(/^interface\s+\w+\s*\{[\s\S]*?\}/gm, '')
          .replace(/^type\s+\w+\s*=\s*.*$/gm, '')
      }

      const wrapped = `(async () => {\n${executableCode}\n})()`

      const result = await vm.runInContext(wrapped, sandbox, {
        timeout: timeout * 1000,
        displayErrors: true,
        breakOnSigint: true
      })

      const duration = ((Date.now() - startTime) / 1000).toFixed(1)

      return this.formatResult(toolCall, logs, errors, result, duration)
    } catch (e) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1)
      const errorMsg = e instanceof Error ? e.message : String(e)

      let content = `**执行出错** (${duration}s)：\n\`\`\`\n${errorMsg}\n\`\`\``
      if (logs.length > 0) {
        content += `\n**输出（错误前）：**\n\`\`\`\n${logs.join('\n')}\n\`\`\``
      }

      return {
        toolCallId: toolCall.id,
        toolName: 'code_execute',
        content,
        success: false,
        error: errorMsg,
        displayType: 'code',
        metadata: { language: _language, duration, hasError: true }
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /** 临时文件 + child_process 执行 */
  private async executeInFile(
    code: string,
    language: string,
    timeout: number,
    langConfig: { ext: string; cmd: string; installHint: string },
    toolCall: ToolCall,
    signal?: AbortSignal
  ): Promise<ToolResult> {
    const fs = await import('fs/promises')
    const path = await import('path')
    const os = await import('os')

    const tmpDir = os.tmpdir()
    const fileName = `ximo_exec_${Date.now()}${langConfig.ext}`
    const filePath = path.join(tmpDir, fileName)

    try {
      await fs.writeFile(filePath, code, 'utf-8')
      const command = langConfig.cmd.replace('{file}', filePath)

      const startTime = Date.now()

      try {
        const { stdout, stderr } = await execAsync(command, {
          timeout: timeout * 1000,
          maxBuffer: 10 * 1024 * 1024,
          windowsHide: true,
          signal
        } as never)

        const duration = ((Date.now() - startTime) / 1000).toFixed(1)

        let content = `\`\`\`${language}\n${code.slice(0, 1000)}${code.length > 1000 ? '\n...(代码被截断)' : ''}\n\`\`\`\n\n`
        content += `**执行结果** (${duration}s)：\n\`\`\`\n`
        if (stdout) content += stdout
        if (stderr) content += `\n[stderr]\n${stderr}`
        content += '\n```'

        return {
          toolCallId: toolCall.id,
          toolName: 'code_execute',
          content,
          success: true,
          displayType: 'code',
          metadata: { language, duration }
        }
      } catch (e) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1)
        const execError = e as { stdout?: string; stderr?: string; code?: number; message?: string }

        let content = `**执行错误** (${duration}s, 退出码: ${execError.code})：\n\`\`\`\n${execError.message}\n\`\`\``
        if (execError.stdout) content += `\n**输出：**\n\`\`\`\n${execError.stdout}\n\`\`\``
        if (execError.stderr) content += `\n**错误输出：**\n\`\`\`\n${execError.stderr}\n\`\`\``

        // 检测运行时是否未安装
        const isCmdNotFound = execError.code === 127 || execError.message?.includes('not found') ||
          execError.message?.includes('不是内部或外部命令') || execError.message?.includes('is not recognized')

        if (isCmdNotFound) {
          content += `\n\n**提示**：${langConfig.installHint}`
        }

        return {
          toolCallId: toolCall.id,
          toolName: 'code_execute',
          content,
          success: false,
          error: execError.message,
          displayType: 'code',
          metadata: { language, duration, exitCode: execError.code }
        }
      }
    } finally {
      // 清理临时文件
      try {
        const fs = await import('fs/promises')
        await fs.unlink(filePath)
      } catch {
        // 忽略清理错误
      }
    }
  }

  private formatResult(
    toolCall: ToolCall,
    logs: string[],
    errors: string[],
    result: unknown,
    duration: string
  ): ToolResult {
    const output = logs.join('\n')
    const errOutput = errors.join('\n')

    let content = ''
    if (output) content += `\`\`\`\n${output}\n\`\`\`\n`
    if (errOutput) content += `\n**错误输出：**\n\`\`\`\n${errOutput}\n\`\`\`\n`
    if (!output && !errOutput && result !== undefined) {
      content += `\`\`\`\n${typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)}\n\`\`\`\n`
    }
    if (!output && !errOutput && result === undefined) {
      content += '代码执行完毕，无输出。'
    }
    content += `\n**耗时**: ${duration}s`

    return {
      toolCallId: toolCall.id,
      toolName: 'code_execute',
      content,
      success: true,
      displayType: 'code',
      metadata: { hasOutput: !!output, hasError: !!errOutput, duration }
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'code_execute', content: '', success: false, error: msg }
  }
}
