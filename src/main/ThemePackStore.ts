import { join } from 'path'
import { readdir, readFile, writeFile, unlink } from 'fs/promises'
import { themesDir } from './paths'
import { ensureDirPath } from './ensureDir'

/**
 * 主题包 — 用户导入的完整 UI 主题
 *
 * 每个 ThemePack 定义浅色和深色模式下的 CSS 变量覆盖。
 * 用户可通过 JSON 文件导入，存储在 userData/ximo-agent/themes/ 目录。
 */
export interface ThemePack {
  id: string
  name: string
  description?: string
  author?: string
  /** 浅色模式 CSS 变量（键名如 --theme-color） */
  light?: Record<string, string>
  /** 深色模式 CSS 变量 */
  dark?: Record<string, string>
}

/** 校验并标准化主题包 JSON */
function validatePack(raw: unknown): ThemePack {
  if (!raw || typeof raw !== 'object') throw new Error('主题包必须是 JSON 对象')
  const obj = raw as Record<string, unknown>
  const id = obj.id
  const name = obj.name

  if (typeof id !== 'string' || !id) throw new Error('id 不能为空')
  if (!/^[a-z0-9_-]+$/i.test(id)) throw new Error('id 只能含字母、数字、下划线、横线')
  if (typeof name !== 'string' || !name) throw new Error('name 不能为空')

  const light = obj.light
  const dark = obj.dark
  if (light && typeof light !== 'object') throw new Error('light 必须是对象')
  if (dark && typeof dark !== 'object') throw new Error('dark 必须是对象')
  if (!light && !dark) throw new Error('light 和 dark 至少需要一个')

  // 校验变量值都是字符串
  for (const [mode, vars] of [['light', light], ['dark', dark]] as const) {
    if (!vars) continue
    for (const [k, v] of Object.entries(vars)) {
      if (!k.startsWith('--')) throw new Error(`${mode} 中的键 "${k}" 必须以 -- 开头`)
      if (typeof v !== 'string') throw new Error(`${mode} 中的 "${k}" 值必须是字符串`)
    }
  }

  return {
    id,
    name,
    description: typeof obj.description === 'string' ? obj.description : undefined,
    author: typeof obj.author === 'string' ? obj.author : undefined,
    light: light as Record<string, string> | undefined,
    dark: dark as Record<string, string> | undefined
  }
}

/** 列出所有已导入的主题包 */
export async function listThemePacks(): Promise<ThemePack[]> {
  await ensureDirPath(themesDir)
  const files = (await readdir(themesDir)).filter((f) => f.endsWith('.json'))
  const packs: ThemePack[] = []
  for (const file of files) {
    try {
      const raw = await readFile(join(themesDir, file), 'utf-8')
      packs.push(validatePack(JSON.parse(raw)))
    } catch (e) {
      console.error(`[ThemePackStore] 读取 ${file} 失败:`, e)
    }
  }
  return packs.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

/** 导入主题包（JSON 字符串） */
export async function importThemePack(jsonStr: string): Promise<ThemePack> {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error('JSON 格式无效，请检查文件内容')
  }
  const pack = validatePack(parsed)
  await ensureDirPath(themesDir)
  await writeFile(join(themesDir, `${pack.id}.json`), JSON.stringify(pack, null, 2), 'utf-8')
  return pack
}

/** 删除主题包 */
export async function deleteThemePack(id: string): Promise<boolean> {
  try {
    await unlink(join(themesDir, `${id}.json`))
    return true
  } catch {
    return false
  }
}
