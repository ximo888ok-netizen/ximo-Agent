import { useState, useEffect, useRef, useCallback } from 'react'
import { Zap } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import type { ReasoningEffort } from '@shared/types'

/** 思考强度调节器 — 点击向上展开横向滑块，支持拖拽 */
const EFFORT_LEVELS: { value: ReasoningEffort; label: string; desc: string }[] = [
  { value: 'off', label: '关', desc: '不输出思维链' },
  { value: 'high', label: 'High', desc: '深度推理' },
  { value: 'max', label: 'Max', desc: '极致推理' },
  { value: 'ultra', label: 'Ultra', desc: '工程范式 + 监督审查' }
]

// 每档粒子配置：粒子数、飘散速度(s)、飘散距离(px)、Y轴抖动幅度(px)
const PARTICLE_CONFIG: Record<string, { count: number; duration: number; distance: number; ySpread: number }> = {
  off: { count: 0, duration: 0, distance: 0, ySpread: 0 },
  high: { count: 80, duration: 2.0, distance: 35, ySpread: 8 },
  max: { count: 120, duration: 1.1, distance: 50, ySpread: 12 },
  ultra: { count: 160, duration: 0.8, distance: 60, ySpread: 16 }
}

// 粒子颜色调色板 — 金色 + 青色 + 洋红，循环分配让拖尾更炫酷
const PARTICLE_PALETTE = [
  // 金色系列（3 级明度）
  'hsl(42, 95%, 62%)',
  'hsl(42, 90%, 52%)',
  'hsl(38, 85%, 72%)',
  // 青色系列（3 级明度）
  'hsl(185, 88%, 55%)',
  'hsl(185, 82%, 45%)',
  'hsl(190, 75%, 68%)',
  // 洋红/粉色系列（3 级明度）
  'hsl(330, 90%, 62%)',
  'hsl(330, 85%, 50%)',
  'hsl(335, 78%, 72%)'
]

function particleColor(index: number, _total: number): string {
  return PARTICLE_PALETTE[index % PARTICLE_PALETTE.length]
}

