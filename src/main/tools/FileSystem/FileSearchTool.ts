import { readFile, readdir, stat } from 'fs/promises'
import { resolve, normalize, join, extname } from 'path'
import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

interface SearchMatch {
  file: string
  line: number
  content: string
}

/**
 * FileSearchTool — 按内容搜索文件（类似 grep）
 * 支持正则表达式、文件类型过滤、目录范围限制
 */
export class FileSearchTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'file_search',
    description:
      '在文件内容中搜索匹配的文本或正则表达式。类似 grep 命令。用于在项目中查找特定函数定义、变量引用、错误信息等。支持文件类型过滤和目录范围限制。',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: '搜索的关键词或正则表达式'
        },
        dirPath: {
          type: 'string',
          description: '搜索的目录路径，默认为当前目录',
          default: '.'
        },
        fileTypes: {
          type: 'string',
          description: '逗号分隔的文件扩展名，如 ".ts,.tsx,.json"',
          default: ''
        },
        maxResults: {
          type: 'number',
          description: '最多显示匹配数，默认 50',
          default: 50
        },
        caseSensitive: {
          type: 'boolean',
          description: '是否区分大小写，默认 false',
          default: false
        },
        isRegex: {
          type: 'boolean',
          description: 'pattern 是否为正则表达式，默认 false',
          default: false
        }
      },
      required: ['pattern']
    }
  }

  // 排除的目录
  private excludeDirs = new Set([
    'node_modules', '.git', '.svn', '.hg', 'dist', 'out', 'build',
    '.next', '.nuxt', 'coverage', '__pycache__', '.cache', '.idea', '.vscode'
  ])

  // 排除的文件扩展名
  private excludeExts = new Set([
    '.jpg', '.jpeg', '.png', '.gif', '.ico', '.svg', '.webp',
    '.mp3', '.mp4', '.avi', '.mov', '.wav',
    '.zip', '.tar', '.gz', '.rar', '.7z',
    '.exe', '.dll', '.so', '.dylib',
    '.woff', '.woff2', '.ttf', '.eot',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.lock', '.map'
  ])

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    signal?: AbortSignal
  ): Promise<ToolResult> {
    const pattern = (toolCall.arguments.pattern as string) || ''
    const dirPath = (toolCall.arguments.dirPath as string) || '.'
    const fileTypesStr = (toolCall.arguments.fileTypes as string) || ''
    const maxResults = (toolCall.arguments.maxResults as number) || 50
    const caseSensitive = (toolCall.arguments.caseSensitive as boolean) || false
    const isRegex = (toolCall.arguments.isRegex as boolean) || false

    if (!pattern) {
      return this.error(toolCall.id, '缺少 pattern 参数')
    }

    const normalized = normalize(resolve(dirPath))
    const fileTypes = fileTypesStr ? fileTypesStr.split(',').map((t) => t.trim().toLowerCase()) : []

    onChunk?.({ toolStatus: 'calling', toolName: 'file_search' })

    let regex: RegExp
    try {
      const escaped = isRegex ? pattern : pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      regex = new RegExp(escaped, caseSensitive ? 'g' : 'gi')
    } catch {
      return this.error(toolCall.id, `无效的正则表达式：${pattern}`)
    }

    const matches: SearchMatch[] = []

    try {
      await this.searchDir(normalized, regex, fileTypes, maxResults * 2, matches, signal)
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        return this.error(toolCall.id, '操作已取消')
      }
    }

    if (matches.length === 0) {
      return {
        toolCallId: toolCall.id,
        toolName: 'file_search',
        content: `未在 \`${normalized}\` 中找到匹配 "${pattern}" 的内容。`,
        success: true,
        metadata: { pattern, count: 0 }
      }
    }

    const truncated = matches.slice(0, maxResults)
    const lines = [`## 🔍 搜索结果："${pattern}"`, `目录：\`${normalized}\``, '']

    // 按文件分组
    const grouped = new Map<string, SearchMatch[]>()
    for (const m of truncated) {
      if (!grouped.has(m.file)) grouped.set(m.file, [])
      grouped.get(m.file)!.push(m)
    }

    for (const [file, fileMatches] of grouped) {
      lines.push(`### \`${file}\` (${fileMatches.length} 处匹配)`)
      for (const m of fileMatches) {
        lines.push(`  L${m.line}: ${m.content.trim().slice(0, 200)}`)
      }
      lines.push('')
    }

    if (matches.length > maxResults) {
      lines.push(`...还有 ${matches.length - maxResults} 处匹配未显示。`)
    }

    return {
      toolCallId: toolCall.id,
      toolName: 'file_search',
      content: lines.join('\n'),
      success: true,
      displayType: 'text',
      metadata: { pattern, count: matches.length, truncated: matches.length > maxResults }
    }
  }

  private async searchDir(
    dir: string,
    regex: RegExp,
    fileTypes: string[],
    maxMatches: number,
    results: SearchMatch[],
    signal?: AbortSignal
  ): Promise<void> {
    if (signal?.aborted || results.length >= maxMatches) return

    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      return
    }

    for (const name of names) {
      if (signal?.aborted || results.length >= maxMatches) break

      const fullPath = join(dir, name)
      let s
      try {
        s = await stat(fullPath)
      } catch {
        continue
      }

      if (s.isDirectory()) {
        if (!this.excludeDirs.has(name) && !name.startsWith('.')) {
          await this.searchDir(fullPath, regex, fileTypes, maxMatches, results, signal)
        }
      } else if (s.isFile()) {
        const ext = extname(name).toLowerCase()
        if (this.excludeExts.has(ext)) continue
        if (fileTypes.length > 0 && !fileTypes.includes(ext)) continue
        if (s.size > 1024 * 1024) continue // 跳过 >1MB 文件

        await this.searchFile(fullPath, regex, maxMatches, results)
      }
    }
  }

  private async searchFile(
    filePath: string,
    regex: RegExp,
    maxMatches: number,
    results: SearchMatch[]
  ): Promise<void> {
    if (results.length >= maxMatches) return
    try {
      const content = await readFile(filePath, 'utf-8')
      regex.lastIndex = 0
      const lines = content.split('\n')
      for (let i = 0; i < lines.length && results.length < maxMatches; i++) {
        if (regex.test(lines[i])) {
          results.push({ file: filePath, line: i + 1, content: lines[i] })
          regex.lastIndex = 0
        }
      }
    } catch {
      // 跳过无法读取的文件
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'file_search', content: '', success: false, error: msg }
  }
}
