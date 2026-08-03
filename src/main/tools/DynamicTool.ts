import vm from 'vm'
import type { Tool } from './Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk, ToolContext } from '@shared/types'
import { toolRegistry } from './ToolRegistry'

/**
 * DynamicTool — 运行时创建的自定义工具
 *
 * Agent 通过 create_tool 元工具创建，代码在 vm 沙箱中执行。
 * 沙箱提供 args（工具参数）、fetch（网络）、console.log（调试）等。
 * 不支持文件系统或进程操作，30 秒超时。
 */
export class DynamicTool implements Tool {
  readonly definition: ToolDefinition
  private readonly code: string

  constructor(def: { name: string; description: string; parameters: object; code: string }) {
    this.definition = {
      name: def.name,
      description: def.description,
      parameters: def.parameters as ToolDefinition['parameters']
    }
    this.code = def.code
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    _signal?: AbortSignal,
    _context?: ToolContext
  ): Promise<ToolResult> {
    onChunk?.({ toolStatus: 'calling', toolName: this.definition.name })

    try {
      const logs: string[] = []
      const sandbox = {
        args: toolCall.arguments,
        console: { log: (...args: unknown[]) => logs.push(args.map(String).join(' ')) },
        fetch: globalThis.fetch,
        JSON, Date, Math, Object, Array, String, Number, Boolean, URL, setTimeout,
      }

      vm.createContext(sandbox)

      const wrapped = `(async function(args) { ${this.code} })`
      const fn = vm.runInContext(wrapped, sandbox, { timeout: 30000 })

      // 异步超时保护
      const result = await Promise.race([
        fn(toolCall.arguments),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('工具执行超时（30s）')), 30000)
        )
      ])

      let content: string
      let success = true

      if (typeof result === 'string') {
        content = result
      } else if (result && typeof result === 'object' && 'content' in result) {
        content = String((result as { content: unknown }).content)
        success = (result as { success?: boolean }).success !== false
      } else {
        content = JSON.stringify(result, null, 2)
      }

      if (logs.length > 0) {
        content = `${content}\n\n[console.log]\n${logs.join('\n')}`
      }

      return {
        toolCallId: toolCall.id,
        toolName: this.definition.name,
        content,
        success,
        displayType: 'text',
        metadata: { dynamic: true }
      }
    } catch (e) {
      return {
        toolCallId: toolCall.id,
        toolName: this.definition.name,
        content: '',
        success: false,
        error: `工具执行失败: ${(e as Error).message}`
      }
    }
  }
}

/**
 * CreateToolTool — 元工具，让 Agent 为自己创建自定义工具
 *
 * Agent 提供工具名称、描述、参数 schema 和执行代码，
 * 系统创建 DynamicTool 实例并注册到 toolRegistry，
 * 后续轮次中 Agent 可直接调用新工具。
 */
export class CreateToolTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'create_tool',
    description:
      '为当前会话创建一个自定义工具。创建后可在后续步骤中直接调用。代码在沙箱中执行，接收 args 参数，需 return 结果。可访问 fetch（网络请求）、console.log（调试）、JSON、Date、Math、URL、setTimeout。不支持文件系统或进程操作，30 秒超时。',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '工具名称（snake_case，如 calc_tax、format_date）'
        },
        description: {
          type: 'string',
          description: '工具描述，Agent 据此决定何时使用此工具。写清楚用途和参数含义。'
        },
        parameters: {
          type: 'object',
          description: '工具参数的 JSON Schema。格式：{"type":"object","properties":{...},"required":[...]}'
        },
        code: {
          type: 'string',
          description: 'JavaScript 执行代码。接收 args 对象（工具参数），需 return 结果（字符串或 {content, success} 对象）。可访问 fetch、console.log、JSON、Date、Math、URL、setTimeout。示例：\nconst c = args.celsius\nreturn `${c}°C = ${c*9/5+32}°F`'
        }
      },
      required: ['name', 'description', 'parameters', 'code']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    _signal?: AbortSignal,
    _context?: ToolContext
  ): Promise<ToolResult> {
    onChunk?.({ toolStatus: 'calling', toolName: 'create_tool' })

    const name = (toolCall.arguments.name as string) || ''
    const description = (toolCall.arguments.description as string) || ''
    const parameters = toolCall.arguments.parameters as object
    const code = (toolCall.arguments.code as string) || ''

    if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) {
      return this.error(toolCall.id, `工具名 "${name}" 无效。需为 snake_case 格式（小写字母开头，只含字母数字下划线）。`)
    }
    if (!description) return this.error(toolCall.id, 'description 不能为空')
    if (!parameters || typeof parameters !== 'object') return this.error(toolCall.id, 'parameters 必须是 JSON Schema 对象')
    if (!code) return this.error(toolCall.id, 'code 不能为空')

    if (toolRegistry.has(name)) {
      return this.error(toolCall.id, `工具名 "${name}" 已存在。请换一个名称。`)
    }

    try {
      const tool = new DynamicTool({ name, description, parameters, code })
      toolRegistry.register(tool)

      return {
        toolCallId: toolCall.id,
        toolName: 'create_tool',
        content: `✅ 工具 \`${name}\` 已创建成功。\n\n描述：${description}\n\n你现在可以在后续步骤中直接调用 \`${name}\`。`,
        success: true,
        displayType: 'text',
        metadata: { newToolDefinition: tool.definition }
      }
    } catch (e) {
      return this.error(toolCall.id, `创建工具失败：${(e as Error).message}`)
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'create_tool', content: '', success: false, error: msg }
  }
}
