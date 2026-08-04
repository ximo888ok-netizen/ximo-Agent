/**
 * CSS 值解析与序列化工具
 *
 * 将复杂的 CSS 值（rgba / color-mix / box-shadow / cubic-bezier）
 * 解析为结构化数据，再将用户操作的结果序列化回 CSS 字符串。
 * 用户无需理解 CSS 语法，全部通过 UI 组件操作。
 */

// ─── rgba 解析 ──────────────────────────────

export interface RgbaParts {
  r: number
  g: number
  b: number
  a: number
}

/** 将任意 CSS 颜色值转换为 hex（用于取色器回显） */
export function toHex(cssColor: string): string {
  const v = cssColor.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return '#' + v.slice(1).split('').map((c) => c + c).join('')
  }
  try {
    const ctx = document.createElement('canvas').getContext('2d')
    if (!ctx) return '#000000'
    ctx.fillStyle = v
    const computed = ctx.fillStyle
    if (computed.startsWith('#')) return computed
    const m = computed.match(/(\d+)/g)
    if (m && m.length >= 3) {
      return '#' + [m[0], m[1], m[2]].map((n) => parseInt(n).toString(16).padStart(2, '0')).join('')
    }
  } catch { /* ignore */ }
  return '#000000'
}

/** hex → { r, g, b } */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = toHex(hex).slice(1)
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

/** 解析 rgba(r, g, b, a) 或 rgb(r, g, b) 或 #hex → RgbaParts */
export function parseRgba(cssStr: string): RgbaParts {
  const v = cssStr.trim()

  // rgba(r, g, b, a)
  const rgbaMatch = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/)
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1]),
      g: parseInt(rgbaMatch[2]),
      b: parseInt(rgbaMatch[3]),
      a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1,
    }
  }

  // hex
  if (v.startsWith('#')) {
    const { r, g, b } = hexToRgb(v)
    return { r, g, b, a: 1 }
  }

  // 其他颜色名等
  try {
    const { r, g, b } = hexToRgb(toHex(v))
    return { r, g, b, a: 1 }
  } catch { /* ignore */ }

  return { r: 0, g: 0, b: 0, a: 1 }
}

