import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'
import { BrowserManager } from './BrowserManager'
import { isEmbeddedBrowserActive, executeWebviewCommand } from './WebviewBridge'
import { cleanBrowserError } from './index'

export class BrowserExecuteJSTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'browser_execute_js',
    description: '在当前页面中执行 JavaScript 代码并获取返回值。适合批量提取数据或执行复杂 DOM 操作，用一次调用替代多步 browser_click/type。返回值会被 JSON.stringify 序列化。',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '要执行的 JavaScript 代码' }
      },
      required: ['code']
    }
  }

  async execute(toolCall: ToolCall, onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal): Promise<ToolResult> {
    const code = (toolCall.arguments.code as string) || ''
    if (!code) return this.error(toolCall.id, '缺少 code 参数')

    onChunk?.({ toolStatus: 'calling', toolName: 'browser_execute_js' })

    try {
      // 优先使用内嵌浏览器
      if (isEmbeddedBrowserActive()) {
        const result = await executeWebviewCommand('executeJS', { code }) as unknown
        const output = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)
        return {
          toolCallId: toolCall.id, toolName: 'browser_execute_js',
          content: `\`\`\`json\n${output.slice(0, 30000)}\n\`\`\``,
          success: true, displayType: 'code',
          metadata: { embedded: true }
        }
      }

      // 回退到 Playwright
      const page = await BrowserManager.getInstance().getPage()
      const result = await page.evaluate(`(() => { ${code} })()`)
      const output = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)
      return {
        toolCallId: toolCall.id, toolName: 'browser_execute_js',
        content: `\`\`\`json\n${output.slice(0, 30000)}\n\`\`\``,
        success: true, displayType: 'code',
        metadata: {}
      }
    } catch (e) {
      return this.error(toolCall.id, `JS 执行失败：${cleanBrowserError((e as Error).message)}`)
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'browser_execute_js', content: '', success: false, error: msg }
  }
}
