import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'
import { getCacheManager } from './WebCacheManager'

/**
 * WebCacheTool — 本地缓存查询与管理
 */
export class WebCacheTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'web_cache',
    description:
      '查询或管理本地缓存的网页数据。支持关键词搜索已缓存的页面内容、查看缓存统计信息、清除缓存。每当你抓取过网页，内容都会自动缓存，下次查询更快。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '操作：search（搜索）、stats（统计）、clear（清空）',
          enum: ['search', 'stats', 'clear'],
          default: 'search'
        },
        keyword: {
          type: 'string',
          description: '搜索关键词（仅 search 操作需要）'
        },
        maxResults: {
          type: 'number',
          description: '最大结果数，默认 10',
          default: 10
        }
      },
      required: []
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    _signal?: AbortSignal
  ): Promise<ToolResult> {
    const action = (toolCall.arguments.action as string) || 'search'
    const keyword = (toolCall.arguments.keyword as string) || ''
    const maxResults = (toolCall.arguments.maxResults as number) || 10

    onChunk?.({ toolStatus: 'calling', toolName: 'web_cache' })

    const cache = getCacheManager()

    switch (action) {
      case 'stats': {
        const stats = cache.stats()
        const created = stats.newest ? new Date(/* estimated from entry */).toISOString() : '-'
        return {
          toolCallId: toolCall.id,
          toolName: 'web_cache',
          content: `## 📦 缓存统计\n- 总条目：${stats.total}\n- 总大小：${stats.totalSizeKB} KB\n- 最新：${stats.newest || '-'}\n- 最旧：${stats.oldest || '-'}`,
          success: true,
          displayType: 'text',
          metadata: stats
        }
      }

      case 'clear': {
        const count = await cache.clear()
        return {
          toolCallId: toolCall.id,
          toolName: 'web_cache',
          content: `已清除 ${count} 条缓存。`,
          success: true,
          displayType: 'text',
          metadata: { clearedCount: count }
        }
      }

      case 'search':
      default: {
        if (!keyword) {
          return this.error(toolCall.id, '搜索需要提供 keyword 参数')
        }
        const results = cache.search(keyword, maxResults)
        if (results.length === 0) {
          return {
            toolCallId: toolCall.id,
            toolName: 'web_cache',
            content: `未在缓存中找到匹配 "${keyword}" 的内容。`,
            success: true,
            metadata: { keyword, count: 0 }
          }
        }

        const lines = [`## 💾 缓存搜索结果："${keyword}"`, '']
        results.forEach((r, i) => {
          const date = new Date(r.fetchedAt).toLocaleString('zh-CN')
          const size = r.sizeBytes > 1024 ? `${(r.sizeBytes / 1024).toFixed(1)}KB` : `${r.sizeBytes}B`
          lines.push(`**${i + 1}. [${r.title || r.url}](${r.url})**`)
          lines.push(`   缓存时间：${date} | 大小：${size}`)
          lines.push(`   内容预览：${r.content.slice(0, 150)}...`)
          lines.push('')
        })
        return {
          toolCallId: toolCall.id,
          toolName: 'web_cache',
          content: lines.join('\n'),
          success: true,
          displayType: 'search-results',
          metadata: { keyword, count: results.length }
        }
      }
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'web_cache', content: '', success: false, error: msg }
  }
}
