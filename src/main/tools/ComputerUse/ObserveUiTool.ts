import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'
import { piBridge } from './PiBridge'

/**
 * ObserveUiTool — 观察 UI 元素树
 * 对应 pi-computer-use 的 observe_ui 工具
 * 通过 Windows Helper 的 look 命令实现，获取窗口的无障碍树 + 可选截图
 */
export class ObserveUiTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'observe_ui',
    description:
      '观察一个窗口根节点（@r）的 UI 元素树，返回折叠的 UI 大纲和 stateId。' +
      '这是主要的 UI 感知工具，先用 find_roots 获取 @r 引用，再用此工具查看其内容。' +
      '返回的 @e 引用可在 act_ui、search_ui、expand_ui、inspect_ui 中使用。' +
      '每个 @e 引用绑定到特定的 stateId，操作后需使用新的 stateId。',
    parameters: {
      type: 'object',
      properties: {
        root: { type: 'string', description: 'find_roots 返回的 @r 引用（如 @r1）。不填则观察当前前台窗口。', default: '' },
        mode: { type: 'string', description: '观察模式：semantic（纯语义，最快）、visual（强制截图+OCR）、fused（自动选择，默认）', enum: ['semantic', 'visual', 'fused'], default: 'fused' }
      },
      required: []
    }
  }

  async execute(toolCall: ToolCall, onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal): Promise<ToolResult> {
    const root = (toolCall.arguments.root as string) || ''
    const mode = (toolCall.arguments.mode as string) || 'fused'
    onChunk?.({ toolStatus: 'calling', toolName: 'observe_ui' })

    try {
      const args: Record<string, unknown> = {
        readText: mode === 'semantic' ? 'never' : 'auto',
        includeImage: mode !== 'semantic',
        maxDimension: 1280
      }
      if (root) args.windowRef = root

      const result = await piBridge.command<Record<string, unknown>>('look', args, 20_000)

      // 解析 Helper 返回的 outline
      const outline = result?.outline
      const stateId = (result as any)?.stateId || (result as any)?.lookId || ''
      const note = (result?.note as string) || ''
      const image = result?.image

      if (!outline) {
        return {
          toolCallId: toolCall.id, toolName: 'observe_ui',
          content: note || '观察完成，但未获取到 UI 大纲。请确认目标窗口是否存在且可访问。',
          success: true, displayType: 'text',
          metadata: { stateId }
        }
      }

      // 格式化 outline 为可读文本
      const formatted = formatOutline(outline as Record<string, unknown>)

      const lines = [
        `## 🔍 UI 观察${root ? ` — ${root}` : ''}`,
        '',
        `**stateId:** \`${stateId}\``,
        '',
        formatted
      ]

      if (note) {
        lines.push('', '---', '', note)
      }

      const toolResult: ToolResult = {
        toolCallId: toolCall.id, toolName: 'observe_ui',
        content: lines.join('\n'),
        success: true, displayType: 'text',
        metadata: { stateId, rootRef: root }
      }

      // 如果有截图，附带
      if (image && typeof image === 'string') {
        toolResult.screenshot = image.startsWith('data:') ? image : `data:image/png;base64,${image}`
      }

      return toolResult
    } catch (e) {
      return this.error(toolCall.id, `UI 观察失败：${(e as Error).message}`)
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'observe_ui', content: '', success: false, error: msg }
  }
}

/** 格式化 outline 节点为缩进文本 */
function formatOutline(node: Record<string, unknown>, indent = 0): string {
  const lines: string[] = []
  const prefix = '  '.repeat(indent)
  const ref = node.ref || ''
  const role = node.role || ''
  const label = node.label || node.title || ''
  const value = node.value ? ` = "${String(node.value).slice(0, 60)}"` : ''
  const capabilities = node.capabilities as Record<string, unknown> | undefined
  const capStr = capabilities
    ? Object.entries(capabilities)
        .filter(([, v]) => v === true)
        .map(([k]) => k)
        .join(', ')
    : ''
  const capDisplay = capStr ? ` [${capStr}]` : ''

  const line = label
    ? `${prefix}${ref} ${role}: "${label}"${value}${capDisplay}`
    : `${prefix}${ref} ${role}${value}${capDisplay}`
  lines.push(line)

  const children = node.children as Record<string, unknown>[] | undefined
  if (Array.isArray(children)) {
    for (const child of children) {
      lines.push(formatOutline(child, indent + 1))
    }
  }

  return lines.join('\n')
}
