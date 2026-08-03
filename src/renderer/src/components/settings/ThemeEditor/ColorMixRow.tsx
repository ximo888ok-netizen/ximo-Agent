import { useRef, useState, useEffect } from 'react'
import { Link2, Unlink } from 'lucide-react'
import { parseColorMix, toColorMixStr, toHex, type BlendTarget } from './css-value-parsers'

/**
 * ColorMixRow — 跟随主题色开关 + 百分比滑块 + 混合目标选择
 *
 * 用于 color-mix(in srgb, var(--theme-color) X%, target) 格式的变量。
 * - 开启「跟随主题色」时：滑块控制百分比，按钮选择混合目标
 * - 关闭时：直接用取色器选自定义颜色
 */
export function ColorMixRow({
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
  const parts = parseColorMix(value)
  const colorInputRef = useRef<HTMLInputElement>(null)
  const [hexForPicker, setHexForPicker] = useState(parts.customColor)

  useEffect(() => {
    const p = parseColorMix(value)
    setHexForPicker(p.customColor)
  }, [value])

  const handleToggleLinked = (): void => {
    onChange(toColorMixStr({ ...parts, linked: !parts.linked }))
  }

  const handlePercentageChange = (pct: number): void => {
    onChange(toColorMixStr({ ...parts, linked: true, percentage: pct }))
  }

  const handleBlendTargetChange = (target: BlendTarget): void => {
    onChange(toColorMixStr({ ...parts, linked: true, blendTarget: target }))
  }

  const handleCustomColor = (newHex: string): void => {
    onChange(toColorMixStr({ ...parts, linked: false, customColor: newHex }))
  }

  const blendTargets: { value: BlendTarget; label: string; color: string }[] = [
    { value: 'black', label: '黑色', color: '#000000' },
    { value: 'white', label: '白色', color: '#ffffff' },
    { value: 'transparent', label: '透明', color: 'transparent' },
  ]

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-text-primary">{label}</p>
          {desc && <p className="text-[10px] text-text-muted truncate">{desc}</p>}
        </div>

        {/* 跟随主题色开关 */}
        <button
          onClick={handleToggleLinked}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
            parts.linked
              ? 'bg-accent/15 text-accent'
              : 'border border-border text-text-muted hover:text-text-secondary'
          }`}
          title={parts.linked ? '当前跟随主题色，点击切换为自定义' : '当前自定义颜色，点击切换为跟随主题色'}
        >
          {parts.linked ? <Link2 size={11} /> : <Unlink size={11} />}
          {parts.linked ? '跟随主题色' : '自定义'}
        </button>
      </div>

      {parts.linked ? (
        <>
          {/* 百分比滑块 */}
          <div className="mt-1.5 flex items-center gap-2">
            <span className="w-10 text-[10px] text-text-muted">浓度</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={parts.percentage}
              onChange={(e) => handlePercentageChange(parseInt(e.target.value))}
              className="flex-1 accent-[var(--accent-DEFAULT)]"
            />
            <span className="w-10 text-right text-[10px] font-mono text-text-secondary">
              {parts.percentage}%
            </span>
          </div>

          {/* 混合目标选择 */}
          <div className="mt-1 flex items-center gap-2">
            <span className="w-10 text-[10px] text-text-muted">混合</span>
            <div className="flex gap-1">
              {blendTargets.map((t) => (
                <button
                  key={t.value}
                  onClick={() => handleBlendTargetChange(t.value)}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                    parts.blendTarget === t.value
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full border border-border"
                    style={{
                      backgroundColor: t.color,
                      backgroundImage: t.color === 'transparent'
                        ? 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%)'
                        : undefined,
                      backgroundSize: t.color === 'transparent' ? '4px 4px' : undefined,
                    }}
                  />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
        <div className="mt-1.5 flex items-center gap-2">
          <button
            onClick={() => colorInputRef.current?.click()}
            className="relative h-7 w-7 rounded-md border border-border overflow-hidden transition-transform hover:scale-105"
            style={{ backgroundColor: parts.customColor }}
            title="点击选色"
          >
            <input
              ref={colorInputRef}
              type="color"
              value={hexForPicker}
              onChange={(e) => handleCustomColor(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </button>
          <span className="text-[10px] font-mono text-text-secondary">{toHex(parts.customColor)}</span>
        </div>
        </>
      )}
    </div>
  )
}
