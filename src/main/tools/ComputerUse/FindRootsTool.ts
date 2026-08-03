import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'
import { piBridge } from './PiBridge'

/**
 * FindRootsTool — 查找桌面窗口根节点
 * 对应 pi-computer-use 的 find_roots 工具
 * 通过 Windows Helper 的 listRoots 命令实现
 */
export class FindRootsTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'find_roots',
    description:
      '查找当前桌面上所有可控制的 UI 根节点（窗口、对话框、菜单等），返回根节点引用(@r)、标题、进程信息、焦点状态。' +
      '在 observe_ui 之前使用此工具定位目标窗口。' +
      '返回的 @r 引用可在后续 observe_ui 中使用。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '按窗口标题模糊搜索', default: '' },
        app: { type: 'string', description: '按应用名称精确匹配', default: '' },
        pid: { type: 'number', description: '按进程 ID 精确匹配', default: 0 }
      },
      required: []
    }
  }

  async execute(toolCall: ToolCall, onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal): Promise<ToolResult> {
    onChunk?.({ toolStatus: 'calling', toolName: 'find_roots' })

    try {
      const args: Record<string, unknown> = {}
      const text = (toolCall.arguments.text as string) || ''
      const app = (toolCall.arguments.app as string) || ''
      const pid = (toolCall.arguments.pid as number) || 0

      if (text) args.title = text
      if (app) args.appName = app
      if (pid > 0) args.pid = pid

      const result = await piBridge.command<{ roots?: unknown[] }>('listRoots', args, 10_000)

      const roots = Array.isArray(result?.roots) ? result.roots : []
      if (roots.length === 0) {
        return {
          toolCallId: toolCall.id, toolName: 'find_roots',
          content: text || app ? `未找到匹配 "${text || app}" 的窗口。` : '当前没有打开的窗口。',
          success: true
        }
      }

      const lines = ['## 🖥️ 桌面窗口列表', '']
      for (let i = 0; i < roots.length; i++) {
        const r = roots[i] as Record<string, unknown>
        const rootRef = r.rootRef || `@r${i + 1}`
        const title = r.title || '(无标题)'
        const appName = r.appName || ''
        const pidVal = r.pid || ''
        const isFocused = r.isFocused ? ' 🔥' : ''
        lines.push(`**${i + 1}.** \`${rootRef}\` — ${title}${isFocused}`)
        if (appName) lines.push(`   应用：${appName} (PID: ${pidVal})`)
        lines.push('')
      }
      lines.push(`共 ${roots.length} 个窗口。使用 observe_ui(root="窗口引用") 查看某个窗口的 UI 元素。`)

      return {
        toolCallId: toolCall.id, toolName: 'find_roots',
        content: lines.join('\n'),
        success: true, displayType: 'text',
        metadata: { rootCount: roots.length, roots }
      }
    } catch (e) {
      return this.error(toolCall.id, `查找窗口失败：${(e as Error).message}`)
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'find_roots', content: '', success: false, error: msg }
  }
}
