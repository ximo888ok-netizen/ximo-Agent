/**
 * 组件目录管理 — 从 DesignComponentTool 提取
 *
 * 负责解析 ui-components 目录路径、加载/缓存组件目录、读取组件文件
 */

import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import type { ComponentMeta } from '@shared/types'
import { loadCustomCatalog, readCustomComponentFiles, saveCustomComponent, deleteCustomComponent } from '@main/CustomDesignStore'

/** 解析 ui-components 目录的绝对路径 */
function resolveUiComponentsDir(): string {
  const bundledDir = dirname(new URL(import.meta.url).pathname.replace(/^\//, ''))
  const path1 = join(bundledDir, 'ui-components')
  if (existsSync(path1)) return path1
  const srcDir = join(bundledDir, '../../src/main/tools/Design/ui-components')
  if (existsSync(srcDir)) return srcDir
  const cwdDir = join(process.cwd(), 'src/main/tools/Design/ui-components')
  if (existsSync(cwdDir)) return cwdDir
  return path1
}

/** 解析 catalog JSON 路径 */
function resolveCatalogPath(): string {
  const bundledDir = dirname(new URL(import.meta.url).pathname.replace(/^\//, ''))
  const path1 = join(bundledDir, 'ui-components-catalog.json')
  if (existsSync(path1)) return path1
  const srcDir = join(bundledDir, '../../src/main/tools/Design/ui-components-catalog.json')
  if (existsSync(srcDir)) return srcDir
  const cwdDir = join(process.cwd(), 'src/main/tools/Design/ui-components-catalog.json')
  if (existsSync(cwdDir)) return cwdDir
  return path1
}

const UI_COMPONENTS_DIR = resolveUiComponentsDir()
const CATALOG_PATH = resolveCatalogPath()

/** 缓存 */
let cachedCatalog: ComponentMeta[] | null = null

/** 加载内置目录 + 自定义 catalog */
export function loadCatalog(): ComponentMeta[] {
  if (cachedCatalog) return cachedCatalog
  if (!existsSync(CATALOG_PATH)) {
    cachedCatalog = loadCustomCatalog()
    return cachedCatalog
  }
  try {
    const raw = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'))
    const builtin: ComponentMeta[] = raw.components || []
    const custom = loadCustomCatalog()
    const customIds = new Set(custom.map(c => c.id))
    cachedCatalog = [...builtin.filter(c => !customIds.has(c.id)), ...custom]
  } catch {
    cachedCatalog = loadCustomCatalog()
  }
  return cachedCatalog ?? []
}

/** 刷新缓存（CRUD 后调用） */
export function refreshCatalog(): void { cachedCatalog = null }

/** 读取组件文件内容（内置 + 自定义） */
export function readComponentFiles(category: string, componentId: string) {
  const custom = readCustomComponentFiles(category, componentId)
  if (custom) return custom

  const compDir = join(UI_COMPONENTS_DIR, category, componentId)
  if (!existsSync(compDir)) return null

  const files = readdirSync(compDir)
  const jsxFile = files.find(f => f.endsWith('.jsx'))
  const cssFile = files.find(f => f.endsWith('.css'))

  return {
    jsx: jsxFile ? readFileSync(join(compDir, jsxFile), 'utf8') : null,
    css: cssFile ? readFileSync(join(compDir, cssFile), 'utf8') : null
  }
}

export { saveCustomComponent, deleteCustomComponent }
