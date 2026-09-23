import chroma, { type ChromaInstance } from 'chroma-js'

/**
 * 强调色派生 —— 双支派生（fill / ink + glow）
 *
 * 背景：单一主色不可能同时满足两个互相矛盾的约束 ——
 *   · 作为**填充**要足够深，才能承载白字（≥4.5:1）
 *   · 作为**发光**要足够亮，才能在深底上看得见（≥3:1）
 * 用 chroma-js 实测过 8 个预设主色，没有一个能同时过关。
 * 因此把主色拆成两支，各自独立地只保证自己那件事：
 *
 *   填充支（fill）—— 承载白色文字/图标
 *     --accent-fill        基色
 *     --accent-fill-top    亮端（液态按钮上沿、瓷片渐变远端）
 *     --accent-fill-deep   深端（液态按钮下沿）
 *     --accent-fill-hover  悬停
 *     --accent-on-fill     前景色（恒 #fff）
 *
 *   墨色支（ink）—— 作为**文字/描边**落在页面底色上
 *     --accent-ink         正文（≥4.5:1）
 *     --accent-ink-strong  强调/悬停文字（≥7:1）
 *     --accent-ink-subtle  次级/大图标（≥3:1）
 *
 *   发光支（glow）—— 装饰性光晕，明度被归一化到固定带
 *     --theme-glow         光晕（带 alpha）
 *     --focus-ring         焦点环实色（≥3:1）
 *     --focus-ring-soft    焦点环柔和版
 *     --orb-1-c            极光环境光
 *
 * 兼容性：这些令牌全部由 JS 写在 `documentElement` 内联样式上，CSS 里
 * **不声明同名变量**（避免 var() 自引用死循环），只在消费点写
 * `var(--accent-fill, <旧算法兜底>)`。因此：
 *   · 主题包 / 自定义 CSS 未启用时 —— 派生生效
 *   · 可视化编辑器改写同名令牌 —— 后写覆盖，用户自定义优先
 *   · JS 未执行（首帧）—— 退回旧 color-mix 兜底，不会白屏
 */

export type ThemeMode = 'light' | 'dark'

/** WCAG 门槛 */
export const CONTRAST_TEXT = 4.5
export const CONTRAST_TEXT_STRONG = 7
export const CONTRAST_GRAPHIC = 3

/** 页面表面基色 —— 与 base.css 的 --bg-surface 对齐，用于墨色支对比度计算 */
export const ACCENT_SURFACE: Record<ThemeMode, string> = {
  light: '#ffffff',
  dark: '#12151c',
}

/** 填充支前景恒为白：这样仓库里所有 `bg-accent + text-white` 组合自动达标 */
export const ACCENT_ON_FILL = '#ffffff'

/** 浅底上代替白字的近黑色 —— 与 --text-primary 同一色系 */
const INK_ON_LIGHT = '#141c2b'

/** 发光支的归一化明度带 —— 让任意主色在对应底色上都能"亮起来" */
const GLOW_L: Record<ThemeMode, number> = { light: 0.5, dark: 0.62 }
const GLOW_S_FLOOR: Record<ThemeMode, number> = { light: 0.65, dark: 0.6 }
const GLOW_ALPHA: Record<ThemeMode, number> = { light: 0.42, dark: 0.55 }
const ORB_ALPHA: Record<ThemeMode, number> = { light: 0.34, dark: 0.3 }

/**
 * 在保持色相/饱和度的前提下，把明度二分到"刚好满足对比度"的位置。
 * lighter=true 往亮找（深底适用），false 往暗找（浅底适用）。
 * 找不到满足解时返回原色 —— 宁可不动，也不产生随机色。
 *
 * 两个关键细节：
 * 1. 判定用的是**量化后的值**（.hex() → 8bit）。若拿浮点 HSL 判定，边界解会在
 *    输出时被 8bit 量化蹭到门槛下方（实测出现过 4.4762 这类"差一点点"）。
 * 2. 搜索目标带 EPS 余量，给量化与后续 mix 留出空间。
 */
const CONTRAST_EPS = 0.02

