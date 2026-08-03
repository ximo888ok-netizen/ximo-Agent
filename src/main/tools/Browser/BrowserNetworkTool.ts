import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'
import { BrowserManager } from './BrowserManager'
import { isEmbeddedBrowserActive, executeWebviewCommand } from './WebviewBridge'
import { cleanBrowserError } from './index'

interface CapturedRequest {
  url: string
  method: string
  status: number
  type: string
  timestamp: number
}

export class BrowserNetworkTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'browser_network_monitor',
    description: '监控浏览器页面的网络请求。返回最近的 XHR/Fetch 请求列表（URL、方法、状态码、资源类型）。用于分析网站 API 调用。',
    parameters: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'URL 过滤关键词，只返回匹配的请求', default: '' },
        maxResults: { type: 'number', description: '最多返回请求数，默认 30', default: 30 }
      },
      required: []
    }
  }

  // 存储捕获的请求
  private static capturedRequests: CapturedRequest[] = []

  static addRequest(req: CapturedRequest): void {
    BrowserNetworkTool.capturedRequests.unshift(req)
    if (BrowserNetworkTool.capturedRequests.length > 200) {
      BrowserNetworkTool.capturedRequests = BrowserNetworkTool.capturedRequests.slice(0, 200)
    }
  }

  static clearRequests(): void {
    BrowserNetworkTool.capturedRequests = []
  }

  async execute(toolCall: ToolCall, onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal): Promise<ToolResult> {
    const filter = (toolCall.arguments.filter as string) || ''
    const maxResults = Math.min((toolCall.arguments.maxResults as number) || 30, 100)

    onChunk?.({ toolStatus: 'calling', toolName: 'browser_network_monitor' })

    try {
      // 优先使用内嵌浏览器 — 返回已抓取的请求
      if (isEmbeddedBrowserActive()) {
        const requests = await executeWebviewCommand('getNetwork', {}) as CapturedRequest[]
        let filtered = requests || []
        if (filter) {
          const filterLower = filter.toLowerCase()
          filtered = filtered.filter((r) => r.url.toLowerCase().includes(filterLower))
        }
        filtered = filtered.slice(0, maxResults)

        if (filtered.length === 0) {
          return {
            toolCallId: toolCall.id, toolName: 'browser_network_monitor',
            content: '内嵌浏览器目前没有捕获到网络请求。',
            success: true, metadata: { count: 0, embedded: true }
          }
        }

        const lines = ['## 🌐 内嵌浏览器网络请求', '']
        for (const r of filtered) {
          lines.push(`- \`${r.method}\` ${r.url.slice(0, 120)}`)
        }
        return {
          toolCallId: toolCall.id, toolName: 'browser_network_monitor',
          content: lines.join('\n'),
          success: true, displayType: 'text',
          metadata: { count: filtered.length, filter, embedded: true }
        }
      }

      // 回退到 Playwright
      const page = await BrowserManager.getInstance().getPage()

      // 设置路由拦截（仅设置一次）
      try {
        await page.route('**/*', async (route) => {
          const req = route.request()
          BrowserNetworkTool.addRequest({
            url: req.url(),
            method: req.method(),
            status: 200,
            type: req.resourceType(),
            timestamp: Date.now()
          })
          await route.continue()
        })
      } catch {
        // 已设置过路由
      }

      await page.waitForTimeout(1000) // 等待 1 秒收集请求

      let requests = BrowserNetworkTool.capturedRequests
      if (filter) {
        const filterLower = filter.toLowerCase()
        requests = requests.filter((r) => r.url.toLowerCase().includes(filterLower))
      }

      requests = requests.slice(0, maxResults)

      if (requests.length === 0) {
        return {
          toolCallId: toolCall.id, toolName: 'browser_network_monitor',
          content: '目前没有捕获到网络请求。请先导航到目标页面，等待页面加载完成后再查看。',
          success: true, metadata: { count: 0 }
        }
      }

      const lines = ['## 🌐 网络请求监控', '']
      const byType = new Map<string, CapturedRequest[]>()
      for (const r of requests) {
        const t = r.type || 'other'
        if (!byType.has(t)) byType.set(t, [])
        byType.get(t)!.push(r)
      }

      for (const [type, reqs] of byType) {
        lines.push(`**${type.toUpperCase()} (${reqs.length})：**`)
        for (const r of reqs) {
          lines.push(`- \`${r.method}\` ${r.url.slice(0, 120)}`)
        }
        lines.push('')
      }

      return {
        toolCallId: toolCall.id, toolName: 'browser_network_monitor',
        content: lines.join('\n'),
        success: true, displayType: 'text',
        metadata: { count: requests.length, filter }
      }
    } catch (e) {
      return this.error(toolCall.id, `网络监控失败：${cleanBrowserError((e as Error).message)}`)
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'browser_network_monitor', content: '', success: false, error: msg }
  }
}

export type { CapturedRequest }
