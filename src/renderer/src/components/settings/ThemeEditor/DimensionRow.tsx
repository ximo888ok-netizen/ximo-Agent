import { useMemo, useCallback } from 'react'
import { parseDimension } from './css-value-parsers'

/**
 * DimensionRow — 数值 + 单位滑块编辑器
 *
 * 用于 px / deg / 无单位 的数值型 CSS 变量。
 * 用户通过滑块调整数值，也可在输入框中精确输入。
 */
export function DimensionRow({
  label,
  desc,
  value,
  onChange,
  unit,
  min = 0,
  max = 100,
  step = 1,
}: {
  label: string
  desc?: string
  value: string
  onChange: (v: string) => void
  unit: string
  min?: number
  max?: number
  step?: number
}): React.ReactElement {
  // 缓存解析结果，避免每次渲染重新解析
  const parts = useMemo(() => parseDimension(value), [value])

  // clamp 到 [min, max] 防止滑块跳变
  const clampedValue = Math.min(max, Math.max(min, parts.value))

  const handleChange = useCallback((newVal: number): void => {
    const clamped = Math.min(max, Math.max(min, newVal))
    onChange(`${clamped}${unit}`)
  }, [onChange, unit, min, max])

  // 无单位 0~1 范围显示百分比
  const isPercentage = unit === '' && min >= 0 && max <= 1
  const displayValue = isPercentage
    ? `${Math.round(parts.value * 100)}%`
    : `${parts.value}${unit}`

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-text-primary">{label}</p>
          {desc && <p className="text-[10px] text-text-muted truncate">{desc}</p>}
        </div>
        {/* 数值输入框 — 支持精确输入 */}
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={parts.value}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!Number.isNaN(v)) handleChange(v)
          }}
          className="w-14 shrink-0 rounded border border-border bg-bg-input px-1.5 py-0.5 text-right text-[10px] font-mono text-text-secondary focus:border-accent focus:outline-none"
        />
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={clampedValue}
          onChange={(e) => handleChange(parseFloat(e.target.value))}
          className="flex-1 accent-[var(--accent-DEFAULT)]"
        />
        <span className="w-12 shrink-0 text-right text-[10px] font-mono text-text-secondary">
          {displayValue}
        </span>
      </div>
    </div>
  )
}
