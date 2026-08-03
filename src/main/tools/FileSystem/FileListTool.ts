import { readdir, stat } from 'fs/promises'
import { resolve, normalize, relative, join } from 'path'
import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  mtime: Date
}

/**
 * FileListTool — 列出目录内容
 * 支持 glob 模式过滤、递归深度控制
 */
export class FileListTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'file_list',
    description:
      '列出目录内容。支持 glob 模式过滤（如 "*.ts", "src/**"）、递归深度控制。用于了解项目目录结构、查找文件。当需要探索项目代码时，先用此工具了解文件布局。',
    parameters: {
      type: 'object',
      properties: {
        dirPath: {
          type: 'string',
          description: '目录路径，默认为当前工作目录',
          default: '.'
        },
        pattern: {
          type: 'string',
          description: 'glob 过滤模式，如 "*.ts", "src/**/*.tsx"',
          default: '*'
        },
        maxDepth: {
          type: 'number',
          description: '递归最大深度，默认 2，最大 5。设为 1 表示只列出当前目录',
          default: 2
        },
        maxResults: {
          type: 'number',
          description: '最多显示条目数，默认 200',
          default: 200
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
    const pattern = (toolCall.arguments.pattern as string) || '*'
    const maxDepth = Math.min((toolCall.arguments.maxDepth as number) || 2, 5)
    const maxResults = (toolCall.arguments.maxResults as number) || 200

    const normalized = normalize(resolve(dirPath))

    onChunk?.({ toolStatus: 'calling', toolName: 'file_list' })

    try {
      let entries: FileEntry[]

      if (pattern === '*' || pattern === '**/*') {
        // 简单递归列出
        entries = await this.walkDir(normalized, maxDepth, 0, signal)
      } else {
        // 使用 fast-glob
        const fg = (await import('fast-glob')).default
        const matches = await fg(pattern, {
          cwd: normalized,
          dot: true,
          onlyFiles: false,
          deep: maxDepth,
          absolute: true,
          stats: true
        })

        entries = matches.map((m) => {
          const s = (m as unknown as { stats?: { isDirectory: () => boolean; size: number; mtime: Date } }).stats
          return {
            name: relative(normalized, m.toString()),
            path: m.toString(),
            type: s?.isDirectory() ? 'directory' : 'file',
            size: s?.size || 0,
            mtime: s?.mtime || new Date()
          } as FileEntry
        })
      }

      if (entries.length === 0) {
        return {
          toolCallId: toolCall.id,
          toolName: 'file_list',
          content: `目录 \`${normalized}\` 中没有匹配 "**/${pattern}" 的文件。`,
          success: true,
          metadata: { dirPath: normalized, count: 0 }
        }
      }

      // 格式化输出
      const truncated = entries.slice(0, maxResults)
      const lines = [`## 📂 目录列表：\`${normalized}\``, '']

      // 先目录后文件，按名称排序
      const dirs = truncated.filter((e) => e.type === 'directory').sort((a, b) => a.name.localeCompare(b.name))
      const files = truncated.filter((e) => e.type === 'file').sort((a, b) => a.name.localeCompare(b.name))

      if (dirs.length > 0) {
        lines.push(`**目录 (${dirs.length})：**`)
        for (const d of dirs) {
          lines.push(`- 📁 \`${d.name}/\``)
        }
        lines.push('')
      }

      if (files.length > 0) {
        lines.push(`**文件 (${files.length})：**`)
        for (const f of files) {
          const size = f.size > 1024 ? `${(f.size / 1024).toFixed(1)} KB` : `${f.size} B`
          lines.push(`- 📄 \`${f.name}\` (${size})`)
        }
      }

      if (entries.length > maxResults) {
        lines.push('')
        lines.push(`...还有 ${entries.length - maxResults} 个条目未显示。`)
      }

      return {
        toolCallId: toolCall.id,
        toolName: 'file_list',
        content: lines.join('\n'),
        success: true,
        displayType: 'text',
        metadata: { dirPath: normalized, count: entries.length, pattern }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        return this.error(toolCall.id, '操作已取消')
      }
      return this.error(toolCall.id, `列出目录失败：${(e as Error).message}`)
    }
  }

  private async walkDir(
    dir: string,
    maxDepth: number,
    currentDepth: number,
    signal?: AbortSignal
  ): Promise<FileEntry[]> {
    if (signal?.aborted) return []
    if (currentDepth >= maxDepth) return []

    const results: FileEntry[] = []
    try {
      const names = await readdir(dir)
      for (const name of names) {
        if (signal?.aborted) break
        const fullPath = join(dir, name)
        try {
          const s = await stat(fullPath)
          results.push({
            name,
            path: fullPath,
            type: s.isDirectory() ? 'directory' : 'file',
            size: s.size,
            mtime: s.mtime
          })
          if (s.isDirectory() && currentDepth + 1 < maxDepth) {
            const children = await this.walkDir(fullPath, maxDepth, currentDepth + 1, signal)
            results.push(...children.map((c) => ({ ...c, name: join(name, c.name) })))
          }
        } catch {
          // 跳过无权限的文件
        }
      }
    } catch {
      // 目录无权限
    }
    return results
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'file_list', content: '', success: false, error: msg }
  }
}
