import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk, ToolContext } from '@shared/types'
import { runCli, tryParseJson, getOfficeCliVersion, ensureOfficeCli } from './OfficeCliRunner'
import { assertSupportedExt, defaultOutputDir } from './OfficeCliManager'

/**
 * OfficeDocsTool — 办公文档创建/读取/编辑（Word/Excel/PowerPoint）
 *
 * 基于 OfficeCLI（Apache-2.0，单二进制）实现：
 * - 路径寻址：/slide[1]/shape[2]、/body/p[1]
 * - CSS-like 查询：row[Salary>5000]
 * - 结构化 JSON 输出 + 错误自愈（属性名拼错自动纠错建议）
 *
 * 所有写操作前自动对目标文件做快照备份（%TEMP%/ximo-agent-snapshots/），
 * 可回退，安全等级 = 可逆写。
 */

const SUPPORTED_ACTIONS = [
  'create', 'get', 'query', 'set', 'add', 'remove', 'move',
  'batch', 'merge', 'validate', 'dump', 'view', 'save', 'help'
] as const

type Action = typeof SUPPORTED_ACTIONS[number]

/** 写操作集合 — 执行前对目标文件做快照备份（可回退） */
const WRITE_ACTIONS: ReadonlySet<string> = new Set(['create', 'set', 'add', 'remove', 'move', 'batch', 'merge', 'dump', 'save'])

/** 快照备份 — 写操作前调用，返回快照路径或 null */
async function snapshotIfExists(filePath: string): Promise<string | null> {
  try {
    const { existsSync } = await import('fs')
    const { copyFile, mkdir } = await import('fs/promises')
    const { join, basename } = await import('path')
    const { tmpdir } = await import('os')
    if (!existsSync(filePath)) return null
    const snapDir = join(tmpdir(), 'ximo-agent-snapshots')
    const safeName = basename(filePath).replace(/[^\w.-]/g, '_')
    const bakPath = join(snapDir, `${safeName}.snapshot-${Date.now()}.bak`)
    await mkdir(snapDir, { recursive: true })
    await copyFile(filePath, bakPath)
    return bakPath
  } catch {
    return null
  }
}

/**
 * 将 properties 对象转换为 officecli 的 --prop 键值参数数组（实测语法：必须 --prop 前缀）
 * 过滤保留字：type 由 --type 参数传递，不进入 --prop（实测：--prop type= 不受支持）
 */
function propsToArgs(props: Record<string, unknown> | undefined): string[] {
  if (!props || typeof props !== 'object') return []
  const args: string[] = []
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue
    if (k === 'type') continue
    const val = typeof v === 'object' ? JSON.stringify(v) : String(v)
    args.push('--prop', `${k}=${val}`)
  }
  return args
}

/**
 * 将 tool 层 operations 转换为 officecli batch 的 command 数组。
 * 支持两种输入格式：
 * 1. 工具层格式：{ action, path, properties, ... } → 转换为 { command, path, props, ... }
 * 2. officecli 原生格式：{ command, path, props, ... } → 原样透传
 */
function operationsToCommands(ops: unknown[]): unknown[] {
  return ops.map((op) => {
    if (!op || typeof op !== 'object') return op
    const o = op as Record<string, unknown>

    // 原生格式（command 键）→ 直接透传（过滤 undefined 字段）
    if (o.command) {
      const native: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(o)) {
        if (v !== undefined) native[k] = v
      }
      return native
    }

    // 工具层格式（action 键）→ 转换为 command 结构
    const cmd: Record<string, unknown> = {}
    if (o.action) cmd.command = o.action
    if (o.path !== undefined) cmd.path = o.path
    if (o.parent !== undefined) cmd.parent = o.parent
    if (o.selector !== undefined) cmd.selector = o.selector
    if (o.type !== undefined) cmd.type = o.type
    if (o.properties && typeof o.properties === 'object') cmd.props = o.properties
    if (o.to !== undefined) cmd.to = o.to
    if (o.after !== undefined) cmd.after = o.after
    if (o.before !== undefined) cmd.before = o.before
    if (o.path2 !== undefined) cmd.path2 = o.path2
    return cmd
  })
}

