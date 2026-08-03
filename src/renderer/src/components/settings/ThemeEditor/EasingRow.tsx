import { useState } from 'react'
import { parseEasing, toEasingStr, EASING_PRESETS, type EasingParts } from './css-value-parsers'

/**
 * EasingRow — 可视化缓动曲线选择器
 *
 * 用于 cubic-bezier(x1, y1, x2, y2) 格式的变量。
 * 用户通过点击预设曲线卡片选择，或拖动 SVG 曲线控制点微调。
 */
export function EasingRow({
  label,
  desc,
  value,
  onChange,
}: {
  label: string
  desc?: string
  value: string
  onChange: (v: string) => void
}): React.ReactElement {
  const parts = parseEasing(value)
  const [showCustom, setShowCustom] = useState(false)

  // 判断当前值是否匹配某个预设
  const matchingPreset = EASING_PRESETS.find(
    (p) => p.value.x1 === parts.x1 && p.value.y1 === parts.y1 && p.value.x2 === parts.x2 && p.value.y2 === parts.y2,
  )

  const handlePresetClick = (presetParts: EasingParts): void => {
    onChange(toEasingStr(presetParts))
    setShowCustom(false)
  }

  const handleControlPointChange = (point: 'p1' | 'p2', axis: 'x' | 'y', val: number): void => {
    const updated = { ...parts }
    if (point === 'p1') {
      if (axis === 'x') updated.x1 = val
      else updated.y1 = val
    } else {
      if (axis === 'x') updated.x2 = val
      else updated.y2 = val
    }
    onChange(toEasingStr(updated))
  }

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-text-primary">{label}</p>
          {desc && <p className="text-[10px] text-text-muted truncate">{desc}</p>}
        </div>
        {/* 当前选中的预设名 */}
        {matchingPreset && (
          <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
            {matchingPreset.name}
          </span>
        )}
      </div>

      {/* 预设卡片网格 */}
      <div className="mt-1.5 grid grid-cols-4 gap-1">
        {EASING_PRESETS.map((preset) => {
          const isActive = matchingPreset?.name === preset.name
          return (
            <button
              key={preset.name}
              onClick={() => handlePresetClick(preset.value)}
              className={`flex flex-col items-center rounded-md border p-1.5 transition-all ${
                isActive
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-border-hover'
              }`}
              title={preset.desc}
            >
              <EasingCurvePreview parts={preset.value} size={32} active={isActive} />
              <span className={`mt-0.5 text-[9px] ${isActive ? 'text-accent' : 'text-text-muted'}`}>
                {preset.name}
              </span>
            </button>
          )
        })}
      </div>

      {/* 自定义微调 */}
      <button
        onClick={() => setShowCustom(!showCustom)}
        className="mt-1.5 text-[10px] text-text-muted transition-colors hover:text-accent"
      >
        {showCustom ? '收起微调' : '自定义微调'}
      </button>

      {showCustom && (
        <div className="mt-1.5 rounded-md border border-border-subtle bg-bg-elevated/50 p-2">
          <div className="flex items-center gap-3">
            {/* SVG 曲线预览 */}
            <EasingCurvePreview parts={parts} size={64} active showGrid />

            {/* 4个数值滑块 */}
            <div className="flex-1 space-y-1">
              {([
                { label: '起点 X', key: 'x1', value: parts.x1, point: 'p1' as const, axis: 'x' as const },
                { label: '起点 Y', key: 'y1', value: parts.y1, point: 'p1' as const, axis: 'y' as const },
                { label: '终点 X', key: 'x2', value: parts.x2, point: 'p2' as const, axis: 'x' as const },
                { label: '终点 Y', key: 'y2', value: parts.y2, point: 'p2' as const, axis: 'y' as const },
              ]).map((s) => (
                <div key={s.key} className="flex items-center gap-1.5">
                  <span className="w-12 text-[9px] text-text-muted">{s.label}</span>
                  <input
                    type="range"
                    min={-0.5}
                    max={1.5}
                    step={0.01}
                    value={s.value}
                    onChange={(e) => handleControlPointChange(s.point, s.axis, parseFloat(e.target.value))}
                    className="flex-1 accent-[var(--accent-DEFAULT)]"
                  />
                  <span className="w-8 text-right text-[9px] font-mono text-text-secondary">
                    {s.value.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** SVG 缓动曲线预览 */
function EasingCurvePreview({
  parts,
  size,
  active,
  showGrid,
}: {
  parts: EasingParts
  size: number
  active?: boolean
  showGrid?: boolean
}): React.ReactElement {
  const pad = 4
  const inner = size - pad * 2
  // 将 bezier 坐标(0~1, 可超出) 映射到 SVG 坐标
  const mapX = (x: number): number => pad + Math.max(0, Math.min(1, x)) * inner
  // Y 轴翻转：CSS bezier 中 y=0 是顶部，SVG 中 y=0 是顶部，但缓动曲线中 y=1 是终点
  const mapY = (y: number): number => pad + (1 - Math.max(-0.2, Math.min(1.2, y))) * inner

  const path = `M ${mapX(0)} ${mapY(0)} C ${mapX(parts.x1)} ${mapY(parts.y1)}, ${mapX(parts.x2)} ${mapY(parts.y2)}, ${mapX(1)} ${mapY(1)}`

  return (
    <svg width={size} height={size} className="overflow-visible">
      {showGrid && (
        <>
          <line x1={pad} y1={pad} x2={pad + inner} y2={pad} stroke="var(--border-subtle)" strokeWidth={0.5} />
          <line x1={pad} y1={pad + inner} x2={pad + inner} y2={pad + inner} stroke="var(--border-subtle)" strokeWidth={0.5} />
          <line x1={pad} y1={pad} x2={pad} y2={pad + inner} stroke="var(--border-subtle)" strokeWidth={0.5} />
          <line x1={pad + inner} y1={pad} x2={pad + inner} y2={pad + inner} stroke="var(--border-subtle)" strokeWidth={0.5} />
        </>
      )}
      <path
        d={path}
        fill="none"
        stroke={active ? 'var(--accent-DEFAULT)' : 'var(--text-muted)'}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* 控制点 */}
      <circle cx={mapX(parts.x1)} cy={mapY(parts.y1)} r={1.5} fill={active ? 'var(--accent-DEFAULT)' : 'var(--text-muted)'} />
      <circle cx={mapX(parts.x2)} cy={mapY(parts.y2)} r={1.5} fill={active ? 'var(--accent-DEFAULT)' : 'var(--text-muted)'} />
    </svg>
  )
}
