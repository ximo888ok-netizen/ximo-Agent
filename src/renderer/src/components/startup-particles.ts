/**
 * 启动动画粒子系统 — 从 StartupAnimation.tsx 提取
 *
 * 包含配色主题、粒子接口、粒子生成函数
 */

import type { TransitionAnimationFile } from '@shared/types'

/** 配色主题定义 */
export const COLOR_THEMES = {
  rose:    { hueMin: 335, hueRange: 25,  satMin: 65, satRange: 20, lightMin: 48, lightRange: 22 },
  ocean:   { hueMin: 170, hueRange: 50,  satMin: 60, satRange: 25, lightMin: 45, lightRange: 20 },
  gold:    { hueMin: 40,  hueRange: 15,  satMin: 70, satRange: 25, lightMin: 50, lightRange: 20 },
  aurora:  { hueMin: 0,   hueRange: 360, satMin: 60, satRange: 30, lightMin: 50, lightRange: 20 }
} as const

export type BurstStyle = 'rose' | 'fireworks' | 'confetti' | 'fade' | 'aura' | 'lightfall' | 'custom'
export type ColorTheme = keyof typeof COLOR_THEMES

export interface Particle {
  tx: number; ty: number; size: number; rotation: number; delay: number
  hue: number; sat: number; light: number
  ox?: number; oy?: number
  cw?: number; ch?: number
  maxScale?: number
  auraDuration?: number
  streakH?: number
  curveX?: number
  customVars?: Record<string, string>
}

function rand(min: number, max: number): number { return min + Math.random() * (max - min) }

/** 生成粒子 — 根据 style 和 theme */
export function generateParticles(count: number, style: BurstStyle, theme: ColorTheme, burstDuration: number): Particle[] {
  const t = COLOR_THEMES[theme]
  if (style === 'fade' || count === 0) return []

  // 光环（魔法光环）：同心圆环从中心扩张
  if (style === 'aura') {
    const ringCount = Math.min(count, 12)
    const ringDur = Math.round(burstDuration * 0.55)
    const stagger = Math.round((burstDuration - ringDur) / Math.max(ringCount - 1, 1) * 0.85)
    return Array.from({ length: ringCount }, (_, i) => {
      const ratio = ringCount > 1 ? i / (ringCount - 1) : 0
      return { tx: 0, ty: 0, size: 30 + i * 22, maxScale: 5 + i * 0.6, rotation: 0, delay: i * stagger, auraDuration: ringDur, hue: 300 - ratio * 117, sat: 100, light: 63 }
    })
  }

  // 光瀑：垂直光带从顶部下落
  if (style === 'lightfall') {
    const lfColors = [
      { hue: 221, sat: 100, light: 83 },
      { hue: 252, sat: 100, light: 58 },
      { hue: 304, sat: 100, light: 80 },
    ]
    return Array.from({ length: count }, (_, i) => {
      const c = lfColors[i % 3]
      const tx = rand(-window.innerWidth / 2 - 50, window.innerWidth / 2 + 50)
      const halfW = window.innerWidth / 2
      const normPos = halfW > 0 ? tx / halfW : 0
      const curveX = normPos * rand(14, 24)
      return { tx, ty: window.innerHeight + rand(100, 400), size: 0, rotation: 0, delay: rand(0, 800), hue: c.hue + rand(-4, 4), sat: c.sat, light: c.light, cw: rand(3, 10), streakH: rand(80, 300), curveX }
    })
  }

  if (style === 'confetti') {
    return Array.from({ length: count }, () => ({
      tx: rand(-window.innerWidth / 2 - 100, window.innerWidth / 2 + 100),
      ty: rand(window.innerHeight / 2 + 100, window.innerHeight / 2 + 400),
      size: 0, rotation: rand(-720, 720), delay: rand(0, 600),
      hue: rand(t.hueMin, t.hueMin + t.hueRange), sat: rand(t.satMin, t.satMin + t.satRange), light: rand(t.lightMin, t.lightMin + t.lightRange),
      cw: rand(6, 14), ch: rand(10, 24)
    }))
  }

  if (style === 'fireworks') {
    const burstCount = Math.max(3, Math.floor(count / 25))
    return Array.from({ length: count }, (_, i) => {
      const burstIdx = i % burstCount
      const angle = (i / count) * Math.PI * 2 + rand(-0.3, 0.3)
      const distance = rand(80, 350)
      const burstAngle = (burstIdx / burstCount) * Math.PI * 2
      const ox = Math.cos(burstAngle) * rand(100, 300)
      const oy = Math.sin(burstAngle) * rand(80, 200)
      return { tx: ox + Math.cos(angle) * distance, ty: oy + Math.sin(angle) * distance, size: rand(3, 8), rotation: 0, delay: rand(0, 500), hue: rand(t.hueMin, t.hueMin + t.hueRange), sat: rand(t.satMin, t.satMin + t.satRange), light: rand(t.lightMin, t.lightMin + t.lightRange), ox, oy }
    })
  }

  // 默认：玫瑰花瓣
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + rand(-0.25, 0.25)
    const distance = rand(200, 650)
    return { tx: Math.cos(angle) * distance, ty: Math.sin(angle) * distance, size: rand(18, 50), rotation: rand(-360, 360), delay: rand(0, 450), hue: rand(t.hueMin, t.hueMin + t.hueRange), sat: rand(t.satMin, t.satMin + t.satRange), light: rand(t.lightMin, t.lightMin + t.lightRange) }
  })
}

/** 生成自定义转场粒子 — 从动画文件的 vars 模板渲染 */
export function generateCustomParticles(count: number, anim: TransitionAnimationFile): Particle[] {
  const varEntries = Object.entries(anim.vars)
  return Array.from({ length: count }, (_, i) => {
    const customVars: Record<string, string> = {}
    for (const [key, range] of varEntries) {
      const [min, max, unit] = range
      const val = min + Math.random() * (max - min)
      customVars[key] = `${val}${unit}`
    }
    return {
      tx: 0, ty: 0, size: 0, rotation: 0,
      delay: varEntries.some(([k]) => k === '--delay') ? parseFloat(customVars['--delay']) || 0 : Math.random() * 500,
      hue: 0, sat: 0, light: 0, customVars,
    }
  })
}

/** 解析自定义转场动画文件（从 JSON 字符串） */
export function parseCustomAnimation(jsonStr?: string): TransitionAnimationFile | null {
  if (!jsonStr) return null
  try {
    const parsed = JSON.parse(jsonStr) as TransitionAnimationFile
    if (!parsed.particleClass || !parsed.css || !parsed.vars) return null
    return parsed
  } catch {
    return null
  }
}
