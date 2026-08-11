import { useEffect, useRef } from 'react'
import type { CursorTrailStyle, CursorClickStyle } from '@shared/types'
import { TRAIL_STYLES, CLICK_STYLES, findTrailStyle, findClickStyle } from './cursor-style-config'
import '../styles/cursor-effects.css'

/**
 * CursorEffects — 鼠标跟随 + 点击特效全局层
 *
 * 根据 settings 中的配置在全局监听 mousemove / pointerdown，
 * 动态生成带 CSS 动画的特效元素，动画结束后移除。
 * 全层 pointer-events:none，不阻断任何交互。
 *
 * 样式定义统一来自 cursor-style-config.ts（单一数据源）。
 *
 * 配置项：
 * - cursorEffectsEnabled   总开关
 * - cursorTrailStyle       跟随样式（23 种）
 * - cursorClickStyle       点击样式（22 种）
 * - cursorEffectColor      自定义颜色（留空跟随主题色）
 * - cursorEffectScale      尺寸缩放 0.5~2
 * - cursorEffectIntensity  强度（生成频率倍数）
 * - cursorTrailCount       同屏最大跟随粒子数（防堆积）
 * - cursorClickCount       点击爆发粒子数
 * - cursorEffectDuration   特效时长 ms
 */
export function CursorEffects({
  enabled,
  trailStyle,
  clickStyle,
  color,
  scale,
  intensity,
  trailCount,
  clickCount,
  duration,
}: {
  enabled: boolean
  trailStyle: CursorTrailStyle
  clickStyle: CursorClickStyle
  color: string
  scale: number
  intensity: number
  trailCount: number
  clickCount: number
  duration: number
}): React.ReactElement | null {
  const layerRef = useRef<HTMLDivElement>(null)
  const cfgRef = useRef({ trailStyle, clickStyle, color, scale, intensity, trailCount, clickCount, duration })
  cfgRef.current = { trailStyle, clickStyle, color, scale, intensity, trailCount, clickCount, duration }

  // 在 layer 上注入 CSS 变量（颜色 + 时长），所有特效元素自动继承
  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    layer.style.setProperty('--ce-color', color || '')
    layer.style.setProperty('--ce-duration', `${duration}ms`)
  }, [color, duration])

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    if (!enabled) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let rafId = 0
    let lastX = -9999
    let lastY = -9999
    let lastTime = 0
    let pendingX = 0
    let pendingY = 0
    let activeCount = 0

    // 随机辅助
    const rand = (min: number, max: number): number => min + Math.random() * (max - min)

    // 彩虹色 — 沿色相环随机取色
    const rainbowColor = (): string => `hsl(${Math.floor(rand(0, 360))} 85% 62%)`

    /** 同屏元素计数 — 超过上限时移除最早的，防堆积 */
    const trackActive = (el: HTMLElement): void => {
      activeCount++
      const limit = cfgRef.current.trailCount
      if (activeCount > limit) {
        const kids = layer.children
        if (kids.length > 0) {
          kids[0].remove()
          activeCount--
        }
      }
      el.addEventListener('animationend', () => {
        el.remove()
        activeCount = Math.max(0, activeCount - 1)
      }, { once: true })
    }

    /** 创建单个特效元素（配置驱动） */
    const createEl = (
      x: number,
      y: number,
      def: { cls: string; glyph?: string; direction?: boolean; rainbow?: boolean; rotate?: boolean },
      scaleVal: number,
      randV: (min: number, max: number) => number
    ): HTMLDivElement => {
      const el = document.createElement('div')
      const cls = def.glyph ? `ce-el ce-glyph ce-${def.cls}` : `ce-el ce-${def.cls}`
      el.className = cls
      el.style.left = `${x}px`
      el.style.top = `${y}px`

      // 尺寸缩放 — 使用独立 scale 属性，避免被动画 keyframes 的 transform 覆盖
      if (scaleVal !== 1) el.style.scale = String(scaleVal)

      // emoji 字形特效
      if (def.glyph) el.textContent = def.glyph

      // 方向类特效需要随机位移方向（--ce-dx / --ce-dy）
      if (def.direction) {
        const angle = randV(0, Math.PI * 2)
        const dist = randV(28, 60) * cfgRef.current.intensity
        el.style.setProperty('--ce-dx', `${Math.cos(angle) * dist}px`)
        el.style.setProperty('--ce-dy', `${Math.sin(angle) * dist - 18}px`)
      }
      // 旋转类特效
      if (def.rotate) {
        el.style.setProperty('--ce-rot', `${randV(90, 200)}deg`)
      }
      // 彩虹类随机颜色
      if (def.rainbow) {
        el.style.setProperty('--ce-rainbow-color', rainbowColor())
      }

      layer.appendChild(el)
      trackActive(el)
      return el
    }

    /** 跟随特效 — 每次移动生成粒子（intensity 控制数量） */
    const spawnTrail = (x: number, y: number): void => {
      const cfg = cfgRef.current
      const def = findTrailStyle(cfg.trailStyle)
      if (!def) return
      // 每帧生成数量：基础 1 + intensity 加成
      const n = Math.max(1, Math.round(1 + (cfg.intensity - 1) * 0.5))
      for (let i = 0; i < n; i++) {
        createEl(x + rand(-3, 3), y + rand(-3, 3), def, cfg.scale, rand)
      }
    }

    /** 点击特效 — 根据样式 kind 生成不同形态 */
    const spawnClick = (x: number, y: number): void => {
      const cfg = cfgRef.current
      const def = findClickStyle(cfg.clickStyle)
      if (!def) return

      if (def.kind === 'ring') {
        // 环状类 — 2~3 层错峰扩散
        const layers = def.value === 'ripple' || def.value === 'shockwave' ? 3 : 2
        for (let i = 0; i < layers; i++) {
          const el = createEl(x, y, def, cfg.scale, rand)
          el.style.animationDelay = `${(i * 0.12 * cfg.intensity).toFixed(2)}s`
          if (def.value === 'ripple') el.style.borderWidth = `${Math.max(1, 2 - i * 0.6)}px`
        }
      } else if (def.kind === 'single') {
        // 单体类 — 1~2 个独立元素爆发
        const count = cfg.intensity >= 1.5 ? 2 : 1
        for (let i = 0; i < count; i++) {
          const el = createEl(x + rand(-6, 6), y + rand(-6, 6), def, cfg.scale, rand)
          if (i === 1) el.style.animationDelay = `${(0.08 * cfg.intensity).toFixed(2)}s`
        }
      } else {
        // 多粒子类（multi）— clickCount × intensity 个粒子四散
        const count = Math.max(6, Math.round(cfg.clickCount * cfg.intensity))
        for (let i = 0; i < count; i++) {
          createEl(x, y, def, cfg.scale, rand)
        }
      }
    }

    const onMove = (e: MouseEvent): void => {
      pendingX = e.clientX
      pendingY = e.clientY
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        const cfg = cfgRef.current
        const now = performance.now()
        const dist = Math.hypot(pendingX - lastX, pendingY - lastY)
        // 距离/时间节流：移动超 24px 或停顿超 120ms 才生成，避免堆积
        if (dist > 24 / cfg.intensity || now - lastTime > 120) {
          spawnTrail(pendingX, pendingY)
          lastX = pendingX
          lastY = pendingY
          lastTime = now
        }
      })
    }

    const onClick = (e: MouseEvent): void => {
      spawnClick(e.clientX, e.clientY)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('pointerdown', onClick, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('pointerdown', onClick)
      if (rafId) cancelAnimationFrame(rafId)
      layer.innerHTML = ''
    }
  }, [enabled])

  if (!enabled) return null

  return <div ref={layerRef} className="cursor-effects-layer" aria-hidden="true" />
}

// 导出配置供 UI 使用（避免重复定义）
export { TRAIL_STYLES, CLICK_STYLES }
