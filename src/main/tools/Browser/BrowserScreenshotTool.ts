import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'
import { BrowserManager } from './BrowserManager'
import { isEmbeddedBrowserActive, executeWebviewCommand } from './WebviewBridge'
import { cleanBrowserError } from './index'

export class BrowserScreenshotTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'browser_screenshot',
    description: '截取当前浏览器页面的截图。注意：browser_navigate 和 browser_click 已自动返回截图，仅在需要额外视觉确认时使用此工具，避免冗余截图浪费上下文。',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: '可选 CSS 选择器，截取特定元素', default: '' },
        fullPage: { type: 'boolean', description: '是否截取整个页面，默认 false', default: false }
      },
      required: []
    }
  }

  async execute(toolCall: ToolCall, onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal): Promise<ToolResult> {
    const selector = (toolCall.arguments.selector as string) || ''
    const fullPage = (toolCall.arguments.fullPage as boolean) || false
    onChunk?.({ toolStatus: 'calling', toolName: 'browser_screenshot' })

    try {
      // 优先使用内嵌浏览器
      if (isEmbeddedBrowserActive()) {
        const dataUrl = await executeWebviewCommand('screenshot', {}) as string
        if (dataUrl) {
          const sizeKB = Math.round(dataUrl.length * 0.75 / 1024)
          return {
            toolCallId: toolCall.id, toolName: 'browser_screenshot',
            content: `内嵌浏览器截图已生成（约 ${sizeKB} KB）。`,
            success: true, displayType: 'text',
            screenshot: dataUrl,
            metadata: { sizeKB, embedded: true }
          }
        }
        return this.error(toolCall.id, '内嵌浏览器截图失败')
      }

      // 回退到 Playwright
      const page = await BrowserManager.getInstance().getPage()
      let buffer: Buffer
      if (selector) {
        const el = page.locator(selector).first()
        buffer = await el.screenshot({ type: 'png' })
      } else {
        buffer = await page.screenshot({ type: 'png', fullPage })
      }
      const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`
      return {
        toolCallId: toolCall.id, toolName: 'browser_screenshot',
        content: `页面截图已生成（${(buffer.length / 1024).toFixed(1)} KB）。${dataUrl.slice(0, 100)}...`,
        success: true, displayType: 'text',
        screenshot: dataUrl,
        metadata: { sizeKB: (buffer.length / 1024).toFixed(1) }
      }
    } catch (e) {
      return this.error(toolCall.id, `截图失败：${cleanBrowserError((e as Error).message)}`)
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'browser_screenshot', content: '', success: false, error: msg }
  }
}
