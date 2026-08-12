import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { listCustomStyleIds, readCustomStyleFiles } from '@main/CustomDesignStore'

/**
 * 解析 design-systems 目录的绝对路径。
 *
 * electron-vite 打包后代码在 out/main/ 下，而 design-systems 是静态资源不会被打包。
 * 需要多重回退：① 打包后同目录（生产构建复制了资源）→ ② 源码目录（dev 模式）→ ③ 项目根 + src 路径。
 */
function resolveDesignSystemsDir(): string {
  const bundledDir = dirname(new URL(import.meta.url).pathname.replace(/^\//, ''))
  const path1 = join(bundledDir, 'design-systems')
  if (existsSync(path1)) return path1

  const srcDir = join(bundledDir, '../../src/main/tools/Design/design-systems')
  if (existsSync(srcDir)) return srcDir

  const cwdDir = join(process.cwd(), 'src/main/tools/Design/design-systems')
  if (existsSync(cwdDir)) return cwdDir

  return path1
}

/** design-systems 根目录 */
export const DESIGN_SYSTEMS_DIR = resolveDesignSystemsDir()

/** 风格系统元数据 */
export interface StyleManifest {
  id: string
  name: string
  category: string
  description: string
}

/** 缓存目录扫描结果 */
let cachedStyles: StyleManifest[] | null = null

/** 扫描内置 + 自定义风格 */
export function scanStyles(): StyleManifest[] {
  if (cachedStyles) return cachedStyles

  const result: StyleManifest[] = []

  const stylesDir = DESIGN_SYSTEMS_DIR
  if (existsSync(stylesDir)) {
    const entries = readdirSync(stylesDir)
    for (const entry of entries) {
      const dir = join(stylesDir, entry)
      if (!statSync(dir).isDirectory()) continue
      const manifestPath = join(dir, 'manifest.json')
      if (!existsSync(manifestPath)) continue
      try {
        const raw = JSON.parse(readFileSync(manifestPath, 'utf8'))
        result.push({
          id: raw.id || entry,
          name: raw.name || entry,
          category: raw.category || 'Other',
          description: raw.description || ''
        })
      } catch {
        // skip invalid
      }
    }
  }

  for (const id of listCustomStyleIds()) {
    const files = readCustomStyleFiles(id)
    if (files?.manifest) {
      const raw = files.manifest as Record<string, string>
      const existingIdx = result.findIndex(s => s.id === id)
      const entry = { id: raw.id || id, name: raw.name || id, category: raw.category || '自定义', description: raw.description || '' }
      if (existingIdx >= 0) result[existingIdx] = entry
      else result.push(entry)
    }
  }

  cachedStyles = result.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
  return cachedStyles
}

/** 刷新缓存（创建/更新/删除后调用） */
export function refreshStyles(): void { cachedStyles = null }