function tuneLuminance(
  base: ChromaInstance,
  against: string,
  minContrast: number,
  lighter: boolean,
): ChromaInstance {
  const quantizedBase = chroma(base.hex())
  if (chroma.contrast(quantizedBase, against) >= minContrast) return quantizedBase

  const target = minContrast + CONTRAST_EPS
  const [h, s, l0] = quantizedBase.hsl()
  let lo = lighter ? l0 : 0
  let hi = lighter ? 1 : l0
  let best: ChromaInstance | null = null

  // 20 次二分 → 明度精度 ~1e-6，远高于 8bit 可辨
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    const candidate = chroma(chroma.hsl(h, s, mid).hex())
    if (chroma.contrast(candidate, against) >= target) {
      best = candidate
      if (lighter) hi = mid
      else lo = mid
    } else if (lighter) {
      lo = mid
    } else {
      hi = mid
    }
  }
  return best ?? quantizedBase
}

/** 强调色的派生结果 —— 令牌名 → CSS 值 */
export type AccentTokens = Record<string, string>

/**
 * 白字门槛：主色过亮就压暗，直到白字刚好达标。
 * 两个主题都压暗 —— 深色主题下"提亮"会让白字更糊。
 */
function deriveFill(themeColor: string, mode: ThemeMode): AccentTokens {
  const fill = tuneLuminance(chroma(themeColor), ACCENT_ON_FILL, CONTRAST_TEXT, false)

  // 亮端：往白走，但不能把白字玩丢
  const top = tuneLuminance(chroma.mix(fill, '#ffffff', 0.24), ACCENT_ON_FILL, CONTRAST_TEXT, false)
  // 深端：往黑走，对比度只会更安全，无需钳制
  const deep = chroma.mix(fill, '#000000', mode === 'dark' ? 0.52 : 0.3)
  // 悬停：往黑走。深色主题若"提亮"会被白字门槛钳回原值 —— 实测 hover 与 fill
  // 会变成同一个色（状态变化消失），所以两个主题统一压深。
  const hover = tuneLuminance(chroma.mix(fill, '#000000', 0.18), ACCENT_ON_FILL, CONTRAST_TEXT, false)

  return {
    '--accent-fill': fill.hex(),
    '--accent-fill-top': top.hex(),
    '--accent-fill-deep': deep.hex(),
    '--accent-fill-hover': hover.hex(),
    '--accent-on-fill': ACCENT_ON_FILL,
  }
}

/** 墨色支：让主色可以安全地当"文字颜色"用 */
function deriveInk(themeColor: string, mode: ThemeMode): AccentTokens {
  const base = chroma(themeColor)
  const surface = ACCENT_SURFACE[mode]
  const lighter = mode === 'dark' // 深底要把主色提亮才读得清

  return {
    '--accent-ink': tuneLuminance(base, surface, CONTRAST_TEXT, lighter).hex(),
    '--accent-ink-strong': tuneLuminance(base, surface, CONTRAST_TEXT_STRONG, lighter).hex(),
    '--accent-ink-subtle': tuneLuminance(base, surface, CONTRAST_GRAPHIC, lighter).hex(),
  }
}

/** 发光支：色相照搬，明度/饱和度归一到固定带，保证"换个主色也还是亮的" */
function deriveGlow(themeColor: string, mode: ThemeMode): AccentTokens {
  const [h, s] = chroma(themeColor).hsl()
  const normalized = chroma.hsl(h, Math.max(s, GLOW_S_FLOOR[mode]), GLOW_L[mode])
  const ring = tuneLuminance(normalized, ACCENT_SURFACE[mode], CONTRAST_GRAPHIC, mode === 'dark')

  return {
    '--theme-glow': normalized.alpha(GLOW_ALPHA[mode]).css(),
    '--focus-ring': ring.hex(),
    '--focus-ring-soft': ring.alpha(0.55).css(),
    '--orb-1-c': normalized.alpha(ORB_ALPHA[mode]).css(),
  }
}

/** 纯 6 位十六进制 —— 只有这类令牌能派生 `-rgb` 通道三元组 */
const HEX_RE = /^#[0-9a-f]{6}$/i

