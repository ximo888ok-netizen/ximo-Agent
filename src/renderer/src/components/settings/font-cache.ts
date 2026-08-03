/** 系统字体缓存 — 模块级变量负责同会话内缓存，localStorage 负责跨会话持久化 */

const FONTS_CACHE_KEY = 'cached-system-fonts'
const FONTS_CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 天后过期

let _cachedFonts: string[] | null = null

/** 从 localStorage 读取缓存的字体列表（含 TTL 检查） */
export function readFontCache(): string[] | null {
  try {
    const raw = localStorage.getItem(FONTS_CACHE_KEY)
    if (!raw) return null
    const { fonts, time } = JSON.parse(raw) as { fonts: string[]; time: number }
    if (Date.now() - time < FONTS_CACHE_TTL) return fonts
  } catch { /* ignore */ }
  return null
}

/** 将字体列表写入 localStorage */
export function writeFontCache(fonts: string[]): void {
  try {
    localStorage.setItem(FONTS_CACHE_KEY, JSON.stringify({ fonts, time: Date.now() }))
  } catch { /* ignore */ }
}

/** 获取内存缓存（同会话内） */
export function getCachedFonts(): string[] | null {
  return _cachedFonts
}

/** 设置内存缓存 */
export function setCachedFonts(fonts: string[]): void {
  _cachedFonts = fonts
}
