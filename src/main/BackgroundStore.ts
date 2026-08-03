import { join, extname } from 'path'
import { readdir, copyFile, unlink, stat } from 'fs/promises'
import { bgDir } from './paths'
import { ensureDirPath } from './ensureDir'

/**
 * 背景图存储 — 管理用户导入的背景图片/视频
 *
 * 文件存储在 userData/ximo-agent/backgrounds/ 目录。
 * 支持静态图片（jpg/png/webp/gif）和动态视频（mp4/webm）。
 */

/** 静态图片扩展名 */
const STATIC_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp']
/** 动态背景扩展名（含动画 GIF 和视频） */
const DYNAMIC_EXTS = ['.gif', '.mp4', '.webm', '.mov', '.avi', '.mkv']
/** 全部支持的扩展名 */
const ALL_EXTS = [...STATIC_EXTS, ...DYNAMIC_EXTS]

/** 判断文件类型 */
export function getBackgroundType(filePath: string): 'static' | 'dynamic' | null {
  const ext = extname(filePath).toLowerCase()
  if (STATIC_EXTS.includes(ext)) return 'static'
  if (DYNAMIC_EXTS.includes(ext)) return 'dynamic'
  return null
}

/** 导入背景图文件 — 复制到 userData 目录，返回新路径 */
export async function importBackground(srcPath: string): Promise<{
  path: string
  type: 'static' | 'dynamic'
  fileName: string
}> {
  const ext = extname(srcPath).toLowerCase()
  if (!ALL_EXTS.includes(ext)) {
    throw new Error(`不支持的文件格式: ${ext}。支持: ${ALL_EXTS.join(', ')}`)
  }

  const type = getBackgroundType(srcPath)
  if (!type) throw new Error('无法识别文件类型')

  await ensureDirPath(bgDir)

  // 生成唯一文件名：时间戳 + 原始文件名
  const baseName = srcPath.replace(/^.*[\\/]/, '')
  const fileName = `${Date.now()}_${baseName}`
  const destPath = join(bgDir, fileName)

  await copyFile(srcPath, destPath)

  return { path: destPath, type, fileName }
}

/** 删除背景图文件 */
export async function deleteBackground(filePath: string): Promise<boolean> {
  try {
    // 安全检查：只允许删除 backgrounds 目录下的文件
    const resolved = await stat(filePath)
    if (!resolved.isFile()) return false
    // 确保路径在 bgDir 下
    if (!filePath.startsWith(bgDir)) {
      throw new Error('只能删除背景图目录中的文件')
    }
    await unlink(filePath)
    return true
  } catch {
    return false
  }
}

/** 列出所有已导入的背景图 */
export async function listBackgrounds(): Promise<
  { path: string; fileName: string; type: 'static' | 'dynamic'; size: number }[]
> {
  await ensureDirPath(bgDir)
  const files = await readdir(bgDir)
  const results: { path: string; fileName: string; type: 'static' | 'dynamic'; size: number }[] = []

  for (const file of files) {
    const ext = extname(file).toLowerCase()
    if (!ALL_EXTS.includes(ext)) continue
    const type = getBackgroundType(file)
    if (!type) continue

    const filePath = join(bgDir, file)
    try {
      const s = await stat(filePath)
      results.push({ path: filePath, fileName: file, type, size: s.size })
    } catch { /* skip */ }
  }

  return results.sort((a, b) => b.fileName.localeCompare(a.fileName))
}