export class OfficeDocsTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'office_docs',
    description:
      '创建/读取/编辑 Microsoft Office 文档：Word(.docx)、Excel(.xlsx)、PowerPoint(.pptx)。' +
      '基于 OfficeCLI v1.0.143 实测语法（2026-08-04 验证）：\n' +
      '1. 属性设置必须用 --prop 前缀：set <file> <path> --prop text=xxx\n' +
      '2. 新增幻灯片用：add <file> / --type slide（挂根目录，非 /slides）\n' +
      '3. 新增 shape 用：add <file> /slide[N] --type shape --prop text=xxx（type 属性不受支持，默认 textbox）\n' +
      '4. 文件默认驻留后台（resident），用 save <file> 持久化到磁盘\n' +
      '5. 属性名不确定时用 help 查询：help add / help set / help <ext> <element>\n' +
      '6. 查询输出带 --json，结构化返回；错误带 code+suggestion 可自愈重试\n' +
      '路径寻址：/slide[1]/shape[2]；CSS-like 查询：row[Salary>5000]。' +
      'action 包括：create、get、query、set、add、remove、move、batch、merge、validate、dump、view、save、help。' +
      'view 用于截图预览（无需安装 Office）；save 用于将 resident 内存中的改动持久化到磁盘。' +
      '写操作自动快照备份（%TEMP%/ximo-agent-snapshots/），可回退。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [...SUPPORTED_ACTIONS],
          description: '要执行的操作'
        },
        filePath: {
          type: 'string',
          description: '目标文档路径（.docx / .xlsx / .pptx）'
        },
        path: {
          type: 'string',
          description: '元素路径，如 /slide[1]/shape[2]（get/set/remove/move 使用）'
        },
        selector: {
          type: 'string',
          description: 'CSS-like 查询选择器，如 row[Salary>5000]（query 使用）'
        },
        properties: {
          type: 'object',
          description: '要设置的属性键值对（set 使用，如 { text: "标题" }）'
        },
        operations: {
          type: 'array',
          description: 'batch 批量操作列表，如 [{ action: "set", path: "/slide[1]/shape[1]", properties: { text: "新标题" } }]'
        },
        templateData: {
          type: 'object',
          description: 'merge 模板合并数据，替换 {{key}} 占位符'
        },
        outputPath: {
          type: 'string',
          description: '输出文件路径（create/dump/merge/view 使用，默认与 filePath 同目录）'
        },
        depth: {
          type: 'number',
          default: 1,
          description: 'get 递归深度，默认 1'
        },
        mode: {
          type: 'string',
          default: 'screenshot',
          description: 'view 模式：screenshot（截图预览，无需 Office）/ markdown / json 等'
        }
      },
      required: ['action', 'filePath']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
    _context?: ToolContext
  ): Promise<ToolResult> {
    const args = toolCall.arguments
    const action = (args.action as Action) || ''
    const filePath = (args.filePath as string) || ''

    if (!SUPPORTED_ACTIONS.includes(action)) {
      return this.error(toolCall.id, `未知操作: ${action}。支持: ${SUPPORTED_ACTIONS.join(', ')}`)
    }
    if (!filePath) {
      return this.error(toolCall.id, '缺少 filePath 参数')
    }

    // create 允许新建文件（不存在也合法）；其余操作要求扩展名合法
    if (action !== 'create') {
      const check = assertSupportedExt(filePath)
      if (!check.valid) return this.error(toolCall.id, check.error ?? '文件类型不支持')
    }

    // 检查二进制可用性
    const ready = await ensureOfficeCli()
    if (!ready.ok) {
      return this.error(toolCall.id, ready.hint ?? 'OfficeCLI 未安装')
    }

    // 写操作前快照备份（可回退安全网）
    if (WRITE_ACTIONS.has(action)) {
      const snap = await snapshotIfExists(filePath)
      if (snap) {
        console.log(`[office_docs] 已备份 ${filePath} → ${snap}`)
      }
    }

    onChunk?.({ toolStatus: 'calling', toolName: 'office_docs' })

    try {
      const result = await this.dispatch(action, args, filePath, signal)
      // 非零退出码 → 结构化为错误（透传 OfficeCLI 的 suggestion 供 Agent 自愈）
      if (result.exitCode !== 0) {
        const parsed = tryParseJson<{ error?: { error?: string; suggestion?: string } }>(result.stderr || result.stdout)
        const errMsg = parsed?.error?.error ?? (result.stderr.trim() || result.stdout.trim() || `退出码 ${result.exitCode}`)
        const suggestion = parsed?.error?.suggestion ? `\n建议: ${parsed.error.suggestion}` : ''
        return this.error(toolCall.id, `${errMsg}${suggestion}`)
      }

      return this.formatSuccess(toolCall.id, action, result.stdout)
    } catch (e) {
      return this.error(toolCall.id, `OfficeCLI 执行失败: ${(e as Error).message}`)
    }
  }

  /** 按 action 分发为 officecli 命令 */
  private async dispatch(
    action: Action,
    args: Record<string, unknown>,
    filePath: string,
    signal?: AbortSignal
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    const cliArgs: string[] = [action]
    const outputPath = (args.outputPath as string) || ''

    switch (action) {
      case 'create': {
        // officecli create 输出到 outputPath（默认与 filePath 同目录，文件名含扩展名）
        const out = outputPath || filePath
        cliArgs.push(out)
        break
      }
      case 'get': {
        cliArgs.push(filePath, (args.path as string) || '/')
        const depth = (args.depth as number) ?? 1
        if (depth > 1) cliArgs.push('--depth', String(depth))
        cliArgs.push('--json')
        break
      }
      case 'query': {
        cliArgs.push(filePath, (args.selector as string) || '')
        cliArgs.push('--json')
        break
      }
      case 'set': {
        cliArgs.push(filePath, (args.path as string) || '')
        cliArgs.push(...propsToArgs(args.properties as Record<string, unknown> | undefined))
        cliArgs.push('--json')
        break
      }
      case 'add': {
        // 实测：slide 挂根目录 '/'；shape 挂 /slide[N]；属性用 --prop
        const parent = (args.path as string) || ''
        // slide 类型：父路径必须是 '/'（根）
        const isSlide =
          (args.properties as Record<string, unknown> | undefined)?.type === 'slide' ||
          (args.type as string) === 'slide'
        // 若通过 properties.type 指定类型（如 { type: 'slide' }），将其提升为 --type 参数，
        // 否则会被 propsToArgs 过滤掉导致没有类型信息
        const propType = (args.properties as Record<string, unknown> | undefined)?.type
        const effectiveType = (args.type as string) || (typeof propType === 'string' ? propType : '')
        cliArgs.push(filePath, isSlide ? '/' : (parent || '/'))
        if (effectiveType) cliArgs.push('--type', effectiveType)
        cliArgs.push(...propsToArgs(args.properties as Record<string, unknown> | undefined))
        cliArgs.push('--json')
        break
      }
      case 'remove': {
        cliArgs.push(filePath, (args.path as string) || '')
        cliArgs.push('--json')
        break
      }
      case 'move': {
        cliArgs.push(filePath, (args.path as string) || '')
        cliArgs.push(...propsToArgs(args.properties as Record<string, unknown> | undefined))
        cliArgs.push('--json')
        break
      }
      case 'batch': {
        cliArgs.push(filePath)
        const ops = (args.operations as unknown[]) || []
        // officecli batch 期望 { command, path, props, ... } 结构（不是 { action, properties }）
        cliArgs.push('--commands', JSON.stringify(operationsToCommands(ops)))
        cliArgs.push('--json')
        break
      }
      case 'merge': {
        // officecli merge <template> <output> --data <json>（不是 --json 参数！）
        cliArgs.push(filePath) // template
        cliArgs.push(outputPath || defaultOutputDir(filePath)) // output 必填
        const data = args.templateData ?? {}
        cliArgs.push('--data', JSON.stringify(data))
        cliArgs.push('--json')
        break
      }
      case 'validate': {
        cliArgs.push(filePath)
        break
      }
      case 'dump': {
        cliArgs.push(filePath)
        if (outputPath) cliArgs.push('-o', outputPath)
        else cliArgs.push('--json')
        break
      }
      case 'view': {
        // officecli view <file> <mode> [-o output] — 实测：screenshot 模式无需 Office
        const mode = (args.mode as string) || 'screenshot'
        cliArgs.push(filePath, mode)
        if (outputPath) cliArgs.push('-o', outputPath)
        cliArgs.push('--json')
        break
      }
      case 'save': {
        // 将 resident 内存中的改动 flush 到磁盘
        cliArgs.push(filePath)
        break
      }
      case 'help': {
        // help [format] [command] — 从 args 提取
        cliArgs.push(filePath) // 复用 filePath 参数作为 format（.docx/.xlsx/.pptx）
        const sub = (args.path as string) || ''
        if (sub) cliArgs.push(sub)
        break
      }
      default:
        break
    }

    return runCli(cliArgs, { timeout: 90, signal })
  }

  /** 成功结果格式化 — 附带版本信息与产物路径 */
  private async formatSuccess(id: string, action: Action, stdout: string): Promise<ToolResult> {
    const version = await getOfficeCliVersion()
    const content = stdout.trim() || `操作 ${action} 完成（无输出）`
    return {
      toolCallId: id,
      toolName: 'office_docs',
      content,
      success: true,
      displayType: 'text',
      metadata: {
        action,
        officeCliVersion: version,
        isJsonOutput: stdout.trim().startsWith('{') || stdout.trim().startsWith('[')
      }
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'office_docs', content: '', success: false, error: msg }
  }
}
