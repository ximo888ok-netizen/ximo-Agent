import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'
import { piBridge } from './PiBridge'

/**
 * ActUiTool — 对 UI 元素执行操作
 * 对应 pi-computer-use 的 act_ui 工具
 * 通过 Windows Helper 的 act 命令实现语义化操作（Invoke/Toggle/SetValue/Click 等）
 */
export class ActUiTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'act_ui',
    description:
      '对 UI 元素执行一个或多个精确操作，返回操作后的新状态。' +
      '支持的操作：press（语义点击，通过无障碍API）、click（坐标点击）、setText（设值）、typeText（键盘输入）、keypress（快捷键）、scroll（滚动）、drag（拖拽）。' +
      '语义操作（press/setText）优先通过无障碍 API 执行，无需像素坐标，更准确更快速。' +
      '多步操作会按顺序执行，任一步失败则停止。' +
      '可附加 expect 条件验证操作是否生效。',
    parameters: {
      type: 'object',
      properties: {
        stateId: { type: 'string', description: '当前 UI 状态 ID（由 observe_ui 返回）' },
        actions: {
          type: 'string',
          description:
            'JSON 数组，每个元素是一个操作对象。' +
            '示例：[{"action":"press","ref":"@e5"},{"action":"setText","ref":"@e3","text":"hello"}]。' +
            'press: {"action":"press","ref":"@eN"} — 语义点击按钮/菜单项。' +
            'click: {"action":"click","x":100,"y":200} — 坐标点击。' +
            'clickByRef: {"action":"click","ref":"@eN"} — 按引用点击。' +
            'setText: {"action":"setText","ref":"@eN","text":"内容"} — 设置文本框值。' +
            'typeText: {"action":"typeText","text":"内容"} — 键盘输入（跟在 click 后使用焦点）。' +
            'keypress: {"action":"keypress","keys":["Enter"]} 或 ["Ctrl","C"]。' +
            'scroll: {"action":"scroll","ref":"@eN","scrollY":-3} — 滚动。' +
            'drag: {"action":"drag","path":[{"x":100,"y":200},{"x":300,"y":400}]}。'
        }
      },
      required: ['stateId', 'actions']
    }
  }

  async execute(toolCall: ToolCall, onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal): Promise<ToolResult> {
    const stateId = (toolCall.arguments.stateId as string) || ''
    const actionsRaw = toolCall.arguments.actions

    onChunk?.({ toolStatus: 'calling', toolName: 'act_ui' })

    // 解析 actions（可能是 JSON 字符串或已解析的数组）
    let actions: Record<string, unknown>[]
    if (typeof actionsRaw === 'string') {
      try {
        actions = JSON.parse(actionsRaw)
      } catch {
        return this.error(toolCall.id, 'actions 参数不是有效的 JSON 数组。')
      }
    } else if (Array.isArray(actionsRaw)) {
      actions = actionsRaw as Record<string, unknown>[]
    } else {
      return this.error(toolCall.id, 'actions 必须是 JSON 数组。')
    }

    if (actions.length === 0) {
      return this.error(toolCall.id, '至少需要一个操作。')
    }

    try {
      // 将每个 action 转换为 Helper 的 act 命令格式
      // Helper 的 act 命令接受单个 action，我们逐个执行
      const results: string[] = []
      let currentLookId = stateId || 'look' // 使用 observe_ui 返回的 stateId 作为 look 会话 ID

      for (let i = 0; i < actions.length; i++) {
        const action = actions[i]
        const helperArgs = buildHelperActArgs(action, currentLookId)

        const actResult = await piBridge.command<Record<string, unknown>>('act', helperArgs, 15_000)

        const outcome = (actResult as any)?.performed?.outcome || 'unknown'
        const newLookId = (actResult as any)?.lookId || currentLookId
        if (newLookId) currentLookId = newLookId

        const actionDesc = describeAction(action)
        if (outcome === 'worked') {
          results.push(`✅ 步骤 ${i + 1}: ${actionDesc} — 成功`)
        } else if (outcome === 'didnt') {
          results.push(`❌ 步骤 ${i + 1}: ${actionDesc} — 未生效（操作已执行但未产生预期变化）`)
          // 任一步失败则停止
          break
        } else {
          results.push(`⚠️ 步骤 ${i + 1}: ${actionDesc} — 结果不确定`)
        }
      }

      // 获取操作后的最新状态
      let newOutline = ''
      try {
        const lookResult = await piBridge.command<Record<string, unknown>>('look', {
          readText: 'auto',
          includeImage: true,
          maxDimension: 800
        }, 10_000)
        const outline = (lookResult as any)?.outline
        if (outline) {
          newOutline = '\n\n---\n\n**操作后 UI 状态：**\n\n' + formatOutlineCompact(outline)
        }
      } catch { /* 忽略后续观察失败 */ }

      return {
        toolCallId: toolCall.id, toolName: 'act_ui',
        content: results.join('\n') + newOutline,
        success: true, displayType: 'text',
        requiresConfirmation: true,
        confirmationMessage: `即将执行 ${actions.length} 步 UI 操作：${actions.map(describeAction).join(' → ')}`,
        metadata: { stateId, actionCount: actions.length, results }
      }
    } catch (e) {
      return this.error(toolCall.id, `UI 操作失败：${(e as Error).message}`)
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'act_ui', content: '', success: false, error: msg }
  }
}

