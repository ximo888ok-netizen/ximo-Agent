import { join } from 'path'
import { mkdir, rm } from 'fs/promises'
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import type { ComponentMeta } from '@shared/types'
import type { AgentEntry } from './tools/Skill/expert-config'
import {
  designStylesDir as STYLES_DIR,
  designComponentsDir as COMPONENTS_DIR,
  designComponentsCatalog as COMPONENTS_CATALOG,
  expertsFile as EXPERTS_FILE,
} from './paths'

/**
 * 自定义设计资产存储 — 管理用户创建的风格、组件、专家
 *
 * 三类资产持久化在 userData/ximo-agent/ 下的独立子目录：
 * - design-styles/<id>/       自定义设计风格（manifest.json + DESIGN.md + tokens.css）
 * - ui-components/<cat>/<id>/ 自定义 UI 组件（*.jsx + *.css）+ ui-components-catalog.json
 * - experts.json              自定义 AI 专家列表
 *
 * 与内置数据合并后提供给工具读取。内置数据只读，用户数据可增删改。
 */

// ── 内存缓存 ──
let customStylesCache: string[] | null = null
let customCatalogCache: ComponentMeta[] | null = null
let customExpertsCache: AgentEntry[] | null = null

function invalidateCache(kind: 'styles' | 'components' | 'experts'): void {
  if (kind === 'styles') customStylesCache = null
  if (kind === 'components') customCatalogCache = null
  if (kind === 'experts') customExpertsCache = null
}

// ================================================================
// 设计风格 CRUD
// ================================================================

/** 列出自定义风格目录中的所有风格 ID */
export function listCustomStyleIds(): string[] {
  if (customStylesCache) return customStylesCache
  const result: string[] = []
  if (!existsSync(STYLES_DIR)) {
    customStylesCache = result
    return result
  }
  try {
    const entries = readdirSync(STYLES_DIR, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) result.push(entry.name)
    }
  } catch { /* ignore */ }
  customStylesCache = result
  return result
}

/** 自定义风格目录路径 */
export function customStyleDir(id: string): string {
  return join(STYLES_DIR, id)
}

/** 读取自定义风格的 tokens.css / DESIGN.md */
export function readCustomStyleFiles(id: string): { manifest: unknown; designMd: string | null; tokensCss: string | null } | null {
  const dir = customStyleDir(id)
  if (!existsSync(dir)) return null
  let manifest: unknown = null
  let designMd: string | null = null
  let tokensCss: string | null = null
  const mPath = join(dir, 'manifest.json')
  if (existsSync(mPath)) {
    try { manifest = JSON.parse(readFileSync(mPath, 'utf8')) } catch { /* skip */ }
  }
  const dPath = join(dir, 'DESIGN.md')
  if (existsSync(dPath)) designMd = readFileSync(dPath, 'utf8')
  const tPath = join(dir, 'tokens.css')
  if (existsSync(tPath)) tokensCss = readFileSync(tPath, 'utf8')
  return { manifest, designMd, tokensCss }
}

/** 创建或更新自定义风格 */
export async function saveCustomStyle(
  id: string,
  manifest: { id: string; name: string; category: string; description: string },
  designMd: string,
  tokensCss: string
): Promise<void> {
  const dir = customStyleDir(id)
  await mkdir(dir, { recursive: true })
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  writeFileSync(join(dir, 'DESIGN.md'), designMd, 'utf8')
  writeFileSync(join(dir, 'tokens.css'), tokensCss, 'utf8')
  invalidateCache('styles')
}

/** 删除自定义风格 */
export async function deleteCustomStyle(id: string): Promise<boolean> {
  const dir = customStyleDir(id)
  if (!existsSync(dir)) return false
  try {
    await rm(dir, { recursive: true, force: true })
    invalidateCache('styles')
    return true
  } catch {
    return false
  }
}

// ================================================================
// UI 组件 CRUD
// ================================================================