export function ReasoningSlider(): React.ReactElement {
  const effort = useStore((s) => s.settings?.reasoningEffort ?? 'high')
  const updateSettings = useStore((s) => s.updateSettings)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  // 顺序：off=0, high=1, max=2, ultra=3，从左到右强度递增
  const currentIndex = EFFORT_LEVELS.findIndex((l) => l.value === effort)

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // 根据鼠标位置算出最近的档位
  const getLevelFromX = useCallback((clientX: number): ReasoningEffort => {
    if (!trackRef.current) return effort
    const rect = trackRef.current.getBoundingClientRect()
    const padding = 16 // px-4
    const innerWidth = rect.width - padding * 2
    const x = clientX - rect.left - padding
    const ratio = Math.max(0, Math.min(1, x / innerWidth))
    const index = Math.round(ratio * (EFFORT_LEVELS.length - 1))
    return EFFORT_LEVELS[Math.min(index, EFFORT_LEVELS.length - 1)].value
  }, [effort])

  // 拖拽事件
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent): void => {
      const newLevel = getLevelFromX(e.clientX)
      if (newLevel !== useStore.getState().settings?.reasoningEffort) {
        void updateSettings({ reasoningEffort: newLevel })
      }
    }
    const onUp = (): void => setDragging(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [dragging, getLevelFromX, updateSettings])

  const currentLabel = EFFORT_LEVELS[currentIndex].label
  const fillPercent = (currentIndex / (EFFORT_LEVELS.length - 1)) * 100
  const config = PARTICLE_CONFIG[effort] ?? PARTICLE_CONFIG.off

  return (
    <div className="relative" ref={ref}>
      {/* 触发按钮 */}
      <button
        onClick={() => setOpen(!open)}
        className={`chip flex cursor-pointer items-center gap-1 px-2 py-1 text-[11px] transition-all duration-200 active:scale-95 ${
          open
            ? 'border-accent/40 text-accent bg-accent/8'
            : effort === 'off'
              ? 'text-text-muted hover:text-text-secondary'
              : effort === 'ultra'
                ? 'border-accent/40 text-accent bg-accent/15 shadow-[0_0_10px_color-mix(in_srgb,var(--theme-color)_30%,transparent)]'
                : effort === 'max'
                  ? 'border-accent/30 text-accent bg-accent/10'
                  : 'text-text-secondary hover:text-text-primary hover:border-border-hover'
        }`}
        title="思考强度"
      >
        <Zap size={11} className={effort !== 'off' ? 'text-accent' : ''} />
        <span>{currentLabel}</span>
      </button>

      {/* 向上展开的横向滑块面板 */}
      {open && (
        <div className="absolute bottom-full right-0 mb-2 rounded-xl border border-border-subtle bg-bg-elevated shadow-glass animate-fade-scale">
          <div className="px-3 py-1.5 text-[10px] text-text-muted border-b border-border-subtle text-center">
            思考强度
          </div>

          {/* 横向滑块区域 */}
          <div className="px-4 pt-4 pb-2" style={{ width: '280px' }} ref={trackRef}>
            {/* 横向轨道 — 胶囊瓶子 */}
            <div className="relative overflow-hidden rounded-full" style={{ height: '32px' }}>
              {/* 背景轨道 — 瓶子外壳 */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[18px] rounded-full bg-border/40 border border-border-subtle" />
              {/* 渐变填充轨道 — 液体 */}
              {currentIndex > 0 && (
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-[18px] rounded-full transition-all duration-300 ease-out-quart"
                  style={{
                    width: `${fillPercent}%`,
                    background: `linear-gradient(to right, color-mix(in srgb, var(--theme-color) 50%, transparent), var(--theme-color), color-mix(in srgb, hsl(42, 95%, 62%) 40%, var(--theme-color)))`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.2), 0 0 10px color-mix(in srgb, var(--theme-color) 35%, transparent)`
                  }}
                />
              )}

              {/* 刻度档位圆点（不可拖，仅指示位置） */}
              {EFFORT_LEVELS.map((level, i) => {
                const isFilled = i <= currentIndex
                const leftPercent = (i / (EFFORT_LEVELS.length - 1)) * 100
                return (
                  <span
                    key={level.value}
                    className="absolute top-1/2 rounded-full pointer-events-none transition-all duration-300"
                    style={{
                      left: `${leftPercent}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    <span className={`block rounded-full ${
                      i === currentIndex
                        ? 'h-1.5 w-1.5 bg-white/80'
                        : isFilled
                          ? 'h-1 w-1 bg-white/50'
                          : 'h-1 w-1 bg-border'
                    }`} />
                  </span>
                )
              })}

              {/* 可拖拽的圆点手柄 */}
              <div
                className="absolute top-1/2 cursor-grab active:cursor-grabbing"
                style={{
                  left: `${fillPercent}%`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 10,
                }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
              >
                {/* 粒子拖尾 */}
                {config.count > 0 && (
                  <span className="pointer-events-none" style={{ position: 'absolute', top: '50%', left: 0, width: 0, height: 0, overflow: 'visible' }}>
                    {Array.from({ length: config.count }).map((_, pi) => {
                      const seed = pi * 137.5
                      const yOffset = Math.sin(seed) * config.ySpread
                      const sizeBase = Math.max(1, 3.5 - (pi / config.count) * 2.5)
                      const delay = (pi / config.count) * config.duration * 0.9 + Math.cos(seed) * 0.05
                      const color = particleColor(pi, config.count)
                      return (
                        <span
                          key={pi}
                          className="rounded-full"
                          style={{
                            position: 'absolute',
                            width: `${sizeBase}px`,
                            height: `${sizeBase}px`,
                            top: 0,
                            left: `${-6 - (pi % 12) * 2.5}px`,
                            background: color,
                            boxShadow: `0 0 ${Math.max(1, 3 - (pi / config.count) * 2)}px ${color}`,
                            animation: `effortParticle ${config.duration}s ${delay}s ease-out infinite both`,
                            '--ep-y': `${yOffset}px`,
                            '--ep-dist': `${config.distance}px`,
                          } as React.CSSProperties}
                        />
                      )
                    })}
                  </span>
                )}
                <span
                  className={`rounded-full transition-all duration-200 ease-out-quart ${
                    effort !== 'off'
                      ? `h-6 w-6 bg-accent shadow-[0_0_14px_color-mix(in_srgb,var(--theme-color)_60%,transparent)] animate-reasoning-pulse-${effort}`
                      : 'h-5 w-5 bg-border'
                  }`}
                  style={{ display: 'block' }}
                />
              </div>
            </div>

            {/* 档位标签 */}
            <div className="relative mt-1" style={{ height: '14px' }}>
              {EFFORT_LEVELS.map((level, i) => {
                const isCurrent = level.value === effort
                const leftPercent = (i / (EFFORT_LEVELS.length - 1)) * 100
                return (
                  <button
                    key={level.value}
                    onClick={() => void updateSettings({ reasoningEffort: level.value })}
                    className="absolute top-0 text-[10px] font-medium transition-colors"
                    style={{ left: `${leftPercent}%`, transform: 'translateX(-50%)' }}
                  >
                    <span className={isCurrent ? 'text-accent' : 'text-text-muted hover:text-text-secondary'}>
                      {level.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