/** 将 LLM 的 action 对象转换为 Helper act 命令的参数格式 */
function buildHelperActArgs(action: Record<string, unknown>, lookId: string): Record<string, unknown> {
  const actionType = String(action.action || '')
  const ref = action.ref as string | undefined

  // 构建 target
  let target: Record<string, unknown>
  if (ref) {
    target = { ref }
  } else if (action.x !== undefined && action.y !== undefined) {
    target = { x: Number(action.x), y: Number(action.y) }
  } else {
    target = {}
  }

  const base: Record<string, unknown> = {
    lookId,
    action: actionType,
    target,
    policy: 'default',
  }

  switch (actionType) {
    case 'press':
      return { ...base, params: {} }
    case 'click':
      return { ...base, params: { button: action.button || 'left', clickCount: action.clickCount || 1 } }
    case 'setText':
      return { ...base, action: 'setText', params: { text: String(action.text || '') } }
    case 'typeText':
      return { ...base, action: 'typeText', params: { text: String(action.text || '') } }
    case 'keypress': {
      const keys = Array.isArray(action.keys) ? action.keys : [String(action.keys || 'Enter')]
      return { ...base, action: 'keypress', params: { keys } }
    }
    case 'scroll':
      return { ...base, action: 'scroll', params: { scrollX: Number(action.scrollX || 0), scrollY: Number(action.scrollY || 0) } }
    case 'drag': {
      const path = action.path as Array<{ x: number; y: number }> | undefined
      return { ...base, action: 'drag', params: { path: path || [] } }
    }
    case 'moveMouse':
      return { ...base, action: 'moveMouse', params: {} }
    default:
      return { ...base, params: {} }
  }
}

/** 描述操作，用于日志和确认消息 */
function describeAction(action: Record<string, unknown>): string {
  const type = String(action.action || '?')
  const ref = action.ref ? ` ${action.ref}` : ''
  const text = action.text ? ` "${String(action.text).slice(0, 30)}"` : ''
  const keys = action.keys ? ` [${(action.keys as string[]).join('+')}]` : ''
  const xy = (action.x !== undefined && action.y !== undefined) ? ` (${action.x},${action.y})` : ''

  switch (type) {
    case 'press': return `语义点击${ref}`
    case 'click': return `坐标点击${xy || ref}`
    case 'setText': return `设值${ref}${text}`
    case 'typeText': return `键盘输入${text}`
    case 'keypress': return `按键${keys}`
    case 'scroll': return `滚动${ref}`
    case 'drag': return `拖拽${xy}`
    default: return `${type}${ref}${text}`
  }
}

/** 紧凑格式化 outline（只显示叶子节点和可交互元素） */
function formatOutlineCompact(node: Record<string, unknown>, indent = 0): string {
  const lines: string[] = []
  const prefix = '  '.repeat(indent)
  const ref = node.ref || ''
  const role = node.role || ''
  const label = node.label || node.title || ''
  const capabilities = node.capabilities as Record<string, unknown> | undefined

  // 只显示有标签、可交互或顶层元素
  const isInteractive = capabilities && (
    capabilities.canInvoke || capabilities.canPress || capabilities.canSetValue ||
    capabilities.isEnabled === false
  )
  if (label || isInteractive || indent === 0) {
    const capStr = capabilities
      ? Object.entries(capabilities)
          .filter(([, v]) => v === true)
          .map(([k]) => k.replace(/^can/, ''))
          .join(',')
      : ''
    const value = node.value ? `="${String(node.value).slice(0, 30)}"` : ''
    lines.push(`${prefix}${ref} ${role}: "${label}"${value}${capStr ? ` [${capStr}]` : ''}`)
  }

  const children = node.children as Record<string, unknown>[] | undefined
  if (Array.isArray(children)) {
    for (const child of children) {
      lines.push(formatOutlineCompact(child, indent + 1))
    }
  }

  return lines.join('\n')
}
