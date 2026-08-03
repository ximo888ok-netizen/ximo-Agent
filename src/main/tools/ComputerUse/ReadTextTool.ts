import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'
import { piBridge } from './PiBridge'

/**
 * ReadTextTool — 读取 UI 元素的文本内容
 * 对应 pi-computer-use 的 read_text 工具
 * 通过 Windows Helper 的 uiaReadText 命令实现
 */
export class ReadTextTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'read_text',
    description:
      '读取 UI 元素（@e 引用）的完整文本内容，支持分页读取。' +
      '用于读取文档区域、文本框、长列表等内容。' +
      '需要提供 observe_ui 返回的 stateId 和 @e 引用。',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'observe_ui/search_ui 返回的 @e 引用' },
        stateId: { type: 'string', description: 'UI 状态 ID' },
        offset: { type: 'number', description: '文本偏移量（Unicode 字符），用于分页读取', default: 0 }
      },
      required: ['ref', 'stateId']
    }
  }

  async execute(toolCall: ToolCall, onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal): Promise<ToolResult> {
    const ref = (toolCall.arguments.ref as string) || ''
    const stateId = (toolCall.arguments.stateId as string) || ''
    const offset = (toolCall.arguments.offset as number) || 0

    onChunk?.({ toolStatus: 'calling', toolName: 'read_text' })

    if (!ref) {
      return this.error(toolCall.id, '需要指定 ref（@e 引用）。')
    }

    try {
      const result = await piBridge.command<string>('uiaReadText', {
        ref,
        offset,
      }, 10_000)

      const text = typeof result === 'string' ? result : JSON.stringify(result)

      if (!text || text.trim().length === 0) {
        return {
          toolCallId: toolCall.id, toolName: 'read_text',
          content: `${ref} 没有可读取的文本内容。`,
          success: true
        }
      }

      return {
        toolCallId: toolCall.id, toolName: 'read_text',
        content: `## 📄 ${ref} 文本内容\n\n${text}`,
        success: true, displayType: 'text',
        metadata: { ref, stateId, offset, length: text.length }
      }
    } catch (e) {
      return this.error(toolCall.id, `读取文本失败：${(e as Error).message}`)
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'read_text', content: '', success: false, error: msg }
  }
}
