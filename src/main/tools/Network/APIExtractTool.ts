import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

/**
 * APIExtractTool — API 端点自动提取
 * 从捕获的网络请求中识别 API 端点
 */
export class APIExtractTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'api_extract',
    description: '从捕获的网络请求中自动识别和提取 API 端点。通过 URL 模式匹配和 Content-Type 分析，提取所有可能的 API 接口。用于快速分析网站的 API 调用结构。',
    parameters: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: '过滤的基础 URL，如 "api.example.com"', default: '' }
      },
      required: []
    }
  }

  async execute(toolCall: ToolCall, onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal): Promise<ToolResult> {
    const baseUrl = ((toolCall.arguments.baseUrl as string) || '').toLowerCase()
    onChunk?.({ toolStatus: 'calling', toolName: 'api_extract' })

    const { NetworkCaptureTool } = await import('./NetworkCaptureTool')
    let requests = NetworkCaptureTool.requests

    // 过滤 API 请求（JSON 响应、api 路径等）
    requests = requests.filter((r) => {
      const isApi = r.url.includes('/api/') || r.url.includes('/v1/') || r.url.includes('/v2/') || r.url.includes('/graphql') || r.contentType.includes('json')
      if (baseUrl) return isApi && r.url.toLowerCase().includes(baseUrl)
      return isApi
    })

    // 按 endpoint 分组去重
    const endpoints = new Map<string, { methods: Set<string>; statuses: number[]; count: number }>()
    requests.forEach((r) => {
      try {
        const parsed = new URL(r.url)
        const endpoint = `${parsed.hostname}${parsed.pathname}`
        if (!endpoints.has(endpoint)) endpoints.set(endpoint, { methods: new Set(), statuses: [], count: 0 })
        const ep = endpoints.get(endpoint)!
        ep.methods.add(r.method)
        ep.statuses.push(r.status)
        ep.count++
      } catch { /* skip invalid */ }
    })

    if (endpoints.size === 0) {
      return { toolCallId: toolCall.id, toolName: 'api_extract', content: '未发现 API 端点。请先用 browser_navigate 打开目标页面并进行交互操作，然后再查看。', success: true, metadata: { count: 0 } }
    }

    const lines = ['## 🔌 API 端点分析', '']
    const sorted = [...endpoints.entries()].sort((a, b) => b[1].count - a[1].count)

    sorted.slice(0, 30).forEach(([endpoint, info]) => {
      const avgStatus = Math.round(info.statuses.reduce((a, b) => a + b, 0) / info.statuses.length)
      const methods = [...info.methods].join(', ')
      lines.push(`- \`${methods}\` ${endpoint} (${info.count}次, 平均状态码: ${avgStatus})`)
    })

    return { toolCallId: toolCall.id, toolName: 'api_extract', content: lines.join('\n'), success: true, displayType: 'text', metadata: { count: endpoints.size } }
  }
}
