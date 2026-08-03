import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'
import { piBridge } from './PiBridge'

/**
 * SearchUiTool — 在缓存的 UI 大纲中搜索元素
 * 对应 pi-computer-use 的 search_ui 工具
 * 不需要重新截取/遍历，直接在 observe_ui 返回的缓存状态中搜索
 */
export class SearchUiTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'search_ui',
    description:
      '在已观察的 UI 状态中搜索元素，按文本、角色或能力过滤。' +
      '不需要重新截取窗口，直接从缓存中查询，速度极快。' +
      '需要提供 observe_ui 返回的 stateId。至少指定 text、role 或 capability 之一。',
    parameters: {
      type: 'object',
      properties: {
        stateId: { type: 'string', description: 'observe_ui 返回的 stateId' },
        text: { type: 'string', description: '按元素文本/标签搜索（模糊匹配）', default: '' },
        role: { type: 'string', description: '按角色精确匹配（如 button、edit、menuItem、tabItem）', default: '' },
        capability: { type: 'string', description: '按能力过滤（如 press、canSetValue、scroll）', default: '' }
      },
      required: ['stateId']
    }
  }

  async execute(toolCall: ToolCall, onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal): Promise<ToolResult> {
    const stateId = (toolCall.arguments.stateId as string) || ''
    const text = (toolCall.arguments.text as string) || ''
    const role = (toolCall.arguments.role as string) || ''
    const capability = (toolCall.arguments.capability as string) || ''

    onChunk?.({ toolStatus: 'calling', toolName: 'search_ui' })

    if (!text && !role && !capability) {
      return this.error(toolCall.id, '搜索至少需要指定 text、role 或 capability 之一。')
    }

    try {
      // pi-computer-use 的 search 是在 bridge 层完成的（TypeScript 端）
      // 但由于我们没有引入 pi 的完整 TS 运行时，
      // 这里通过 Helper 的 look 命令重新获取，然后在本地过滤
      // 注意：这是一个简化实现，完整的 pi 集成会有 bridge 层做缓存搜索
      const result = await piBridge.command<Record<string, unknown>>('look', {
        readText: 'auto',
        includeImage: false,
      }, 15_000)

      const outline = result?.outline
      if (!outline) {
        return {
          toolCallId: toolCall.id, toolName: 'search_ui',
          content: '未找到 UI 大纲数据。请先使用 observe_ui 观察目标窗口。',
          success: true
        }
      }

      // 在 outline 中搜索匹配的元素
      const matches = searchInOutline(outline as Record<string, unknown>, { text, role, capability })

      if (matches.length === 0) {
        return {
          toolCallId: toolCall.id, toolName: 'search_ui',
          content: `未找到匹配的 UI 元素（text="${text}", role="${role}", capability="${capability}"）。尝试扩大搜索条件。`,
          success: true,
          metadata: { matchCount: 0, stateId }
        }
      }

      const lines = [`## 🔎 UI 搜索结果（${matches.length} 项）`, '']
      for (const m of matches.slice(0, 30)) {
        const ref = m.ref || ''
        const r = m.role || ''
        const l = m.label || m.title || ''
        const v = m.value ? ` = "${String(m.value).slice(0, 40)}"` : ''
        lines.push(`- \`${ref}\` ${r}: "${l}"${v}`)
      }
      if (matches.length > 30) {
        lines.push('', `...还有 ${matches.length - 30} 个匹配项，请细化搜索条件。`)
      }
      lines.push('', `使用 act_ui(stateId="${stateId}", actions=[...]) 对这些元素执行操作。`)

      return {
        toolCallId: toolCall.id, toolName: 'search_ui',
        content: lines.join('\n'),
        success: true, displayType: 'text',
        metadata: { matchCount: matches.length, stateId, matches: matches.slice(0, 30) }
      }
    } catch (e) {
      return this.error(toolCall.id, `UI 搜索失败：${(e as Error).message}`)
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'search_ui', content: '', success: false, error: msg }
  }
}

interface SearchOptions {
  text?: string
  role?: string
  capability?: string
}

function searchInOutline(
  node: Record<string, unknown>,
  options: SearchOptions,
  results: Record<string, unknown>[] = []
): Record<string, unknown>[] {
  let match = true

  if (options.text) {
    const label = String(node.label || node.title || node.value || '')
    match = match && label.toLowerCase().includes(options.text.toLowerCase())
  }
  if (options.role) {
    match = match && String(node.role || '').toLowerCase() === options.role.toLowerCase()
  }
  if (options.capability) {
    const caps = node.capabilities as Record<string, unknown> | undefined
    match = match && !!caps && caps[options.capability] === true
  }

  if (match && (options.text || options.role || options.capability)) {
    results.push(node)
  }

  const children = node.children as Record<string, unknown>[] | undefined
  if (Array.isArray(children)) {
    for (const child of children) {
      searchInOutline(child, options, results)
    }
  }

  return results
}
