import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

/**
 * NetworkCaptureTool — 网络请求捕获
 * 在浏览器页面中监听并记录所有 HTTP 请求/响应
 */
export class NetworkCaptureTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'network_capture',
    description: '捕获浏览器页面中的 HTTP 请求/响应。返回捕获的请求列表（URL、方法、状态码、Content-Type）。用于分析网站 API 调用、接口逆向等场景。需要先通过 browser_navigate 打开目标页面。',
    parameters: {
      type: 'object',
      properties: {
        urlFilter: { type: 'string', description: 'URL 过滤关键词，只返回匹配的请求', default: '' },
        methodFilter: { type: 'string', description: 'HTTP 方法过滤（GET/POST/PUT/DELETE），默认全部', default: '' },
        maxResults: { type: 'number', description: '最多返回请求数，默认 20', default: 20 }
      },
      required: []
    }
  }

  // 显式构造函数确保类类型可被识别
  constructor() {
    // noop
  }

  // 静态存储捕获的请求
  static requests: Array<{ url: string; method: string; status: number; contentType: string; timestamp: number; requestHeaders?: Record<string, string>; responseHeaders?: Record<string, string> }> = []

  static addRequest(req: { url: string; method: string; status: number; contentType: string; timestamp: number; requestHeaders?: Record<string, string>; responseHeaders?: Record<string, string> }): void {
    NetworkCaptureTool.requests.unshift(req)
    if (NetworkCaptureTool.requests.length > 500) NetworkCaptureTool.requests = NetworkCaptureTool.requests.slice(0, 500)
  }

  static clearRequests(): void { NetworkCaptureTool.requests = [] }

  async execute(toolCall: ToolCall, onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal): Promise<ToolResult> {
    const urlFilter = ((toolCall.arguments.urlFilter as string) || '').toLowerCase()
    const methodFilter = ((toolCall.arguments.methodFilter as string) || '').toUpperCase()
    const maxResults = Math.min((toolCall.arguments.maxResults as number) || 20, 100)
    onChunk?.({ toolStatus: 'calling', toolName: 'network_capture' })

    let requests = NetworkCaptureTool.requests
    if (urlFilter) requests = requests.filter((r) => r.url.toLowerCase().includes(urlFilter))
    if (methodFilter) requests = requests.filter((r) => r.method.toUpperCase() === methodFilter)
    requests = requests.slice(0, maxResults)

    if (requests.length === 0) {
      return { toolCallId: toolCall.id, toolName: 'network_capture', content: '暂无捕获的请求。请先用 browser_navigate 打开目标页面，让页面加载完成后再查看。', success: true, metadata: { count: 0 } }
    }

    const lines = ['## 📡 网络请求捕获', '']
    requests.forEach((r, i) => {
      const statusEmoji = r.status < 300 ? '✅' : r.status < 400 ? '↪️' : '❌'
      lines.push(`**${i + 1}.** ${statusEmoji} \`${r.method}\` ${r.url.slice(0, 120)}`)
      lines.push(`   状态码: ${r.status} | 类型: ${r.contentType}`)
    })

    return { toolCallId: toolCall.id, toolName: 'network_capture', content: lines.join('\n'), success: true, displayType: 'text', metadata: { count: requests.length } }
  }
}
