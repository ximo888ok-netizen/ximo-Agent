import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk, ToolContext } from '@shared/types'
import { BrowserManager } from './BrowserManager'
import { isEmbeddedBrowserActive, executeWebviewCommand } from './WebviewBridge'
import { cleanBrowserError } from './index'

/**
 * BrowserNavigateTool — 导航到 URL
 */
export class BrowserNavigateTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'browser_navigate',
    description: '在浏览器中打开指定 URL。导航完成后自动返回页面标题、URL 和截图 — 无需额外调用 browser_screenshot。',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '要导航到的 URL' },
        headless: { type: 'boolean', description: '是否无头模式，默认 true', default: true }
      },
      required: ['url']
    }
  }

  async execute(toolCall: ToolCall, onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal, context?: ToolContext): Promise<ToolResult> {
    const url = (toolCall.arguments.url as string) || ''
    if (!url) return this.error(toolCall.id, '缺少 url 参数')

    onChunk?.({ toolStatus: 'calling', toolName: 'browser_navigate' })

    try {
      // 优先使用内嵌浏览器
      if (isEmbeddedBrowserActive()) {
        await executeWebviewCommand('navigate', { url })
        // 等待页面加载
        await new Promise(r => setTimeout(r, 1500))
        const title = await executeWebviewCommand('getTitle', {}) as string
        const currentUrl = await executeWebviewCommand('getURL', {}) as string
        const screenshot = await executeWebviewCommand('screenshot', {}) as string | undefined
        return {
          toolCallId: toolCall.id, toolName: 'browser_navigate',
          content: `已在内嵌浏览器中导航到：${url}\n页面标题：${title}\n当前 URL：${currentUrl}`,
          success: true, displayType: 'text',
          screenshot: screenshot || undefined,
          metadata: { url, title, embedded: true }
        }
      }

      // 回退到 Playwright
      const headless = toolCall.arguments.headless !== false
      const mgr = BrowserManager.getInstance()
      mgr.setHeadless(headless)
      if (context) {
        mgr.setIdleTimeout(context.browserIdleTimeout ?? 5)
        mgr.setViewport(context.browserViewportWidth ?? 1280, context.browserViewportHeight ?? 800)
      }
      const page = await mgr.getPageForUrl(url)
      const title = await page.title()

      let screenshot: string | undefined
      try {
        const buffer = await page.screenshot({ type: 'png', fullPage: false })
        screenshot = `data:image/png;base64,${buffer.toString('base64')}`
      } catch { /* 截图失败不影响主流程 */ }

      return {
        toolCallId: toolCall.id, toolName: 'browser_navigate',
        content: `已导航到：${url}\n页面标题：${title}`,
        success: true, displayType: 'text',
        screenshot,
        metadata: { url, title }
      }
    } catch (e) {
      return this.error(toolCall.id, `导航失败：${cleanBrowserError((e as Error).message)}`)
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'browser_navigate', content: '', success: false, error: msg }
  }
}
