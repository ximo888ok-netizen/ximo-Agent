import { readdir } from 'fs/promises'
import { join, extname } from 'path'

/** 文件符号索引条目 */
export interface FileSymbolEntry {
  path: string
  ext: string
  exports: string[]
  functions: string[]
  classes: string[]
  interfaces: string[]
  imports: string[]
}

export const SUPPORTED_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.rb', '.php',
  '.vue', '.svelte'
])

export const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', '.svn', 'dist', 'out', 'build', 'release',
  '.next', '.nuxt', 'coverage', '__pycache__', '.cache', '.idea', '.vscode',
  '.reasonix', '.trae', '.meituan-catpaw', 'vendor', 'target', 'bin', 'obj'
])

/** 从源码中提取符号（正则匹配，轻量级） */
export function extractSymbols(content: string, ext: string): Pick<FileSymbolEntry, 'exports' | 'functions' | 'classes' | 'interfaces' | 'imports'> {
  const exports: string[] = []
  const functions: string[] = []
  const classes: string[] = []
  const interfaces: string[] = []
  const imports: string[] = []

  // JS/TS 系列
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte'].includes(ext)) {
    for (const m of content.matchAll(/export\s+(?:async\s+)?(?:function|const|class|interface|enum|type|default)\s+(\w+)/g)) {
      exports.push(m[1])
    }
    for (const m of content.matchAll(/export\s*\{([^}]+)\}/g)) {
      const names = m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)
      exports.push(...names)
    }
    for (const m of content.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)) {
      const name = m[1]
      if (!functions.includes(name)) functions.push(name)
    }
    for (const m of content.matchAll(/(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/g)) {
      const name = m[1]
      if (!functions.includes(name)) functions.push(name)
    }
    for (const m of content.matchAll(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g)) {
      classes.push(m[1])
    }
    for (const m of content.matchAll(/(?:export\s+)?interface\s+(\w+)/g)) {
      interfaces.push(m[1])
    }
    for (const m of content.matchAll(/import\s+(?:type\s+)?(?:\{[^}]+\}|\w+|\*\s+as\s+\w+)\s+from\s+['"`]([^'"`]+)/g)) {
      imports.push(m[1])
    }
  }

  // Python
  if (ext === '.py') {
    for (const m of content.matchAll(/^(?:async\s+)?def\s+(\w+)/gm)) functions.push(m[1])
    for (const m of content.matchAll(/^class\s+(\w+)/gm)) classes.push(m[1])
    for (const m of content.matchAll(/^from\s+\S+\s+import\s+(.+)/gm)) imports.push(m[1].trim())
    for (const m of content.matchAll(/^import\s+(\S+)/gm)) imports.push(m[1])
  }

  // Go
  if (ext === '.go') {
    for (const m of content.matchAll(/^func\s+(?:\([^)]+\)\s+)?(\w+)/gm)) functions.push(m[1])
    for (const m of content.matchAll(/^type\s+(\w+)\s+struct/gm)) classes.push(m[1])
    for (const m of content.matchAll(/^type\s+(\w+)\s+interface/gm)) interfaces.push(m[1])
    for (const m of content.matchAll(/^import\s+"([^"]+)"/gm)) imports.push(m[1])
  }

  // Rust
  if (ext === '.rs') {
    for (const m of content.matchAll(/(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g)) functions.push(m[1])
    for (const m of content.matchAll(/(?:pub\s+)?struct\s+(\w+)/g)) classes.push(m[1])
    for (const m of content.matchAll(/(?:pub\s+)?trait\s+(\w+)/g)) interfaces.push(m[1])
    for (const m of content.matchAll(/(?:pub\s+)?enum\s+(\w+)/g)) classes.push(m[1])
  }

  // Java/Kotlin
  if (['.java', '.kt'].includes(ext)) {
    for (const m of content.matchAll(/(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?class\s+(\w+)/g)) classes.push(m[1])
    for (const m of content.matchAll(/(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?interface\s+(\w+)/g)) interfaces.push(m[1])
    for (const m of content.matchAll(/(?:public|private|protected)?\s*(?:static\s+)?(?:\w+(?:<[^>]+>)?\s+)+(\w+)\s*\(/g)) {
      const name = m[1]
      if (!['if', 'for', 'while', 'switch', 'catch', 'return', 'new'].includes(name)) functions.push(name)
    }
  }

  return {
    exports: [...new Set(exports)],
    functions: [...new Set(functions)],
    classes: [...new Set(classes)],
    interfaces: [...new Set(interfaces)],
    imports: [...new Set(imports)]
  }
}

/** 递归收集源码文件 */
export async function collectSourceFiles(
  dir: string,
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
