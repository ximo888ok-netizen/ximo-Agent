import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk, ToolContext } from '@shared/types'

/**
 * WebFetchTool — 网页内容抓取
 * 支持自动降级：HTTP → headless browser（待浏览器模块实现）
 * 使用 cheerio 解析 HTML，turndown 转 Markdown
 */
export class WebFetchTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'web_fetch',
    description:
      `抓取单个网页内容并转为干净的 Markdown。自动移除广告、导航等无关元素。
高效用法：传入 maxLength=3000 先快速浏览，确认内容相关后再加大。一次任务最多抓取 1-2 个页面，不要批量抓取所有搜索结果。`,
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: '要抓取的网页 URL'
        },
        maxLength: {
          type: 'number',
          description: '返回内容的最大字符数，默认 5000，最大 50000。快速浏览建议设 3000',
          default: 5000
        }
      },
      required: ['url']
    }
  }

async execute(
toolCall: ToolCall,
onChunk?: (chunk: StreamChunk) => void,
signal?: AbortSignal,
context?: ToolContext
): Promise<ToolResult> {
const url = (toolCall.arguments.url as string) || ''
const maxLength = Math.min((toolCall.arguments.maxLength as number) || (context?.webFetchMaxLength ?? 5000), 50000)

    if (!url) return this.error(toolCall.id, '缺少 url 参数')
    if (!url.startsWith('http')) return this.error(toolCall.id, 'URL 必须以 http:// 或 https:// 开头')

    onChunk?.({ toolStatus: 'calling', toolName: 'web_fetch' })

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        },
        signal,
        redirect: 'follow'
      })

      if (!response.ok) {
        return this.error(toolCall.id, `抓取失败：HTTP ${response.status} ${response.statusText}`)
      }

      const contentType = response.headers.get('content-type') || ''

      // JSON 响应直接返回
      if (contentType.includes('application/json')) {
        const json = await response.json()
        return {
          toolCallId: toolCall.id,
          toolName: 'web_fetch',
          content: `**URL**: ${url}\n\`\`\`json\n${JSON.stringify(json, null, 2).slice(0, maxLength)}\n\`\`\``,
          success: true,
          displayType: 'code',
          metadata: { url, contentType: 'json' }
        }
      }

      const html = await response.text()
      const markdown = await this.htmlToMarkdown(html, url)

      const truncated = markdown.length > maxLength
        ? markdown.slice(0, maxLength) + `\n\n...(内容被截断，共 ${markdown.length} 字符)`
        : markdown

      const title = this.extractTitle(html) || url

      return {
        toolCallId: toolCall.id,
        toolName: 'web_fetch',
        content: `## 📄 ${title}\n**URL**: ${url}\n\n${truncated}`,
        success: true,
        displayType: 'text',
        metadata: { url, title, length: markdown.length, truncated: markdown.length > maxLength }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        return this.error(toolCall.id, '抓取已取消')
      }
      return this.error(toolCall.id, `抓取出错：${(e as Error).message}`)
    }
  }

  private async htmlToMarkdown(html: string, url: string): Promise<string> {
    try {
      // 尝试用 cheerio 提取正文
      const cheerio = await import('cheerio')
      const $ = cheerio.load(html)

      // 移除非内容元素
      $('script, style, nav, footer, header, aside, iframe, noscript, .ad, .ads, .sidebar, .nav, .menu, .footer, .header').remove()

      // 优先提取 main/article
      const main = $('main').text() || $('article').text() || $('body').text()
      if (main && main.trim().length > 200) {
        return this.cleanText(main)
      }

      return this.cleanText(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
    } catch {
      // 降级：直接去标签
      return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    }
  }

  private cleanText(text: string): string {
    return text
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{3,}/g, '  ')
      .trim()
  }

  private extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    if (match) {
      return match[1].replace(/<[^>]*>/g, '').trim()
    }
    return ''
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'web_fetch', content: '', success: false, error: msg }
  }
}