/**
 * 为每个纯色令牌附加 `-rgb` 通道三元组（如 `--accent-fill-rgb: 29 111 245`）。
 *
 * 为什么需要：Tailwind 3 对 `var(--x)` 形式的颜色**不生成透明度修饰类** ——
 * `bg-accent/10`、`border-accent/30`、`shadow-accent/20` 会静默丢失。
 * 只有把调色板写成 `rgb(var(--x-rgb) / <alpha-value>)` 才能让 `/10` 这类
 * 修饰符生效（实测过：函数形式会让 `.text-accent` 产出 `NaN%`，不可用）。
 */
function withRgbCompanions(tokens: AccentTokens): AccentTokens {
  const out: AccentTokens = { ...tokens }
  for (const [name, value] of Object.entries(tokens)) {
    if (!HEX_RE.test(value) || name.endsWith('-rgb')) continue
    out[`${name}-rgb`] = chroma(value).rgb().join(' ')
  }
  return out
}

/** 由主色 + 明暗模式派生全部强调色令牌。颜色非法时返回空对象（保持 CSS 兜底） */
export function deriveAccentTokens(themeColor: string, mode: ThemeMode): AccentTokens {
  if (!chroma.valid(themeColor)) return {}
  return withRgbCompanions({
    ...deriveFill(themeColor, mode),
    ...deriveInk(themeColor, mode),
    ...deriveGlow(themeColor, mode),
  })
}

/**
 * 给定底色，返回其上最易读的前景（白或近黑）。
 * 用于"色块/色板上的勾选标记"这类底色不可控的场景。
 */
export function readableOn(background: string): string {
  if (!chroma.valid(background)) return ACCENT_ON_FILL
  return chroma.contrast(background, ACCENT_ON_FILL) >= chroma.contrast(background, INK_ON_LIGHT)
    ? ACCENT_ON_FILL
    : INK_ON_LIGHT
}

/** 把令牌写到元素内联样式（内联优先级高于样式表，可被后续 setProperty 覆盖） */
export function applyAccentTokens(root: HTMLElement, tokens: AccentTokens): void {
  for (const [name, value] of Object.entries(tokens)) {
    root.style.setProperty(name, value)
  }
}

/** 清除上一次写入的令牌（切换主色/主题前调用，避免残留） */
export function clearAccentTokens(root: HTMLElement, tokens: AccentTokens): void {
  for (const name of Object.keys(tokens)) {
    root.style.removeProperty(name)
  }
}

/**
 * 供设置面板/主题编辑器做"这个主色合不合格"的自检。
 * 纯计算，不碰 DOM。
 */
export function auditAccent(themeColor: string, mode: ThemeMode): {
  ok: boolean
  fillOnWhite: number
  inkOnSurface: number
  ringOnSurface: number
  hueShift: number
} {
  if (!chroma.valid(themeColor)) {
    return { ok: false, fillOnWhite: 0, inkOnSurface: 0, ringOnSurface: 0, hueShift: 0 }
  }
  const t = deriveAccentTokens(themeColor, mode)
  const base = chroma(themeColor)
  const fill = chroma(t['--accent-fill'])
  const ink = chroma(t['--accent-ink'])
  const ring = chroma(t['--focus-ring'])

  // 色相偏移取环形最短距离（0 = 完全没跑色）
  const dh = Math.abs(fill.hsl()[0] - base.hsl()[0])
  const hueShift = Number.isFinite(dh) ? Math.round(Math.min(dh, 360 - dh)) : 0

  const fillOnWhite = chroma.contrast(fill, ACCENT_ON_FILL)
  const inkOnSurface = chroma.contrast(ink, ACCENT_SURFACE[mode])
  const ringOnSurface = chroma.contrast(ring, ACCENT_SURFACE[mode])

  return {
    ok: fillOnWhite >= CONTRAST_TEXT && inkOnSurface >= CONTRAST_TEXT && ringOnSurface >= CONTRAST_GRAPHIC,
    fillOnWhite,
    inkOnSurface,
    ringOnSurface,
    hueShift,
  }
}
