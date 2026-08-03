import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

/**
 * NetworkReplayTool — 请求重放/修改
 * 通过 evaluate 发起 fetch 请求来重放已捕获的请求
 */
export class NetworkReplayTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'network_replay',
    description: '重放已捕获的 HTTP 请求（支持修改参数后重发）。用于测试 API 接口、验证请求参数等。在浏览器页面中通过 fetch 发起。',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '要重放的 URL' },
        method: { type: 'string', description: 'HTTP 方法，默认 GET', default: 'GET' },
        body: { type: 'string', description: '请求体（JSON 字符串），仅 POST/PUT 需要', default: '' },
        headers: { type: 'string', description: '请求头（JSON 格式），如 {"Content-Type":"application/json"}', default: '' }
      },
      required: ['url']
    }
  }

  async execute(toolCall: ToolCall, onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal): Promise<ToolResult> {
    const url = toolCall.arguments.url as string
    const method = ((toolCall.arguments.method as string) || 'GET').toUpperCase()
    const body = (toolCall.arguments.body as string) || ''
    const headersStr = (toolCall.arguments.headers as string) || '{}'
    if (!url) return { toolCallId: toolCall.id, toolName: 'network_replay', content: '', success: false, error: '缺少 url 参数' }
    onChunk?.({ toolStatus: 'calling', toolName: 'network_replay' })

    try {
      let headers: Record<string, string> = {}
      try { headers = JSON.parse(headersStr) } catch { headers = { 'Content-Type': 'application/json' } }

      const { BrowserManager } = await import('@main/tools/Browser/BrowserManager')
      const page = await BrowserManager.getInstance().getPage()

      const evalCode = `
        (async() => {
          const opts = { method: '${method}', headers: ${JSON.stringify(headers)} };
          ${body ? `opts.body = ${JSON.stringify(body)};` : ''}
          try {
            const resp = await fetch('${url}', opts);
            const text = await resp.text();
            return JSON.stringify({ status: resp.status, statusText: resp.statusText, body: text.slice(0, 5000), headers: Object.fromEntries(resp.headers) });
          } catch(e) {
            return JSON.stringify({ error: e.message });
          }
        })()
      `

      const result = await page.evaluate(evalCode)
      const parsed = JSON.parse(result as string)

      if (parsed.error) {
        return { toolCallId: toolCall.id, toolName: 'network_replay', content: `请求重放失败：${parsed.error}`, success: false, error: parsed.error }
      }

      return {
        toolCallId: toolCall.id, toolName: 'network_replay',
        content: `## 🔄 请求重放结果\n\n**${method}** ${url}\n\n**响应状态**：${parsed.status} ${parsed.statusText}\n\n**响应体**：\n\`\`\`json\n${parsed.body.slice(0, 10000)}\n\`\`\``,
        success: true, displayType: 'code',
        metadata: { url, method, status: parsed.status }
      }
    } catch (e) {
      return { toolCallId: toolCall.id, toolName: 'network_replay', content: '', success: false, error: `请求重放失败：${(e as Error).message}。请确认已打开目标页面。` }
    }
  }
}
