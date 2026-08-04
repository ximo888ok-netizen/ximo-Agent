import { useRef, useEffect, useState, memo } from 'react'
import { RotateCcw } from 'lucide-react'
import type { ThemeVarMeta } from './theme-schema'
import { toHex } from './css-value-parsers'
import { ColorAlphaRow } from './ColorAlphaRow'
import { ColorMixRow } from './ColorMixRow'
import { ShadowRow } from './ShadowRow'
import { EasingRow } from './EasingRow'
import { DimensionRow } from './DimensionRow'
import { SelectRow } from './SelectRow'

/**
 * VarRow — 统一行组件，根据 meta.type 自动分发到对应的可视化编辑器
 *
 * 所有子组件都是纯 UI 操作（取色器、滑块、按钮），用户无需写任何 CSS 代码。
 * memo 优化：当父组件 re-render 时，只有 value 真正变化的行才会 re-render。
 */
export const VarRow = memo(function VarRow({
  meta,
  value,
  defaultValue,
  onChange,
  onReset,
}: {
  meta: ThemeVarMeta
  value: string
  defaultValue: string
  onChange: (v: string) => void
  onReset: () => void
}): React.ReactElement {
  const isModified = value !== defaultValue

  return (
    <div className="group relative">
      {/* 变量编辑器 */}
      <VarEditor meta={meta} value={value} onChange={onChange} />

      {/* 重置按钮 — 悬浮显示 */}
      {isModified && (
        <button
          onClick={onReset}
          className="absolute right-0 top-0 rounded p-0.5 text-text-muted opacity-0 transition-all hover:text-accent group-hover:opacity-100"
          title="恢复默认"
        >
          <RotateCcw size={11} />
        </button>
      )}
    </div>
  )
})

/** 根据类型分发到具体的编辑器组件 */
function VarEditor({
  meta,
  value,
  onChange,
}: {
  meta: ThemeVarMeta
  value: string
  onChange: (v: string) => void
}): React.ReactElement {
  switch (meta.type) {
    case 'color':
      return <ColorOnlyRow label={meta.label} desc={meta.desc} value={value} onChange={onChange} />
    case 'color-alpha':
      return <ColorAlphaRow label={meta.label} desc={meta.desc} value={value} onChange={onChange} />
    case 'color-mix':
      return <ColorMixRow label={meta.label} desc={meta.desc} value={value} onChange={onChange} />
    case 'shadow':
      return <ShadowRow label={meta.label} desc={meta.desc} value={value} onChange={onChange} />
    case 'easing':
      return <EasingRow label={meta.label} desc={meta.desc} value={value} onChange={onChange} />
    case 'dimension':
      return <DimensionRow label={meta.label} desc={meta.desc} value={value} onChange={onChange} unit={meta.unit ?? ''} min={meta.min} max={meta.max} step={meta.step} />
    case 'select':
      return <SelectRow label={meta.label} desc={meta.desc} value={value} onChange={onChange} options={meta.options ?? []} />
    default:
      return <ColorOnlyRow label={meta.label} desc={meta.desc} value={value} onChange={onChange} />
  }
}

/** 纯色取色器（Hex 格式变量） */
function ColorOnlyRow({
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
  const colorInputRef = useRef<HTMLInputElement>(null)
  const [hexForPicker, setHexForPicker] = useState(toHex(value))

  useEffect(() => {
    setHexForPicker(toHex(value))
  }, [value])

  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-text-primary">{label}</p>
        {desc && <p className="text-[10px] text-text-muted truncate">{desc}</p>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => colorInputRef.current?.click()}
          className="relative h-7 w-7 rounded-md border border-border overflow-hidden transition-transform hover:scale-105"
          style={{ backgroundColor: value }}
          title="点击选色"
        >
          <input
            ref={colorInputRef}
            type="color"
            value={hexForPicker}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </button>
      </div>
    </div>
  )
}