/** RgbaParts → rgba(r, g, b, a) 字符串 */
export function toRgbaStr(parts: RgbaParts): string {
  const { r, g, b, a } = parts
  if (a >= 1) return `rgb(${r}, ${g}, ${b})`
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

/** hex + opacity → rgba 字符串 */
export function hexWithOpacity(hex: string, opacity: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

// ─── color-mix 解析 ──────────────────────────

export type BlendTarget = 'black' | 'white' | 'transparent'

export interface ColorMixParts {
  /** 是否跟随主题色（true = color-mix 模式） */
  linked: boolean
  /** 混合百分比 0~100 */
  percentage: number
  /** 混合目标 */
  blendTarget: BlendTarget
  /** 自定义颜色（linked=false 时使用） */
  customColor: string
}

/** 解析 color-mix(...) 或纯 hex → ColorMixParts */
export function parseColorMix(cssStr: string): ColorMixParts {
  const v = cssStr.trim()

  // color-mix(in srgb, var(--theme-color) X%, target)
  const match = v.match(/color-mix\(\s*in\s+srgb\s*,\s*var\(--theme-color\)\s+(\d+)%\s*,\s*(black|white|transparent)\s*\)/)
  if (match) {
    return {
      linked: true,
      percentage: parseInt(match[1]),
      blendTarget: match[2] as BlendTarget,
      customColor: '#3b82f6',
    }
  }

  // 纯 hex 色
  return {
    linked: false,
    percentage: 50,
    blendTarget: 'white',
    customColor: toHex(v),
  }
}

/** ColorMixParts → CSS 字符串 */
export function toColorMixStr(parts: ColorMixParts): string {
  if (!parts.linked) return parts.customColor
  return `color-mix(in srgb, var(--theme-color) ${parts.percentage}%, ${parts.blendTarget})`
}

// ─── box-shadow 解析 ─────────────────────────

export interface ShadowLayer {
  /** X 偏移 (px) */
  x: number
  /** Y 偏移 (px) */
  y: number
  /** 模糊半径 (px) */
  blur: number
  /** 扩散半径 (px)，通常为 0 */
  spread: number
  /** 阴影颜色（hex） */
  color: string
  /** 不透明度 0~1 */
  opacity: number
}

/** 解析 box-shadow 字符串 → ShadowLayer[] */
export function parseShadow(cssStr: string): ShadowLayer[] {
  const v = cssStr.trim()
  if (!v || v === 'none') return []

  // 按逗号分割层（但 rgba 内的逗号不算）
  const layers: ShadowLayer[] = []
  // 用正则匹配每个阴影层：offsetX offsetY blur [spread] color
  const layerRegex = /(-?[\d.]+px)\s+(-?[\d.]+px)\s+(-?[\d.]+px)\s*(?:(-?[\d.]+px)\s*)?(rgba?\([^)]+\)|#[0-9a-fA-F]+|\w+)/g
  let match: RegExpExecArray | null

  while ((match = layerRegex.exec(v)) !== null) {
    const rgba = parseRgba(match[5])
    layers.push({
      x: parseFloat(match[1]),
      y: parseFloat(match[2]),
      blur: parseFloat(match[3]),
      spread: match[4] ? parseFloat(match[4]) : 0,
      color: toHex(match[5]),
      opacity: rgba.a,
    })
  }

  // 如果正则没匹配到，尝试简化解析
  if (layers.length === 0 && v !== 'none') {
    layers.push({ x: 0, y: 8, blur: 32, spread: 0, color: '#000000', opacity: 0.12 })
  }

  return layers
}

/** ShadowLayer[] → CSS box-shadow 字符串 */
export function toShadowStr(layers: ShadowLayer[]): string {
  if (layers.length === 0) return 'none'
  return layers.map((l) => {
    const { r, g, b } = hexToRgb(l.color)
    return `${l.x}px ${l.y}px ${l.blur}px${l.spread ? ` ${l.spread}px` : ''} rgba(${r}, ${g}, ${b}, ${l.opacity})`
  }).join(', ')
}

// ─── cubic-bezier 解析 ───────────────────────

export interface EasingParts {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** 预设缓动曲线 */
export const EASING_PRESETS: { name: string; desc: string; value: EasingParts }[] = [
  { name: '线性', desc: '匀速运动', value: { x1: 0, y1: 0, x2: 1, y2: 1 } },
  { name: '缓入', desc: '先慢后快', value: { x1: 0.42, y1: 0, x2: 1, y2: 1 } },
  { name: '缓出', desc: '先快后慢', value: { x1: 0, y1: 0, x2: 0.58, y2: 1 } },
  { name: '缓入缓出', desc: '两端慢中间快', value: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 } },
  { name: 'iOS 标准', desc: 'iOS 系统动画', value: { x1: 0.32, y1: 0.72, x2: 0, y2: 1 } },
  { name: 'Expo 缓出', desc: '极速缓出', value: { x1: 0.16, y1: 1, x2: 0.3, y2: 1 } },
  { name: 'Quart 缓出', desc: '强力缓出', value: { x1: 0.25, y1: 1, x2: 0.5, y2: 1 } },
  { name: '弹性', desc: '轻微回弹', value: { x1: 0.68, y1: -0.55, x2: 0.27, y2: 1.55 } },
]

/** 解析 cubic-bezier(x1, y1, x2, y2) → EasingParts */
export function parseEasing(cssStr: string): EasingParts {
  const v = cssStr.trim()
  const match = v.match(/cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/)
  if (match) {
    return {
      x1: parseFloat(match[1]),
      y1: parseFloat(match[2]),
      x2: parseFloat(match[3]),
      y2: parseFloat(match[4]),
    }
  }
  // linear 等关键词 → 默认线性
  return { x1: 0, y1: 0, x2: 1, y2: 1 }
}

/** EasingParts → cubic-bezier(x1, y1, x2, y2) 字符串 */
export function toEasingStr(parts: EasingParts): string {
  return `cubic-bezier(${parts.x1}, ${parts.y1}, ${parts.x2}, ${parts.y2})`
}
