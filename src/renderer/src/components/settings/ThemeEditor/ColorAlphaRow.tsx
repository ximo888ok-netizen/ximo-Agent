import { useRef, useState, useEffect } from 'react'
import { parseRgba, toRgbaStr, toHex, hexWithOpacity, hexToRgb } from './css-value-parsers'

/**
 * ColorAlphaRow — 取色器 + 透明度滑块
 *
 * 用于 rgba(r, g, b, a) 格式的颜色变量。
 * 用户通过取色器选颜色、滑块调透明度，无需手写 CSS。
 */
export function ColorAlphaRow({
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
  const parts = parseRgba(value)
  const hex = toHex(value)
  const colorInputRef = useRef<HTMLInputElement>(null)
  const [hexForPicker, setHexForPicker] = useState(hex)

  useEffect(() => {
    setHexForPicker(toHex(value))
  }, [value])

  const handleColorChange = (newHex: string): void => {
    onChange(hexWithOpacity(newHex, parts.a))
  }

  const handleOpacityChange = (newOpacity: number): void => {
    onChange(hexWithOpacity(hex, newOpacity))
  }

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-text-primary">{label}</p>
          {desc && <p className="text-[10px] text-text-muted truncate">{desc}</p>}
        </div>
        <button
          onClick={() => colorInputRef.current?.click()}
          className="relative h-7 w-7 shrink-0 rounded-md border border-border overflow-hidden transition-transform hover:scale-105"
          style={{ backgroundColor: value }}
          title="点击选色"
        >
          <input
            ref={colorInputRef}
            type="color"
            value={hexForPicker}
            onChange={(e) => handleColorChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </button>
      </div>

      {/* 透明度滑块 */}
      <div className="mt-1.5 flex items-center gap-2">
        <span className="w-10 text-[10px] text-text-muted">透明度</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={parts.a}
          onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
          className="flex-1 accent-[var(--accent-DEFAULT)]"
        />
        <span className="w-10 text-right text-[10px] font-mono text-text-secondary">
          {Math.round(parts.a * 100)}%
        </span>
      </div>
    </div>
  )
}
