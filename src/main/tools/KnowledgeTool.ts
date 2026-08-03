import type { Tool } from './Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk, ToolContext } from '@shared/types'
import { addKnowledge, searchKnowledge, listKnowledge, updateKnowledge, deleteKnowledge } from '@main/KnowledgeStore'
import type { Mode } from '@shared/types'

/**
 * KnowledgeTool — 知识库读写工具
 *
 * 让 Agent 能向当前模式的知识库中添加、搜索、浏览、更新、删除知识条目。
 * 搜索基于 BM25 全文检索引擎（Orama），支持分页。
 * 每个模式（office/coding/design）的知识库相互独立。
 */
export class KnowledgeTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'knowledge',
    description:
      '管理当前模式的知识库。支持添加、搜索、浏览、更新、删除知识条目。搜索基于 BM25 全文检索，支持分页。\n\n' +
      '## 何时使用\n' +
      '- 用户分享了重要知识、经验、技巧 → 添加到知识库\n' +
      '- 需要查找之前记录的知识 → 搜索\n' +
      '- 发现知识过时或有误 → 更新或删除\n' +
      '- 完成任务后总结经验 → 添加为知识\n\n' +
      '## actions\n' +
      '- add: 添加知识条目（需 title + content，可选 tags/source）\n' +
      '- search: 全文搜索（需 query，返回按相关性排序的结果 + 分页）\n' +
      '- list: 分页浏览全部条目（按 updatedAt 降序）\n' +
      '- update: 更新条目（需 id + 要修改的字段）\n' +
      '- delete: 删除条目（需 id）',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'search', 'list', 'update', 'delete'],
          description: '要执行的操作'
        },
        title: { type: 'string', description: 'add/update: 知识标题（简明扼要）' },
        content: { type: 'string', description: 'add/update: 知识正文（详细内容）' },
        tags: { type: 'array', description: 'add/update: 标签数组（如 ["react","性能"]）' },
        source: { type: 'string', description: 'add/update: 来源（如 "用户经验"、"官方文档"）' },
        query: { type: 'string', description: 'search: 搜索关键词' },
        page: { type: 'number', description: 'search/list: 页码（默认 1）' },
        page_size: { type: 'number', description: 'search/list: 每页条数（默认 search=10, list=20）' },
        id: { type: 'string', description: 'update/delete: 条目 ID' }
      },
      required: ['action']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    _signal?: AbortSignal,
    context?: ToolContext
  ): Promise<ToolResult> {
    const action = toolCall.arguments.action as string
    const mode = (context?.mode ?? 'office') as Mode
    onChunk?.({ toolStatus: 'calling', toolName: 'knowledge' })

    try {
      switch (action) {
        case 'add':
          return await this.handleAdd(toolCall, mode)
        case 'search':
          return await this.handleSearch(toolCall, mode)
        case 'list':
          return await this.handleList(toolCall, mode)
        case 'update':
          return await this.handleUpdate(toolCall, mode)
        case 'delete':
          return await this.handleDelete(toolCall, mode)
        default:
          return this.error(toolCall.id, `未知 action: ${action}`)
      }
    } catch (e) {
      return this.error(toolCall.id, `知识库操作失败: ${(e as Error).message}`)
    }
  }

  private async handleAdd(toolCall: ToolCall, mode: Mode): Promise<ToolResult> {
    const title = (toolCall.arguments.title as string) || ''
    const content = (toolCall.arguments.content as string) || ''
    if (!title) return this.error(toolCall.id, 'title 不能为空')
    if (!content) return this.error(toolCall.id, 'content 不能为空')

    const entry = await addKnowledge(mode, {
      title,
      content,
      tags: (toolCall.arguments.tags as string[]) ?? [],
      source: (toolCall.arguments.source as string) ?? 'agent'
    })

    return {
      toolCallId: toolCall.id,
      toolName: 'knowledge',
      content: `✅ 知识条目已添加。\n\nID: ${entry.id}\n标题: ${entry.title}\n标签: ${entry.tags.join(', ') || '无'}\n来源: ${entry.source}\n\n(${mode} 模式知识库)`,
      success: true,
      displayType: 'text'
    }
  }

  private async handleSearch(toolCall: ToolCall, mode: Mode): Promise<ToolResult> {
    const query = (toolCall.arguments.query as string) || ''
    if (!query) return this.error(toolCall.id, 'query 不能为空')

    const page = (toolCall.arguments.page as number) ?? 1
    const pageSize = (toolCall.arguments.page_size as number) ?? 10
    const result = await searchKnowledge(mode, query, page, pageSize)

    if (result.results.length === 0) {
      return {
        toolCallId: toolCall.id,
        toolName: 'knowledge',
        content: `未找到与 "${query}" 相关的知识条目。`,
        success: true,
        displayType: 'text'
      }
    }

    const lines = result.results.map((r, i) => {
      const tags = r.tags.length > 0 ? ` [${r.tags.join(', ')}]` : ''
      return `### ${i + 1}. ${r.title}${tags}\n**ID**: ${r.id} | **相关性**: ${r.score.toFixed(2)} | **来源**: ${r.source}\n\n${r.content}`
    })

    return {
      toolCallId: toolCall.id,
      toolName: 'knowledge',
      content: `🔍 搜索 "${query}" — 共 ${result.total} 条结果（第 ${result.page}/${result.totalPages} 页）\n\n${lines.join('\n\n---\n\n')}`,
      success: true,
      displayType: 'text'
    }
  }

  private async handleList(toolCall: ToolCall, mode: Mode): Promise<ToolResult> {
    const page = (toolCall.arguments.page as number) ?? 1
    const pageSize = (toolCall.arguments.page_size as number) ?? 20
    const result = await listKnowledge(mode, page, pageSize)

    if (result.items.length === 0) {
      return {
        toolCallId: toolCall.id,
        toolName: 'knowledge',
        content: `知识库为空。使用 knowledge(action="add") 添加知识条目。`,
        success: true,
        displayType: 'text'
      }
    }

    const lines = result.items.map((item, i) => {
      const tags = item.tags.length > 0 ? ` [${item.tags.join(', ')}]` : ''
      const preview = item.content.slice(0, 80) + (item.content.length > 80 ? '...' : '')
      return `${i + 1}. **${item.title}**${tags}\n   ID: ${item.id} | 来源: ${item.source} | 更新: ${new Date(item.updatedAt).toLocaleString('zh-CN')}\n   ${preview}`
    })

    return {
      toolCallId: toolCall.id,
      toolName: 'knowledge',
      content: `📚 ${mode} 知识库 — 共 ${result.total} 条（第 ${result.page}/${result.totalPages} 页）\n\n${lines.join('\n\n')}`,
      success: true,
      displayType: 'text'
    }
  }

  private async handleUpdate(toolCall: ToolCall, mode: Mode): Promise<ToolResult> {
    const id = (toolCall.arguments.id as string) || ''
    if (!id) return this.error(toolCall.id, 'id 不能为空')

    const updates: Record<string, unknown> = {}
    if (toolCall.arguments.title) updates.title = toolCall.arguments.title
    if (toolCall.arguments.content) updates.content = toolCall.arguments.content
    if (toolCall.arguments.tags) updates.tags = toolCall.arguments.tags
    if (toolCall.arguments.source) updates.source = toolCall.arguments.source

    if (Object.keys(updates).length === 0) {
      return this.error(toolCall.id, '至少提供一项要更新的字段（title/content/tags/source）')
    }

    const updated = await updateKnowledge(mode, id, updates as { title?: string; content?: string; tags?: string[]; source?: string })
    if (!updated) return this.error(toolCall.id, `未找到 ID 为 ${id} 的条目`)

    return {
      toolCallId: toolCall.id,
      toolName: 'knowledge',
      content: `✅ 知识条目已更新。\n\nID: ${updated.id}\n标题: ${updated.title}`,
      success: true,
      displayType: 'text'
    }
  }

  private async handleDelete(toolCall: ToolCall, mode: Mode): Promise<ToolResult> {
    const id = (toolCall.arguments.id as string) || ''
    if (!id) return this.error(toolCall.id, 'id 不能为空')

    const ok = await deleteKnowledge(mode, id)
    if (!ok) return this.error(toolCall.id, `未找到 ID 为 ${id} 的条目`)

    return {
      toolCallId: toolCall.id,
      toolName: 'knowledge',
      content: `✅ 知识条目 ${id} 已删除。`,
      success: true,
      displayType: 'text'
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'knowledge', content: '', success: false, error: msg }
  }
}
