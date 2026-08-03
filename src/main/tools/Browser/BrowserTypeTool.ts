import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'
import { BrowserManager } from './BrowserManager'
import { isEmbeddedBrowserActive, executeWebviewCommand } from './WebviewBridge'
import { cleanBrowserError } from './index'

export class BrowserTypeTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'browser_type',
    description: '在输入框中输入文本。会先清空再填入。支持 CSS 选择器。填写多字段表单时可在同一轮并行调用多个 browser_type（每个针对不同 selector），减少操作轮次。',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: '输入框的 CSS 选择器。优先使用 #id，其次 input[name=xxx] 或 textarea' },
        text: { type: 'string', description: '要输入的文本' }
      },
      required: ['selector', 'text']
    }
  }

  async execute(toolCall: ToolCall, onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal): Promise<ToolResult> {
    const selector = (toolCall.arguments.selector as string) || ''
    const text = (toolCall.arguments.text as string) || ''
    if (!selector) return this.error(toolCall.id, '缺少 selector 参数')
    if (!text) return this.error(toolCall.id, '缺少 text 参数')

    onChunk?.({ toolStatus: 'calling', toolName: 'browser_type' })

    try {
      // 优先使用内嵌浏览器
      if (isEmbeddedBrowserActive()) {
        const result = await executeWebviewCommand('type', { selector, text }) as boolean
        if (!result) {
          return this.error(toolCall.id, `未找到输入框：${selector}。建议：1) 调用 browser_get_content 检查页面结构 2) 确认输入框选择器正确 3) 尝试 input[type] 或 textarea 等通用选择器`)
        }
        return {
          toolCallId: toolCall.id, toolName: 'browser_type',
          content: `已在内嵌浏览器中的 "${selector}" 输入：${text.slice(0, 100)}`,
          success: true, displayType: 'text',
          metadata: { selector, textLength: text.length, embedded: true }
        }
      }

      // 回退到 Playwright
      const page = await BrowserManager.getInstance().getPage()
      await page.locator(selector).first().fill(text, { timeout: 10000 })
      return {
        toolCallId: toolCall.id, toolName: 'browser_type',
        content: `已在 "${selector}" 中输入：${text.slice(0, 100)}`,
        success: true, displayType: 'text',
        metadata: { selector, textLength: text.length }
      }
    } catch (e) {
      return this.error(toolCall.id, `输入失败：${cleanBrowserError((e as Error).message)}。建议：调用 browser_get_content 检查页面结构后重试。`)
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'browser_type', content: '', success: false, error: msg }
  }
}
