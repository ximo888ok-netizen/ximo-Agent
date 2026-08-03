import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk, ToolContext } from '@shared/types'
import type { BingEngine } from './SearchEngines/BingEngine'
import type { BaiduEngine } from './SearchEngines/BaiduEngine'
import type { DuckDuckGoEngine } from './SearchEngines/DuckDuckGoEngine'

interface SearchEngine {
  readonly name: string
  search(query: string, maxResults: number, signal?: AbortSignal): Promise<SearchResult[]>
}

interface SearchResult {
  title: string
  url: string
  snippet: string
  engine: string
}

/**
 * WebSearchTool — 轻量搜索
 * 默认只用 Bing 一个引擎，失败时降级到下一个引擎。
 * 一次调用 = 最多一次 HTTP 请求（除非主引擎失败才降级）。
 */
export class WebSearchTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'web_search',
    description:
      `搜索互联网获取实时信息。返回搜索结果列表（标题、URL、摘要）。
高效用法：用精准关键词搜索（如"2024年中国GDP增速"而非"中国经济怎么样"）。先阅读返回的 snippet 摘要判断相关性，只对最相关的 1-2 个结果用 web_fetch 抓取全文。避免反复搜索相似关键词。`,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词'
        },
        maxResults: {
          type: 'number',
          description: '返回结果数量，默认 5',
          default: 5
        }
      },
      required: ['query']
    }
  }

  /** 引擎优先级：Bing → Baidu → DuckDuckGo，只用第一个成功的 */
  private engines: SearchEngine[] | null = null

  /** 懒初始化搜索引擎实例（首次 execute 时才创建） */
  private async getEngines(): Promise<SearchEngine[]> {
    if (this.engines) return this.engines
    const [{ BingEngine }, { BaiduEngine }, { DuckDuckGoEngine }] = await Promise.all([
      import('./SearchEngines/BingEngine'),
      import('./SearchEngines/BaiduEngine'),
      import('./SearchEngines/DuckDuckGoEngine')
    ])
    this.engines = [new BingEngine(), new BaiduEngine(), new DuckDuckGoEngine()]
    return this.engines
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
    context?: ToolContext
  ): Promise<ToolResult> {
    const query = String(toolCall.arguments.query ?? '').trim()
    const maxResults = Math.min((toolCall.arguments.maxResults as number) || (context?.searchResultsCount ?? 5), 10)
    const preferredEngine = context?.defaultSearchEngine ?? 'bing'

    if (!query) {
      return this.error(toolCall.id, '缺少搜索关键词（query 参数）')
    }

    onChunk?.({ toolStatus: 'calling', toolName: 'web_search' })

    try {
      let results: SearchResult[] = []

      // 逐个尝试引擎，第一个有结果就用，不重复搜索
      const engines = await this.getEngines()
      // 按用户偏好排序引擎
      const sortedEngines = [...engines].sort((a, b) => {
        const aName = a.constructor.name.toLowerCase().replace('engine', '')
        const bName = b.constructor.name.toLowerCase().replace('engine', '')
        if (aName === preferredEngine) return -1
        if (bName === preferredEngine) return 1
        return 0
      })
      for (const engine of sortedEngines) {
        if (signal?.aborted) break
        try {
          results = await engine.search(query, maxResults, signal)
        } catch {
          results = []
        }
        if (results.length > 0) break
      }

      if (results.length === 0) {
        return {
          toolCallId: toolCall.id,
          toolName: 'web_search',
          content: `未找到与 "${query}" 相关的搜索结果。请尝试更换关键词。`,
          success: true,
          displayType: 'search-results',
          metadata: { query, results: [] }
        }
      }

      const sliced = results.slice(0, maxResults)
      const formatted = this.formatResults(query, sliced)

      return {
        toolCallId: toolCall.id,
        toolName: 'web_search',
        content: formatted,
        success: true,
        displayType: 'search-results',
        metadata: { query, results: sliced }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        return this.error(toolCall.id, '搜索已取消')
      }
      return this.error(toolCall.id, `搜索出错：${(e as Error).message}`)
    }
  }

  private formatResults(query: string, results: SearchResult[]): string {
    const lines = [`## 🔍 搜索结果："${query}"\n`]
    results.forEach((r, i) => {
      lines.push(`**${i + 1}. [${r.title}](${r.url})**`)
      if (r.snippet) lines.push(`   ${r.snippet}`)
      lines.push('')
    })
    lines.push(`---`)
    lines.push(`共 ${results.length} 条结果。如需查看详情，可以用 web_fetch 抓取具体网页。`)
    return lines.join('\n')
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'web_search', content: '', success: false, error: msg }
  }
}
