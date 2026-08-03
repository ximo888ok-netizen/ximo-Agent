import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'
import { BrowserManager } from './BrowserManager'
import { isEmbeddedBrowserActive, executeWebviewCommand } from './WebviewBridge'
import { cleanBrowserError } from './index'

export class BrowserClickTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'browser_click',
    description: '点击页面中的元素。支持 CSS 选择器、XPath 和文本匹配。点击后自动返回截图。选择器优先级：#id > .class > text=文本 > XPath。操作失败时先调用 browser_get_content 检查页面结构。',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS 选择器、XPath 或文本匹配。例如 "#submit-btn", "//button[@type=\'submit\']", "text=登录"' }
      },
      required: ['selector']
    }
  }

  async execute(toolCall: ToolCall, onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal): Promise<ToolResult> {
    const selector = (toolCall.arguments.selector as string) || ''
    if (!selector) return this.error(toolCall.id, '缺少 selector 参数')

    onChunk?.({ toolStatus: 'calling', toolName: 'browser_click' })

    try {
      // 优先使用内嵌浏览器
      if (isEmbeddedBrowserActive()) {
        const result = await executeWebviewCommand('click', { selector }) as boolean
        const screenshot = await executeWebviewCommand('screenshot', {}) as string | undefined
        if (!result) {
          return this.error(toolCall.id, `未找到元素：${selector}。建议：1) 调用 browser_get_content 检查当前页面结构 2) 确认页面已加载完成 3) 尝试更简单的选择器（如 #id 或 text=文本内容）`)
        }
        return {
          toolCallId: toolCall.id, toolName: 'browser_click',
          content: `已在内嵌浏览器中点击元素：${selector}`,
          success: true, displayType: 'text',
          screenshot: screenshot || undefined,
          metadata: { selector, embedded: true }
        }
      }

      // 回退到 Playwright
      const page = await BrowserManager.getInstance().getPage()
      if (selector.startsWith('//') || selector.startsWith('(')) {
        await page.locator(`xpath=${selector}`).first().click({ timeout: 10000 })
      } else if (selector.startsWith('text=')) {
        await page.locator(selector).first().click({ timeout: 10000 })
      } else {
        await page.locator(selector).first().click({ timeout: 10000 })
      }

      // 自动截图
      let screenshot: string | undefined
      try {
        const buffer = await page.screenshot({ type: 'png', fullPage: false })
        screenshot = `data:image/png;base64,${buffer.toString('base64')}`
      } catch { /* 截图失败不影响主流程 */ }

      return {
        toolCallId: toolCall.id, toolName: 'browser_click',
        content: `已点击元素：${selector}`,
        success: true, displayType: 'text',
        screenshot,
        metadata: { selector }
      }
    } catch (e) {
      return this.error(toolCall.id, `点击失败：${cleanBrowserError((e as Error).message)}。建议：调用 browser_get_content 检查页面结构后重试。`)
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'browser_click', content: '', success: false, error: msg }
  }
}
