import vm from 'vm'
import type { Tool } from './Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

/**
 * CodeExecuteTool — 代码执行工具
 *
 * 使用 Node.js vm 模块在沙箱中执行 JavaScript 代码。
 * 限制执行时间（30s）和 API 访问，防止恶意代码影响主进程。
 */
export class CodeExecuteTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'code_execute',
    description:
      '在沙箱中执行 JavaScript 代码并返回输出。支持 async/await。适合快速验证代码逻辑、运行测试、数据处理等场景。使用 console.log 输出结果。超时 30 秒，不可访问文件系统和网络。',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: '要执行的 JavaScript 代码'
        },
        language: {
          type: 'string',
          description: '代码语言：javascript 或 typescript',
          enum: ['javascript', 'typescript'],
          default: 'javascript'
        }
      },
      required: ['code']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    _signal?: AbortSignal
  ): Promise<ToolResult> {
    const code = toolCall.arguments.code as string
    const language = (toolCall.arguments.language as string) || 'javascript'

    if (!code || typeof code !== 'string') {
      return {
        toolCallId: toolCall.id,
        toolName: 'code_execute',
        content: '',
        success: false,
        error: '缺少要执行的代码（code 参数）'
      }
    }

    onChunk?.({ toolStatus: 'calling', toolName: 'code_execute' })

    const logs: string[] = []
    const errors: string[] = []

    // 创建沙箱上下文
    const sandbox: vm.Context = vm.createContext({
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
      // 提供有限的全局 API
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      Map,
      Set,
      RegExp,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      Promise,
      Error
    })

    try {
      // 处理 TypeScript：去除简单类型注解
      let executableCode = code
      if (language === 'typescript') {
        executableCode = code
          .replace(/:\s*(string|number|boolean|void|any|never|unknown|bigint|symbol|null|undefined)(\s*[=,);}\]])/g, '$2')
          .replace(/:\s*(string|number|boolean|void|any|never|unknown|bigint|symbol|null|undefined)\s*$/gm, '')
          .replace(/:\s*(\w+(\[\])?)\s*(=)/g, '$3')
          .replace(/^interface\s+\w+\s*\{[\s\S]*?\}/gm, '')
          .replace(/^type\s+\w+\s*=\s*.*$/gm, '')
      }

      const wrapped = `(async () => {\n${executableCode}\n})()`

      const result = await vm.runInContext(wrapped, sandbox, {
        timeout: 30000,
        displayErrors: true
      })

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

      return {
        toolCallId: toolCall.id,
        toolName: 'code_execute',
        content,
        success: true,
        displayType: 'code',
        metadata: { language, hasOutput: !!output, hasError: !!errOutput }
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e)
      const output = logs.join('\n')

      return {
        toolCallId: toolCall.id,
        toolName: 'code_execute',
        content: `**执行出错：**\n\`\`\`\n${errorMsg}\n\`\`\`\n${output ? `\n**输出（错误前）：**\n\`\`\`\n${output}\n\`\`\`` : ''}`,
        success: false,
        error: errorMsg,
        displayType: 'code',
        metadata: { language, hasError: true }
      }
    }
  }
}
