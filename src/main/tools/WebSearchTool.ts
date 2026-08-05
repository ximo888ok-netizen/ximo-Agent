import type { Tool } from './Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

/**
 * WebSearchTool — 联网搜索工具
 *
 * 使用 DuckDuckGo HTML 搜索（无需 API Key），对结果抓取并提取正文。
 * 参考 wigolo 的多引擎搜索设计，简化到单引擎 + 可选内容抓取。
 */
export class WebSearchTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'web_search',
    description:
      '搜索互联网获取实时信息。用于查找最新资讯、技术文档、事实核查等。返回搜索结果列表，包含标题、URL、摘要。如需查看某个结果的完整内容，请使用 web_fetch 工具。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词或问题，使用简洁明确的词语'
        },
        maxResults: {
          type: 'number',
          description: '期望返回的最大结果数量，默认 5，最大 10',
          default: 5
        }
      },
      required: ['query']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    signal?: AbortSignal
  ): Promise<ToolResult> {
    const query = toolCall.arguments.query as string
    const maxResults = Math.min((toolCall.arguments.maxResults as number) || 5, 10)

    if (!query || typeof query !== 'string') {
      return {
        toolCallId: toolCall.id,
        toolName: 'web_search',
        content: '',
        success: false,
        error: '缺少搜索关键词（query 参数）'
      }
    }

    onChunk?.({ toolStatus: 'calling', toolName: 'web_search' })

    try {
      // DuckDuckGo HTML 搜索
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal
      })

      if (!response.ok) {
        return {
          toolCallId: toolCall.id,
          toolName: 'web_search',
          content: '',
          success: false,
          error: `搜索请求失败 (${response.status})`
        }
      }

      const html = await response.text()

      // 解析搜索结果
      const results = this.parseDuckDuckGoResults(html, maxResults)

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

      // 格式化输出
      const formatted = this.formatResults(query, results)
      return {
        toolCallId: toolCall.id,
        toolName: 'web_search',
        content: formatted,
        success: true,
        displayType: 'search-results',
        metadata: { query, results }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        return {
          toolCallId: toolCall.id,
          toolName: 'web_search',
          content: '',
          success: false,
          error: '搜索已取消'
        }
      }
      return {
        toolCallId: toolCall.id,
        toolName: 'web_search',
        content: '',
        success: false,
        error: `搜索出错：${(e as Error).message}`
      }
    }
  }

  /** 解析 DuckDuckGo HTML 搜索结果 */
  private parseDuckDuckGoResults(
    html: string,
    maxResults: number
  ): { title: string; url: string; snippet: string }[] {
    const results: { title: string; url: string; snippet: string }[] = []

    // DuckDuckGo HTML 搜索结果结构：
    // <a rel="nofollow" class="result__a" href="...">标题</a>
    // <a class="result__snippet">摘要</a>

    const linkRegex =
      /<a[^>]*rel="nofollow"[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
    const snippetRegex =
      /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi

    let linkMatch: RegExpExecArray | null
    const snippets: string[] = []

    // 先收集所有 snippet
    let snippetMatch: RegExpExecArray | null
    while ((snippetMatch = snippetRegex.exec(html)) !== null) {
      snippets.push(this.stripHtml(snippetMatch[1]))
    }

    let snippetIdx = 0
    while ((linkMatch = linkRegex.exec(html)) !== null && results.length < maxResults) {
      const url = this.cleanUrl(linkMatch[1])
      const title = this.stripHtml(linkMatch[2])
      const snippet = snippets[snippetIdx] || ''

      // 跳过空标题、广告、非 http 链接
      if (!title || !url.startsWith('http')) continue

      // 去重
      if (results.some((r) => r.url === url)) continue

      results.push({ title, url, snippet })
      snippetIdx++
    }

    return results
  }

  /** 清理 URL：去除 DuckDuckGo 的重定向包装 */
  private cleanUrl(raw: string): string {
    // DuckDuckGo 的链接格式：//duckduckgo.com/l/?uddg=URL_ENCODED&...
    const uddgMatch = raw.match(/uddg=([^&]+)/)
    if (uddgMatch) {
      return decodeURIComponent(uddgMatch[1])
    }
    // 去掉开头的 //
    if (raw.startsWith('//')) {
      return 'https:' + raw
    }
    return raw
  }

  /** 去除 HTML 标签 */
  private stripHtml(text: string): string {
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
      .trim()
  }

  /** 格式化输出 */
  private formatResults(
    query: string,
    results: { title: string; url: string; snippet: string }[]
  ): string {
    const lines = [`## 🔍 搜索结果："${query}"\n`]
    results.forEach((r, i) => {
      lines.push(`**${i + 1}. [${r.title}](${r.url})**`)
      if (r.snippet) lines.push(`   ${r.snippet}`)
      lines.push(`   🔗 ${r.url}`)
      lines.push('')
    })
    lines.push(`---`)
    lines.push(`共找到 ${results.length} 条结果。如需获取某个页面的详细内容，可以要求我使用网页抓取功能。`)
    return lines.join('\n')
  }
}
