import { useEffect, useState, useMemo } from 'react'
import type { AppSettings } from '@shared/types'
import './StartupAnimation.css'
import {
  COLOR_THEMES,
  type BurstStyle, type ColorTheme, type Particle,
  generateParticles, generateCustomParticles, parseCustomAnimation
} from './startup-particles'

/**
 * 启动加载动画 — 可配置的逐字描边 + 爆发转场
 *
 * 阶段 1 drawing：草书逐字描边→填充
 * 阶段 2 burst  ：草书溶解 + 粒子爆发 + 闪光 + 主界面组合显现
 */
export function StartupAnimation({
  onComplete,
  children,
  config
}: {
  onComplete: () => void
  children?: React.ReactNode
  config?: Pick<AppSettings,
    'startupText' | 'startupTextSize' | 'startupStrokeDuration' | 'startupFontFamily' |
    'burstTransitionEnabled' | 'burstTransitionStyle' |
    'burstParticleCount' | 'burstDuration' | 'burstColorTheme' |
    'customTransitionAnimation'
  >
}): React.ReactElement {
  const text = config?.startupText ?? 'ximo-Agent'
  const fontSize = config?.startupTextSize ?? 76
  const strokeDuration = config?.startupStrokeDuration ?? 460
  const fontFamily = config?.startupFontFamily ?? "'Dancing Script', cursive"
  const burstEnabled = config?.burstTransitionEnabled ?? true
  const burstStyle = (config?.burstTransitionStyle ?? 'rose') as BurstStyle
  const particleCount = config?.burstParticleCount ?? 120
  const burstDuration = config?.burstDuration ?? 2500
  const colorTheme = (config?.burstColorTheme ?? 'rose') as ColorTheme
  const customAnimJson = config?.customTransitionAnimation

  const STAGGER = Math.round(strokeDuration * 0.78)
  const FILL_DURATION = Math.round(strokeDuration * 0.87)
  const TAIL_HOLD = Math.round(strokeDuration * 1.09)
  const chars = text.split('')
  const totalDraw = (chars.length - 1) * STAGGER + strokeDuration + FILL_DURATION + TAIL_HOLD

  const [phase, setPhase] = useState<'drawing' | 'burst'>('drawing')

  // 解析自定义动画
  const customAnim = useMemo(() => parseCustomAnimation(customAnimJson), [customAnimJson])

  // 注入自定义 CSS（仅 custom 模式且有动画文件时）
  useEffect(() => {
    if (burstStyle === 'custom' && customAnim) {
      const id = `custom-transition-css`
      let el = document.getElementById(id) as HTMLStyleElement | null
      if (!el) {
        el = document.createElement('style')
        el.id = id
        document.head.appendChild(el)
      }
      el.textContent = customAnim.css
      return () => {
        if (el && el.parentElement) el.parentElement.removeChild(el)
      }
    }
  }, [burstStyle, customAnim])

  // 生成粒子
  const particles = useMemo(() => {
    if (!burstEnabled) return []
    if (burstStyle === 'custom' && customAnim) {
      return generateCustomParticles(particleCount, customAnim)
    }
    return generateParticles(particleCount, burstStyle, colorTheme, burstDuration)
  }, [burstEnabled, particleCount, burstStyle, colorTheme, burstDuration, customAnim])

  useEffect(() => {
    if (burstEnabled) {
      const t1 = setTimeout(() => setPhase('burst'), totalDraw)
      const t2 = setTimeout(onComplete, totalDraw + burstDuration)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    } else {
      // 无爆发转场：描边完成后短暂等待再淡入
      const t1 = setTimeout(() => setPhase('burst'), totalDraw)
      const t2 = setTimeout(onComplete, totalDraw + 800)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
  }, [totalDraw, burstDuration, burstEnabled, onComplete])

  const showBurst = phase === 'burst'
  const dissolveClass = showBurst
    ? (burstEnabled ? 'animate-calligraphy-dissolve' : 'animate-calligraphy-fade')
    : ''

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ '--burst-duration': `${burstDuration}ms` } as React.CSSProperties}
    >
      {/* ── Layer 1: 主界面 — burst 期间从微缩组合显现 ── */}
      <div
        className={`absolute inset-0 ${showBurst ? 'animate-interface-assemble' : 'opacity-0'}`}
        style={showBurst ? undefined : { contentVisibility: 'hidden' }}
      >
        {children}
      </div>

      {/* ── Layer 2: 草书 SVG ── */}
      <div
        className={`absolute inset-0 flex items-center justify-center ${dissolveClass}`}
        style={{ willChange: showBurst ? 'opacity, transform, filter' : undefined }}
      >
        <svg
          viewBox="0 0 440 140"
          className="w-[min(78vw,640px)] h-auto"
          style={{ filter: 'drop-shadow(0 0 20px var(--glow-color))' }}
        >
          <defs>
            <linearGradient id="suGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--accent-DEFAULT)" />
              <stop offset="55%" stopColor="var(--accent-hover)" />
              <stop offset="100%" stopColor="var(--orb-3, #a882ff)" />
            </linearGradient>
          </defs>

          {chars.map((ch, i) => (
            <text
              key={i}
              x={15 + i * 36}
              y={105}
              fontFamily={fontFamily}
              fontSize={fontSize}
              fontWeight="700"
              fill="url(#suGrad)"
              fillOpacity="0"
              stroke="url(#suGrad)"
              strokeWidth="0.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1}
              style={{
                willChange: 'stroke-dashoffset, fill-opacity',
                animation:
                  `startupStroke ${strokeDuration}ms linear ${i * STAGGER}ms forwards,` +
                  `startupFill ${FILL_DURATION}ms ease-out ${i * STAGGER + strokeDuration - 80}ms forwards`,
              }}
            >
              {ch}
            </text>
          ))}
        </svg>
      </div>

      {/* ── Layer 3: 中心闪光（仅爆发模式） ── */}
      {showBurst && burstEnabled && (
        <div className="absolute inset-0 pointer-events-none animate-burst-flash" />
      )}

      {/* ── Layer 4: 粒子爆发 ── */}
      {showBurst && burstEnabled && burstStyle !== 'fade' && particles.length > 0 && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {burstStyle === 'rose' && particles.map((p, i) => (
            <div
              key={i}
              className="burst-particle"
              style={{
                '--tx': `${p.tx}px`, '--ty': `${p.ty}px`,
                '--size': `${p.size}px`, '--rot': `${p.rotation}deg`,
                '--delay': `${p.delay}ms`,
                '--hue': `${p.hue}`, '--sat': `${p.sat}%`, '--light': `${p.light}%`,
              } as React.CSSProperties}
            />
          ))}
          {burstStyle === 'fireworks' && particles.map((p, i) => (
            <div
              key={i}
              className="burst-firework"
              style={{
                '--tx': `${p.tx}px`, '--ty': `${p.ty}px`,
                '--ox': `${p.ox}px`, '--oy': `${p.oy}px`,
                '--size': `${p.size}px`,
                '--delay': `${p.delay}ms`,
                '--hue': `${p.hue}`, '--sat': `${p.sat}%`, '--light': `${p.light}%`,
              } as React.CSSProperties}
            />
          ))}
          {burstStyle === 'confetti' && particles.map((p, i) => (
            <div
              key={i}
              className="burst-confetti"
              style={{
                '--tx': `${p.tx}px`, '--ty': `${p.ty}px`,
                '--cw': `${p.cw}px`, '--ch': `${p.ch}px`,
                '--rot': `${p.rotation}deg`,
                '--delay': `${p.delay}ms`,
                '--hue': `${p.hue}`, '--sat': `${p.sat}%`, '--light': `${p.light}%`,
              } as React.CSSProperties}
            />
          ))}
          {burstStyle === 'aura' && particles.map((p, i) => (
            <div
              key={i}
              className="burst-aura"
              style={{
                '--size': `${p.size}px`,
                '--max-scale': `${p.maxScale}`,
                '--delay': `${p.delay}ms`,
                '--aura-duration': `${p.auraDuration}ms`,
                '--hue': `${p.hue}`, '--sat': `${p.sat}%`, '--light': `${p.light}%`,
              } as React.CSSProperties}
            />
          ))}
          {burstStyle === 'lightfall' && particles.map((p, i) => (
            <div
              key={i}
              className="burst-lightfall"
              style={{
                '--tx': `${p.tx}px`, '--ty': `${p.ty}px`,
                '--cw': `${p.cw}px`, '--streak-h': `${p.streakH}px`,
                '--curve-x': `${p.curveX}deg`,
                '--delay': `${p.delay}ms`,
                '--hue': `${p.hue}`, '--sat': `${p.sat}%`, '--light': `${p.light}%`,
              } as React.CSSProperties}
            />
          ))}
          {burstStyle === 'custom' && customAnim && particles.map((p, i) => (
            <div
              key={i}
              className={customAnim.particleClass}
              style={p.customVars as React.CSSProperties}
            />
          ))}
        </div>
      )}
    </div>
  )
}
