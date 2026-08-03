import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'
import { BrowserManager } from './BrowserManager'
import { isEmbeddedBrowserActive, executeWebviewCommand } from './WebviewBridge'
import { cleanBrowserError } from './index'

export class BrowserGetContentTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'browser_get_content',
    description: '获取当前页面的文本内容（纯文本，已清理 HTML 标签）。建议在操作不熟悉的页面前调用以了解页面结构，选择正确的选择器，减少错误操作和失败重试。可选择提取特定元素。',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: '可选 CSS 选择器，提取特定元素内容', default: 'body' },
        maxLength: { type: 'number', description: '最大字符数，默认 10000', default: 10000 }
      },
      required: []
    }
  }

  async execute(toolCall: ToolCall, onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal): Promise<ToolResult> {
    const selector = (toolCall.arguments.selector as string) || 'body'
    const maxLength = Math.min((toolCall.arguments.maxLength as number) || 10000, 50000)

    onChunk?.({ toolStatus: 'calling', toolName: 'browser_get_content' })

    try {
      // 优先使用内嵌浏览器
      if (isEmbeddedBrowserActive()) {
        const result = await executeWebviewCommand('getContent', { selector }) as string
        const cleaned = (result || '').replace(/\n{3,}/g, '\n\n').trim()
        const truncated = cleaned.length > maxLength
          ? cleaned.slice(0, maxLength) + `...(共 ${cleaned.length} 字符)`
          : cleaned
        return {
          toolCallId: toolCall.id, toolName: 'browser_get_content',
          content: truncated,
          success: true, displayType: 'text',
          metadata: { selector, length: cleaned.length, truncated: cleaned.length > maxLength, embedded: true }
        }
      }

      // 回退到 Playwright
      const page = await BrowserManager.getInstance().getPage()
      const text = await page.locator(selector).first().textContent({ timeout: 10000 })
      const cleaned = (text || '').replace(/\n{3,}/g, '\n\n').trim()
      const truncated = cleaned.length > maxLength
        ? cleaned.slice(0, maxLength) + `...(共 ${cleaned.length} 字符)`
        : cleaned

      return {
        toolCallId: toolCall.id, toolName: 'browser_get_content',
        content: truncated,
        success: true, displayType: 'text',
        metadata: { selector, length: cleaned.length, truncated: cleaned.length > maxLength }
      }
    } catch (e) {
      return this.error(toolCall.id, `获取内容失败：${cleanBrowserError((e as Error).message)}`)
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'browser_get_content', content: '', success: false, error: msg }
  }
}
