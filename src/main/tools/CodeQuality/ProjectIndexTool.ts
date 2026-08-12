import { readFile } from 'fs/promises'
import { resolve, relative, extname } from 'path'
import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'
import { extractSymbols, collectSourceFiles, type FileSymbolEntry } from './project-index-symbols'

/** 索引缓存（按项目路径），避免重复扫描 */
const indexCache = new Map<string, { entries: FileSymbolEntry[]; builtAt: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 分钟

/**
 * ProjectIndexTool — 项目级语义索引
 * 扫描项目源码文件，提取每个文件的导出符号（函数、类、接口等），
 * 生成结构化索引供 AI 快速定位代码，避免逐文件扫描。
 */
export class ProjectIndexTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'project_index',
    description:
      '构建或查询项目级语义索引。扫描所有源码文件，提取导出符号（函数、类、接口、类型），让 AI 快速定位代码位置而无需逐文件读取。支持按符号名搜索和按文件浏览。索引结果缓存 5 分钟。',
    parameters: {
      type: 'object',
      properties: {
        dirPath: {
          type: 'string',
          description: '项目根目录路径',
          default: '.'
        },
        query: {
          type: 'string',
          description: '搜索关键词（符号名或文件名），留空则返回完整索引摘要'
        },
        refresh: {
          type: 'boolean',
          description: '是否强制刷新缓存重新扫描',
          default: false
        }
      },
      required: []
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    signal?: AbortSignal
  ): Promise<ToolResult> {
    const dirPath = (toolCall.arguments.dirPath as string) || '.'
    const query = (toolCall.arguments.query as string) || ''
    const refresh = (toolCall.arguments.refresh as boolean) ?? false

    const normalized = resolve(dirPath)

    onChunk?.({ toolStatus: 'calling', toolName: 'project_index' })

    try {
      //321      // 检查缓存
      let cached = indexCache.get(normalized)
      if (refresh || !cached || Date.now() - cached.builtAt > CACHE_TTL) {
        const files = await collectSourceFiles(normalized, signal)
        const entries: FileSymbolEntry[] = []

        for (const filePath of files) {
          if (signal?.aborted) break
          try {
            const content = await readFile(filePath, 'utf-8')
            const ext = extname(filePath)
            const relPath = relative(normalized, filePath)
            const symbols = extractSymbols(content, ext)
            entries.push({
              path: relPath,
              ext,
              ...symbols
            })
          } catch {
            // 读取失败跳过
          }
        }

        cached = { entries, builtAt: Date.now() }
        indexCache.set(normalized, cached)
      }

      const entries = cached.entries

      // 有查询时进行搜索
      if (query.trim()) {
        const lowerQuery = query.toLowerCase()
        const matches = entries.filter(e => {
          return (
            e.path.toLowerCase().includes(lowerQuery) ||
            e.exports.some(s => s.toLowerCase().includes(lowerQuery)) ||
            e.functions.some(s => s.toLowerCase().includes(lowerQuery)) ||
            e.classes.some(s => s.toLowerCase().includes(lowerQuery)) ||
            e.interfaces.some(s => s.toLowerCase().includes(lowerQuery))
          )
        })

        const lines = [`## 🔍 索引搜索结果：\`${query}\`（共 ${matches.length} 个匹配）`, '']

        for (const m of matches.slice(0, 30)) {
          const symbols: string[] = []
          if (m.exports.length) symbols.push(`导出: ${m.exports.slice(0, 5).join(', ')}${m.exports.length > 5 ? ` (+${m.exports.length - 5})` : ''}`)
          if (m.functions.length) symbols.push(`函数: ${m.functions.slice(0, 5).join(', ')}${m.functions.length > 5 ? ` (+${m.functions.length - 5})` : ''}`)
          if (m.classes.length) symbols.push(`类: ${m.classes.join(', ')}`)
          if (m.interfaces.length) symbols.push(`接口: ${m.interfaces.join(', ')}`)
          lines.push(`- \`${m.path}\` — ${symbols.join(' | ')}`)
        }

        if (matches.length > 30) {
          lines.push(`\n...还有 ${matches.length - 30} 个匹配，请缩小搜索范围`)
        }

        return {
          toolCallId: toolCall.id,
          toolName: 'project_index',
          content: lines.join('\n'),
          success: true,
          displayType: 'text',
          metadata: { query, matchCount: matches.length, totalFiles: entries.length }
        }
      }

      // 无查询时返回索引摘要
      const totalExports = entries.reduce((sum, e) => sum + e.exports.length, 0)
      const totalFunctions = entries.reduce((sum, e) => sum + e.functions.length, 0)
      const totalClasses = entries.reduce((sum, e) => sum + e.classes.length, 0)
      const totalInterfaces = entries.reduce((sum, e) => sum + e.interfaces.length, 0)

      // 按目录分组
      const byDir = new Map<string, FileSymbolEntry[]>()
      for (const e of entries) {
        const dir = e.path.includes('/') || e.path.includes('\\')
          ? e.path.replace(/[/\\][^/\\]+$/, '')
          : '.'
        if (!byDir.has(dir)) byDir.set(dir, [])
        byDir.get(dir)!.push(e)
      }

      const lines = [
        `## 📊 项目语义索引：\`${normalized}\``,
        `- 源码文件：${entries.length}`,
        `- 导出符号：${totalExports}`,
        `- 函数：${totalFunctions}`,
        `- 类：${totalClasses}`,
        `- 接口：${totalInterfaces}`,
        `- 索引构建时间：${new Date(cached.builtAt).toLocaleString('zh-CN')}`,
        '',
        '### 📁 按目录浏览'
      ]

      for (const [dir, files] of [...byDir.entries()].sort()) {
        lines.push(`\n**${dir}/**`)
        for (const f of files) {
          const symbols: string[] = []
          if (f.exports.length) symbols.push(`export: ${f.exports.slice(0, 3).join(', ')}${f.exports.length > 3 ? ` +${f.exports.length - 3}` : ''}`)
          if (f.functions.length) symbols.push(`fn: ${f.functions.slice(0, 3).join(', ')}${f.functions.length > 3 ? ` +${f.functions.length - 3}` : ''}`)
          if (f.classes.length) symbols.push(`class: ${f.classes.join(', ')}`)
          if (f.interfaces.length) symbols.push(`iface: ${f.interfaces.join(', ')}`)
          const symbolStr = symbols.length ? ` — ${symbols.join(' | ')}` : ''
          lines.push(`  - \`${f.path}\`${symbolStr}`)
        }
      }

      lines.push('', '💡 提示：使用 project_index(query="符号名") 可精确搜索特定符号位置')

      return {
        toolCallId: toolCall.id,
        toolName: 'project_index',
        content: lines.join('\n'),
        success: true,
        displayType: 'text',
        metadata: {
          dirPath: normalized,
          totalFiles: entries.length,
          totalExports,
          totalFunctions,
          totalClasses,
          totalInterfaces,
          builtAt: cached.builtAt
        }
      }
    } catch (e) {
      return this.error(toolCall.id, `索引构建失败：${(e as Error).message}`)
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'project_index', content: '', success: false, error: msg }
  }
}
