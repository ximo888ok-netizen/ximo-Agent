import { useState, useEffect } from 'react'

// 系统字体缓存 — 模块级变量负责同会话内缓存，localStorage 负责跨会话持久化
const FONTS_CACHE_KEY = 'cached-system-fonts'
const FONTS_CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 天后过期，确保字体列表不会太陈旧
let _cachedFonts: string[] | null = null

/** 从 localStorage 读取缓存的字体列表（含 TTL 检查） */
function readFontCache(): string[] | null {
  try {
    const raw = localStorage.getItem(FONTS_CACHE_KEY)
    if (!raw) return null
    const { fonts, time } = JSON.parse(raw) as { fonts: string[]; time: number }
    if (Date.now() - time < FONTS_CACHE_TTL) return fonts
  } catch { /* ignore */ }
  return null
}

/** 将字体列表写入 localStorage */
function writeFontCache(fonts: string[]): void {
  try {
    localStorage.setItem(FONTS_CACHE_KEY, JSON.stringify({ fonts, time: Date.now() }))
  } catch { /* ignore */ }
}

/**
 * 自定义 hook：加载系统字体列表。
 * 初始化顺序：模块级缓存 → localStorage → 空（仅首次打开或缓存过期时才发起 IPC）。
 * @param enabled 是否需要加载字体（例如开屏动画开启时才加载）
 */
export function useSystemFonts(enabled: boolean): { fonts: string[]; loading: boolean } {
  const [fonts, setFonts] = useState<string[]>(() => {
    if (_cachedFonts) return _cachedFonts
    const stored = readFontCache()
    if (stored) { _cachedFonts = stored; return stored }
    return []
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled || fonts.length > 0 || loading) return
    setLoading(true)
    window.api.fonts.list().then(fetched => {
      _cachedFonts = fetched
      writeFontCache(fetched)
      setFonts(fetched)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [enabled, fonts.length, loading])

  return { fonts, loading }
}
