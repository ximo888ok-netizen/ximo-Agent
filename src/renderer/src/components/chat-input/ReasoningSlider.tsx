import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Zap, HelpCircle } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { isReasoningCapable } from '@renderer/lib/providers'
import {
  LEVEL_COUNT,
  REASONING_LEVELS,
  effortIndex,
  isThinking,
  normalizeEffort
} from '@renderer/lib/reasoning-levels'
import { deriveAccentTokens } from '@renderer/lib/accent'
import type { ReasoningEffort } from '@shared/types'
import { ReasoningMosaicTrack } from './ReasoningMosaicTrack'

/** 轨道高度与圆点直径 —— 圆点内嵌在轨道里（对应参考设计的"瓶子 + 内嵌白球"） */
const TRACK_H = 30
const KNOB_D = 24

/**
 * 思考强度调节器
 *
 * 视觉语言：轨道填充是一块**点阵马赛克**，档位越高颗粒越细、越密、越亮、流动越快
 * —— 「思考强度 = 计算的分辨率」。动态由 ReasoningMosaicTrack（canvas）承担，
 * 面板本身只负责布局、交互与可访问性。
 */
export function ReasoningSlider(): React.ReactElement {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const isStreaming = useStore((s) => s.isStreaming)

  const effort: ReasoningEffort = normalizeEffort(settings?.reasoningEffort)
  const idx = effortIndex(effort)
  const thinking = isThinking(effort)
  // 当前服务商不支持 reasoning 参数时禁用调节（主进程会剥离这些参数）
  const reasoningCapable = isReasoningCapable(settings)

  const [open, setOpen] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [trackW, setTrackW] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [pointerRatio, setPointerRatio] = useState<number | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const sliderRef = useRef<HTMLDivElement>(null)

  /**
   * 点阵颜色用**派生后的强调色填充支**而不是原始主色 ——
   * 原始主色可能是近白/亮黄这类承载不了视觉重量的颜色，
   * 派生支保证无论选什么主色，点阵在两种主题下都够深、看得见。
   * 与全局强调色同一套派生逻辑（lib/accent.ts），不另造一套。
   */
  const mosaicColor = useMemo(() => {
    const raw = settings?.themeColor
    if (!raw) return '#3b82f6'
    const tokens = deriveAccentTokens(raw, settings?.theme === 'light' ? 'light' : 'dark')
    return tokens['--accent-fill'] ?? raw
  }, [settings?.themeColor, settings?.theme])

  /* 轨道宽度 —— 圆点要内嵌，所以位置计算依赖实测宽度 */
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const measure = (): void => setTrackW(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])

  /* 点击外部关闭；Escape 关闭 */
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  /* 展开后把焦点交给滑块 —— 键盘用户可以立刻用方向键调节 */
  useEffect(() => {
    if (open) sliderRef.current?.focus({ preventScroll: true })
  }, [open])

  const commit = useCallback(
    (next: ReasoningEffort): void => {
      if (!reasoningCapable) return
      if (next === normalizeEffort(useStore.getState().settings?.reasoningEffort)) return
      // 联动思考模式开关：off 档位关思考，其余档位开（与设置页 ToggleRow 行为对称）
      void updateSettings(
        next === 'off'
          ? { reasoningEffort: next, thinkingMode: false }
          : { reasoningEffort: next, thinkingMode: true }
      )
    },
    [reasoningCapable, updateSettings]
  )

  /* 圆点的可移动行程：两端各留出半个圆点，保证圆点始终完整可见 */
  const travel = Math.max(0, trackW - KNOB_D)
  const knobLeft = KNOB_D / 2 + (idx / (LEVEL_COUNT - 1)) * travel
  const mosaicFill = trackW > 0 ? knobLeft / trackW : 0

  /** 指针 x → 轨道比例（0–1，已按圆点行程归一化） */
  const ratioFromX = useCallback(
    (clientX: number): number => {
      const el = trackRef.current
      if (!el || travel <= 0) return 0
      const x = clientX - el.getBoundingClientRect().left - KNOB_D / 2
      return Math.max(0, Math.min(1, x / travel))
    },
    [travel]
  )

  const levelFromX = useCallback(
    (clientX: number): ReasoningEffort =>
      REASONING_LEVELS[Math.round(ratioFromX(clientX) * (LEVEL_COUNT - 1))].value,
    [ratioFromX]
  )

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!reasoningCapable) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    setPointerRatio(ratioFromX(e.clientX))
    commit(levelFromX(e.clientX))
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragging) return
    setPointerRatio(ratioFromX(e.clientX))
    commit(levelFromX(e.clientX))
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragging) return
    setDragging(false)
    setPointerRatio(null)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!reasoningCapable) return
    let next = idx
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, idx - 1)
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(LEVEL_COUNT - 1, idx + 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = LEVEL_COUNT - 1
    else return
    e.preventDefault()
    commit(REASONING_LEVELS[next].value)
  }

  const current = REASONING_LEVELS[idx]

  return (
    <div className="relative" ref={rootRef}>
      {/* 触发按钮 */}
      <button
        onClick={() => {
          if (reasoningCapable) setOpen(!open)
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`chip flex cursor-pointer items-center gap-1 px-2 py-1 text-caption transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] duration-fast active:scale-95 ${
          !reasoningCapable
            ? 'opacity-40 cursor-not-allowed text-text-muted'
            : open
              ? 'border-accent/40 text-accent bg-accent/8'
              : !thinking
                ? 'text-text-muted hover:text-text-secondary'
                : 'border-accent/30 text-accent bg-accent/10'
        }`}
        title={reasoningCapable ? '思考强度' : '当前服务商不支持思考参数'}
      >
        <Zap size={11} className={thinking ? 'text-accent' : ''} />
        <span>{current.label}</span>
      </button>

      {/* 向上展开的面板 */}
      {open && (
        <div
          role="dialog"
          aria-label="思考强度"
          className="absolute bottom-full right-0 mb-2 w-[280px] rounded-panel border border-border-subtle bg-bg-elevated p-3 shadow-glass animate-fade-scale"
        >
          {/* 标题行：当前档位 + 说明开关 */}
          <div className="mb-3 flex items-center gap-1.5">
            <span className="text-sm text-text-secondary">推理</span>
            <span className="text-sm font-semibold text-accent">{current.label}</span>
            <button
              onClick={() => setShowHelp((v) => !v)}
              aria-label="档位说明"
              aria-expanded={showHelp}
              className={`focus-ring ml-auto grid h-4 w-4 place-items-center rounded-full border transition-colors duration-fast active:scale-[0.97] ${
                showHelp
                  ? 'border-accent/50 text-accent'
                  : 'border-border text-text-quaternary hover:border-accent/40 hover:text-accent'
              }`}
            >
              <HelpCircle size={11} />
            </button>
          </div>

          {showHelp && (
            <p className="mb-3 rounded-card bg-bg-surface-soft px-2 py-1.5 text-caption leading-relaxed text-text-muted animate-fade-in">
              {current.desc}
            </p>
          )}

          {/* 轴标：左"更快" ← → 右"更聪明" */}
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-caption text-text-tertiary">更快</span>
            <span
              aria-hidden
              className="h-px flex-1"
              style={{
                background: `linear-gradient(to right, transparent, color-mix(in srgb, ${mosaicColor} 45%, transparent))`
              }}
            />
            <span className="text-caption text-text-tertiary">更聪明</span>
          </div>

          {/* 轨道 —— 点阵马赛克 + 内嵌圆点。容器层负责"内凹槽 + 顶光罩"（见 effects.css） */}
          <div
            ref={trackRef}
            className="mosaic-track relative overflow-hidden rounded-full"
            style={{ height: `${TRACK_H}px` }}
          >
            <ReasoningMosaicTrack
              // 关闭档不铺点阵 —— 圆点停在最左端，整条轨道只留中性底纹，
              // 让"未启用"在读感上就与"低档"区分开
              fill={thinking ? mosaicFill : 0}
              level={idx}
              active={isStreaming}
              pointerX={pointerRatio}
              themeColor={mosaicColor}
              className="absolute inset-0"
            />
            {/* 顶光玻璃罩 —— 叠在点阵之上，给表面一层受光的壳 */}
            <span aria-hidden className="mosaic-sheen pointer-events-none absolute inset-0 rounded-full" />

            {/* 滑块本体：透明命中层 + 凸起圆点 */}
            <div
              ref={sliderRef}
              role="slider"
              tabIndex={reasoningCapable ? 0 : -1}
              aria-label="思考强度"
              aria-orientation="horizontal"
              aria-valuemin={1}
              aria-valuemax={LEVEL_COUNT}
              aria-valuenow={idx + 1}
              aria-valuetext={`${current.label} —— ${current.desc}`}
              aria-disabled={!reasoningCapable}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={handleKeyDown}
              className={`focus-ring absolute inset-0 ${
                reasoningCapable
                  ? dragging
                    ? 'cursor-grabbing'
                    : 'cursor-grab'
                  : 'cursor-not-allowed'
              }`}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 rounded-full transition-[width,height,left,box-shadow,background] duration-base ease-out-quart"
                style={{
                  left: `${knobLeft}px`,
                  width: `${dragging ? KNOB_D + 3 : KNOB_D}px`,
                  height: `${dragging ? KNOB_D + 3 : KNOB_D}px`,
                  transform: 'translate(-50%, -50%)',
                  // 圆点始终是白的 —— 它是"读数指针"，不参与主题化，
                  // 否则浅色主色下会和点阵糊在一起。
                  // 立体感靠三件事：左上受光的径向渐变 + 1px 描边 + 双层投影（近处硬、远处散）
                  background: thinking
                    ? 'radial-gradient(circle at 34% 26%, #ffffff 0%, #f4f6f9 58%, #dfe4ea 100%)'
                    : 'radial-gradient(circle at 34% 26%, #ffffff 0%, #f0f1f3 60%, #dadde2 100%)',
                  border: `1px solid ${
                    thinking ? `color-mix(in srgb, ${mosaicColor} 30%, transparent)` : 'rgba(0,0,0,0.08)'
                  }`,
                  boxShadow: thinking
                    ? `0 1px 2px rgba(0,0,0,0.18), 0 3px 8px -1px rgba(0,0,0,0.26), 0 0 ${dragging ? 12 : 7}px color-mix(in srgb, ${mosaicColor} ${dragging ? 45 : 30}%, transparent)`
                    : '0 1px 2px rgba(0,0,0,0.14), 0 2px 5px -1px rgba(0,0,0,0.2)',
                  opacity: thinking ? 1 : 0.82
                }}
              />
            </div>
          </div>

          {/* 档位标签 —— 与轨道同宽，5 档等距 */}
          <div className="mt-2 flex justify-between">
            {REASONING_LEVELS.map((level, i) => {
              const isCurrent = i === idx
              return (
                <button
                  key={level.value}
                  onClick={() => commit(level.value)}
                  disabled={!reasoningCapable}
                  aria-current={isCurrent}
                  className="focus-ring rounded-control px-1 text-caption transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ minWidth: '1.6rem' }}
                >
                  <span
                    className={`inline-block transition-[color,transform] duration-fast ease-out-quart ${
                      isCurrent
                        ? 'text-accent font-semibold'
                        : 'text-text-tertiary hover:text-text-secondary'
                    }`}
                    style={{ transform: isCurrent ? 'translateY(-0.5px)' : 'none' }}
                  >
                    {level.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
