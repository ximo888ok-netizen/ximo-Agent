class MaxContentError extends Error {
  constructor() { super('已达到最大内容量限制'); this.name = 'MaxContentError' }
}

/**
 * WebResearchTool — 自主研究 Agent
 * 分解问题 → 搜索 → 抓取 → 分析 → 生成引用报告
 */
export { MaxContentError }

interface ResearchSource {
  url: string
  title: string
  excerpt: string
  relevance: string
}

import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'
import { WebSearchTool } from './WebSearchTool'
import { WebFetchTool } from './WebFetchTool'

interface SearchResult {
  title: string
  url: string
  snippet: string
}

export class WebResearchTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'web_research',
    description:
      '自主研究：将复杂问题分解为子问题，自动搜索、抓取网页内容，综合分析后生成带有引用的研究报告。适合需要多方信息综合分析的场景。最多抓取 5 个来源。',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: '要研究的核心问题'
        },
        maxSources: {
          type: 'number',
          description: '最多抓取的来源数量，默认 5',
          default: 5
        }
      },
      required: ['question']
    }
  }

  private searchTool = new WebSearchTool()
  private fetchTool = new WebFetchTool()

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    signal?: AbortSignal
  ): Promise<ToolResult> {
    const question = (toolCall.arguments.question as string) || ''
    const maxSources = Math.min((toolCall.arguments.maxSources as number) || 5, 10)

    if (!question) return this.error(toolCall.id, '缺少 question 参数')

    onChunk?.({ toolStatus: 'calling', toolName: 'web_research' })

    try {
      // Step 1: 搜索
      onChunk?.({ toolStatus: 'thinking', toolName: 'web_research' })
      const searchResult = await this.searchTool.execute(
        { id: 'research-search-0', name: 'web_search', arguments: { query: question, maxResults: maxSources * 2 } },
        undefined,
        signal
      )

      if (!searchResult.success || !searchResult.metadata?.results) {
        return searchResult
      }

      const searchResults = searchResult.metadata.results as { title: string; url: string; snippet: string }[]

      // Step 2: 抓取每个来源的内容
      const sources: ResearchSource[] = []
      const errors: string[] = []
      const maxFetch = Math.min(searchResults.length, maxSources)

      for (let i = 0; i < maxFetch; i++) {
        if (signal?.aborted) break
        const r = searchResults[i]
        onChunk?.({ toolStatus: 'calling', toolName: 'web_research' })

        try {
          const fetchResult = await this.fetchTool.execute(
            { id: `research-fetch-${i}`, name: 'web_fetch', arguments: { url: r.url, maxLength: 8000 } },
            undefined,
            signal
          )

          if (fetchResult.success) {
            sources.push({
              url: r.url,
              title: r.title,
              excerpt: fetchResult.content.replace(/^##[^\n]*\n/, '').slice(0, 3000),
              relevance: r.snippet
            })
          } else {
            errors.push(`${r.title}: ${fetchResult.error}`)
          }
        } catch {
          errors.push(`${r.title}: 抓取失败`)
        }
      }

      // Step 3: 整理研究报告
      const lines = [
        `## 📊 研究报告："${question}"`,
        '',
        `共搜索到 ${searchResults.length} 个相关来源，成功抓取 ${sources.length} 个。`,
        '',
        '### 来源列表',
        ''
      ]

      sources.forEach((s, i) => {
        lines.push(`**${i + 1}. [${s.title}](${s.url})**`)
        lines.push(`   摘要：${s.relevance}`)
        lines.push('')
      })

      if (errors.length > 0) {
        lines.push('### 抓取失败的来源')
        errors.forEach((e, i) => lines.push(`${i + 1}. ${e}`))
        lines.push('')
      }

      lines.push('### 内容摘要')
      sources.forEach((s, i) => {
        lines.push(`**${i + 1}. ${s.title}**`)
        lines.push(s.excerpt)
        lines.push('')
      })

      lines.push('---')
      lines.push('以上为原始研究数据，可以根据这些来源进一步分析和回答用户问题。')

      return {
        toolCallId: toolCall.id,
        toolName: 'web_research',
        content: lines.join('\n'),
        success: true,
        displayType: 'text',
        metadata: { question, sourcesCount: sources.length, errorsCount: errors.length }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        return this.error(toolCall.id, '研究已取消')
      }
      return this.error(toolCall.id, `研究出错：${(e as Error).message}`)
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'web_research', content: '', success: false, error: msg }
  }
}