/** 加载自定义组件 catalog */
export function loadCustomCatalog(): ComponentMeta[] {
  if (customCatalogCache) return customCatalogCache
  if (!existsSync(COMPONENTS_CATALOG)) {
    customCatalogCache = []
    return customCatalogCache
  }
  try {
    const raw = JSON.parse(readFileSync(COMPONENTS_CATALOG, 'utf8'))
    customCatalogCache = raw.components || []
  } catch {
    customCatalogCache = []
  }
  return customCatalogCache ?? []
}

/** 自定义组件目录路径 */
export function customComponentDir(category: string, id: string): string {
  return join(COMPONENTS_DIR, category, id)
}

/** 读取自定义组件文件 */
export function readCustomComponentFiles(category: string, id: string): { jsx: string | null; css: string | null } | null {
  const dir = customComponentDir(category, id)
  if (!existsSync(dir)) return null
  let jsx: string | null = null
  let css: string | null = null
  try {
    const files = readdirSync(dir)
    const jsxFile = files.find(f => f.endsWith('.jsx'))
    const cssFile = files.find(f => f.endsWith('.css'))
    if (jsxFile) jsx = readFileSync(join(dir, jsxFile), 'utf8')
    if (cssFile) css = readFileSync(join(dir, cssFile), 'utf8')
  } catch { /* skip */ }
  return { jsx, css }
}

/** 创建或更新自定义组件 */
export async function saveCustomComponent(
  meta: ComponentMeta,
  jsx: string,
  css: string | null
): Promise<void> {
  const dir = customComponentDir(meta.category, meta.id)
  await mkdir(dir, { recursive: true })
  writeFileSync(join(dir, `${meta.id}.jsx`), jsx, 'utf8')
  if (css) writeFileSync(join(dir, `${meta.id}.css`), css, 'utf8')

  // 更新 catalog
  const catalog = loadCustomCatalog()
  const idx = catalog.findIndex(c => c.id === meta.id)
  if (idx >= 0) catalog[idx] = meta
  else catalog.push(meta)
  writeFileSync(COMPONENTS_CATALOG, JSON.stringify({ components: catalog }, null, 2), 'utf8')
  invalidateCache('components')
}

/** 删除自定义组件 */
export async function deleteCustomComponent(id: string): Promise<boolean> {
  const catalog = loadCustomCatalog()
  const meta = catalog.find(c => c.id === id)
  if (!meta) return false
  const dir = customComponentDir(meta.category, meta.id)
  try {
    await rm(dir, { recursive: true, force: true })
  } catch { /* ignore */ }
  const updated = catalog.filter(c => c.id !== id)
  writeFileSync(COMPONENTS_CATALOG, JSON.stringify({ components: updated }, null, 2), 'utf8')
  invalidateCache('components')
  return true
}

// ================================================================
// AI 专家 CRUD
// ================================================================

/** 加载自定义专家列表 */
export function loadCustomExperts(): AgentEntry[] {
  if (customExpertsCache) return customExpertsCache
  if (!existsSync(EXPERTS_FILE)) {
    customExpertsCache = []
    return customExpertsCache
  }
  try {
    const raw = JSON.parse(readFileSync(EXPERTS_FILE, 'utf8'))
    customExpertsCache = Array.isArray(raw) ? raw : (raw.agents || [])
  } catch {
    customExpertsCache = []
  }
  return customExpertsCache ?? []
}

/** 创建或更新自定义专家 */
export async function saveCustomExpert(entry: AgentEntry): Promise<void> {
  const experts = loadCustomExperts()
  const idx = experts.findIndex(a => a.id === entry.id)
  if (idx >= 0) experts[idx] = entry
  else experts.push(entry)
  writeFileSync(EXPERTS_FILE, JSON.stringify(experts, null, 2), 'utf8')
  invalidateCache('experts')
}

/** 删除自定义专家 */
export async function deleteCustomExpert(id: string): Promise<boolean> {
  const experts = loadCustomExperts()
  const updated = experts.filter(a => a.id !== id)
  if (updated.length === experts.length) return false
  writeFileSync(EXPERTS_FILE, JSON.stringify(updated, null, 2), 'utf8')
  invalidateCache('experts')
  return true
}
