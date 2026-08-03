import { readFile, readdir, stat } from 'fs/promises'
import { resolve, relative, join, extname } from 'path'
import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

/** 文件符号索引条目 */
interface FileSymbolEntry {
  path: string
  ext: string
  exports: string[]
  functions: string[]
  classes: string[]
  interfaces: string[]
  imports: string[]
}

/** 索引缓存（按项目路径），避免重复扫描 */
const indexCache = new Map<string, { entries: FileSymbolEntry[]; builtAt: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 分钟

const SUPPORTED_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.rb', '.php',
  '.vue', '.svelte'
])

const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', '.svn', 'dist', 'out', 'build', 'release',
  '.next', '.nuxt', 'coverage', '__pycache__', '.cache', '.idea', '.vscode',
  '.reasonix', '.trae', '.meituan-catpaw', 'vendor', 'target', 'bin', 'obj'
])

/** 从源码中提取符号（正则匹配，轻量级） */
function extractSymbols(content: string, ext: string): Pick<FileSymbolEntry, 'exports' | 'functions' | 'classes' | 'interfaces' | 'imports'> {
  const exports: string[] = []
  const functions: string[] = []
  const classes: string[] = []
  const interfaces: string[] = []
  const imports: string[] = []

  // JS/TS 系列
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte'].includes(ext)) {
    // export function/const/class/interface
    for (const m of content.matchAll(/export\s+(?:async\s+)?(?:function|const|class|interface|enum|type|default)\s+(\w+)/g)) {
      exports.push(m[1])
    }
    // export { name1, name2 }
    for (const m of content.matchAll(/export\s*\{([^}]+)\}/g)) {
      const names = m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)
      exports.push(...names)
    }
    // function declarations (including async)
    for (const m of content.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)) {
      const name = m[1]
      if (!functions.includes(name)) functions.push(name)
    }
    // arrow functions assigned to const
    for (const m of content.matchAll(/(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/g)) {
      const name = m[1]
      if (!functions.includes(name)) functions.push(name)
    }
    // class declarations
    for (const m of content.matchAll(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g)) {
      classes.push(m[1])
    }
    // interface declarations
    for (const m of content.matchAll(/(?:export\s+)?interface\s+(\w+)/g)) {
      interfaces.push(m[1])
    }
    // import statements
    for (const m of content.matchAll(/import\s+(?:type\s+)?(?:\{[^}]+\}|\w+|\*\s+as\s+\w+)\s+from\s+['"`]([^'"`]+)/g)) {
      imports.push(m[1])
    }
  }

  // Python
  if (ext === '.py') {
    for (const m of content.matchAll(/^(?:async\s+)?def\s+(\w+)/gm)) {
      functions.push(m[1])
    }
    for (const m of content.matchAll(/^class\s+(\w+)/gm)) {
      classes.push(m[1])
    }
    for (const m of content.matchAll(/^from\s+\S+\s+import\s+(.+)/gm)) {
      imports.push(m[1].trim())
    }
    for (const m of content.matchAll(/^import\s+(\S+)/gm)) {
      imports.push(m[1])
    }
  }

  // Go
  if (ext === '.go') {
    for (const m of content.matchAll(/^func\s+(?:\([^)]+\)\s+)?(\w+)/gm)) {
      functions.push(m[1])
    }
    for (const m of content.matchAll(/^type\s+(\w+)\s+struct/gm)) {
      classes.push(m[1])
    }
    for (const m of content.matchAll(/^type\s+(\w+)\s+interface/gm)) {
      interfaces.push(m[1])
    }
    for (const m of content.matchAll(/^import\s+"([^"]+)"/gm)) {
      imports.push(m[1])
    }
  }

  // Rust
  if (ext === '.rs') {
    for (const m of content.matchAll(/(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g)) {
      functions.push(m[1])
    }
    for (const m of content.matchAll(/(?:pub\s+)?struct\s+(\w+)/g)) {
      classes.push(m[1])
    }
    for (const m of content.matchAll(/(?:pub\s+)?trait\s+(\w+)/g)) {
      interfaces.push(m[1])
    }
    for (const m of content.matchAll(/(?:pub\s+)?enum\s+(\w+)/g)) {
      classes.push(m[1])
    }
  }

  // Java/Kotlin
  if (['.java', '.kt'].includes(ext)) {
    for (const m of content.matchAll(/(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?class\s+(\w+)/g)) {
      classes.push(m[1])
    }
    for (const m of content.matchAll(/(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?interface\s+(\w+)/g)) {
      interfaces.push(m[1])
    }
    for (const m of content.matchAll(/(?:public|private|protected)?\s*(?:static\s+)?(?:\w+(?:<[^>]+>)?\s+)+(\w+)\s*\(/g)) {
      const name = m[1]
      // 过滤关键字
      if (!['if', 'for', 'while', 'switch', 'catch', 'return', 'new'].includes(name)) {
        functions.push(name)
      }
    }
  }

  // 去重
  return {
    exports: [...new Set(exports)],
    functions: [...new Set(functions)],
    classes: [...new Set(classes)],
    interfaces: [...new Set(interfaces)],
    imports: [...new Set(imports)]
  }
}

/** 递归收集源码文件 */
async function collectSourceFiles(
  dir: string,
  rootDir: string,
  signal?: AbortSignal,
  maxFiles = 500
): Promise<string[]> {
  const files: string[] = []
  if (signal?.aborted) return files

  async function walk(d: string): Promise<void> {
    if (files.length >= maxFiles) return
    if (signal?.aborted) return

    let entries
    try {
      entries = await readdir(d, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) return
      if (signal?.aborted) return
      if (EXCLUDE_DIRS.has(entry.name)) continue
      if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue

      const fullPath = join(d, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (SUPPORTED_EXTS.has(extname(entry.name))) {
        files.push(fullPath)
      }
    }
  }

  await walk(dir)
  return files
}

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
      // 检查缓存
      let cached = indexCache.get(normalized)
      if (refresh || !cached || Date.now() - cached.builtAt > CACHE_TTL) {
        const files = await collectSourceFiles(normalized, normalized, signal)
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

        const lines = [
          `## 🔍 索引搜索结果：\`${query}\`（共 ${matches.length} 个匹配）`,
          ''
        ]

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
