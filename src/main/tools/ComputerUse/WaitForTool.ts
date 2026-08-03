import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'
import { piBridge } from './PiBridge'

/**
 * WaitForTool — 等待 UI 条件满足
 * 对应 pi-computer-use 的 wait_for 工具
 * 通过 Windows Helper 的 uiaWaitFor 命令实现
 */
export class WaitForTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'wait_for',
    description:
      '等待特定 UI 条件出现或消失，返回满足条件后的新状态。' +
      '用于等待页面加载、弹窗出现/消失、文本变化等异步 UI 变化。' +
      '比轮询 observe_ui 更高效，因为直接监听 UIA 事件。',
    parameters: {
      type: 'object',
      properties: {
        stateId: { type: 'string', description: '当前 UI 状态 ID' },
        text: { type: 'string', description: '等待出现/消失的文本', default: '' },
        role: { type: 'string', description: '等待出现/消失的角色（如 button、dialog）', default: '' },
        ref: { type: 'string', description: '限制搜索范围的 @e 引用', default: '' },
        until: { type: 'string', description: '条件方向：present（等待出现）或 absent（等待消失）', enum: ['present', 'absent'], default: 'present' },
        timeoutMs: { type: 'number', description: '最大等待时间（毫秒），默认 10000', default: 10000 }
      },
      required: ['stateId']
    }
  }

  async execute(toolCall: ToolCall, onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal): Promise<ToolResult> {
    const stateId = (toolCall.arguments.stateId as string) || ''
    const text = (toolCall.arguments.text as string) || ''
    const role = (toolCall.arguments.role as string) || ''
    const ref = (toolCall.arguments.ref as string) || ''
    const until = (toolCall.arguments.until as string) || 'present'
    const timeoutMs = Math.min((toolCall.arguments.timeoutMs as number) || 10_000, 60_000)

    onChunk?.({ toolStatus: 'calling', toolName: 'wait_for' })

    if (!text && !role) {
      return this.error(toolCall.id, '至少需要指定 text 或 role 之一。')
    }

    try {
      const args: Record<string, unknown> = {
        text: text || undefined,
        role: role || undefined,
        until,
        timeoutMs,
      }
      if (ref) args.ref = ref

      const result = await piBridge.command<Record<string, unknown>>('uiaWaitFor', args, timeoutMs + 5_000)

      const satisfied = result?.satisfied !== false
      const condition = until === 'present' ? '出现' : '消失'
      const target = text || role

      if (satisfied) {
        return {
          toolCallId: toolCall.id, toolName: 'wait_for',
          content: `✅ 条件已满足："${target}" 已${condition}。`,
          success: true, displayType: 'text',
          metadata: { stateId, satisfied, text, role, until }
        }
      } else {
        return {
          toolCallId: toolCall.id, toolName: 'wait_for',
          content: `⏰ 等待超时：在 ${timeoutMs}ms 内 "${target}" 未${condition}。请重新 observe_ui 查看当前状态。`,
          success: true, displayType: 'text',
          metadata: { stateId, satisfied: false, text, role, until }
        }
      }
    } catch (e) {
      return this.error(toolCall.id, `等待 UI 条件失败：${(e as Error).message}`)
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'wait_for', content: '', success: false, error: msg }
  }
}
