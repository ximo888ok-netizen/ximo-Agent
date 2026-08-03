import { useRef, useState, useEffect } from 'react'
import { Plus, Trash2, Layers } from 'lucide-react'
import { parseShadow, toShadowStr, toHex, hexWithOpacity, type ShadowLayer } from './css-value-parsers'

/**
 * ShadowRow — 多层阴影可视化编辑器
 *
 * 用于 box-shadow 格式的变量。
 * 每层阴影可通过滑块调整 X/Y 偏移、模糊半径，通过取色器+滑块调整颜色和透明度。
 * 支持添加/删除阴影层。
 */
export function ShadowRow({
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
  const layers = parseShadow(value)

  const updateLayer = (index: number, patch: Partial<ShadowLayer>): void => {
    const updated = layers.map((l, i) => i === index ? { ...l, ...patch } : l)
    onChange(toShadowStr(updated))
  }

  const addLayer = (): void => {
    onChange(toShadowStr([...layers, { x: 0, y: 4, blur: 12, spread: 0, color: '#000000', opacity: 0.1 }]))
  }

  const removeLayer = (index: number): void => {
    onChange(toShadowStr(layers.filter((_, i) => i !== index)))
  }

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-text-primary">{label}</p>
          {desc && <p className="text-[10px] text-text-muted truncate">{desc}</p>}
        </div>
        <button
          onClick={addLayer}
          className="flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-text-muted transition-colors hover:border-accent hover:text-accent"
          title="添加阴影层"
        >
          <Plus size={11} /> 添加层
        </button>
      </div>

      {/* 阴影层列表 */}
      <div className="mt-1.5 space-y-2">
        {layers.map((layer, i) => (
          <ShadowLayerEditor
            key={i}
            index={i}
            layer={layer}
            onChange={(patch) => updateLayer(i, patch)}
            onRemove={() => removeLayer(i)}
          />
        ))}
        {layers.length === 0 && (
          <p className="text-[10px] text-text-muted py-1">无阴影层，点击"添加层"创建</p>
        )}
      </div>
    </div>
  )
}

function ShadowLayerEditor({
  index,
  layer,
  onChange,
  onRemove,
}: {
  index: number
  layer: ShadowLayer
  onChange: (patch: Partial<ShadowLayer>) => void
  onRemove: () => void
}): React.ReactElement {
  const colorInputRef = useRef<HTMLInputElement>(null)
  const [hexForPicker, setHexForPicker] = useState(layer.color)

  useEffect(() => {
    setHexForPicker(toHex(layer.color))
  }, [layer.color])

  const sliders: { label: string; key: keyof ShadowLayer; min: number; max: number; step: number; unit: string }[] = [
    { label: 'X 偏移', key: 'x', min: -50, max: 50, step: 1, unit: 'px' },
    { label: 'Y 偏移', key: 'y', min: -50, max: 50, step: 1, unit: 'px' },
    { label: '模糊', key: 'blur', min: 0, max: 80, step: 1, unit: 'px' },
  ]

  return (
    <div className="rounded-md border border-border-subtle bg-bg-elevated/50 p-2">
      {/* 层标题 + 删除 */}
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1 text-[10px] font-medium text-text-muted">
          <Layers size={10} /> 第 {index + 1} 层
        </span>
        <button
          onClick={onRemove}
          className="rounded p-0.5 text-text-muted transition-colors hover:text-red-400"
          title="删除此层"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* 颜色 + 透明度 */}
      <div className="flex items-center gap-2 mb-1.5">
        <button
          onClick={() => colorInputRef.current?.click()}
          className="relative h-6 w-6 shrink-0 rounded-md border border-border overflow-hidden transition-transform hover:scale-105"
          style={{ backgroundColor: hexWithOpacity(layer.color, layer.opacity) }}
          title="阴影颜色"
        >
          <input
            ref={colorInputRef}
            type="color"
            value={hexForPicker}
            onChange={(e) => onChange({ color: e.target.value })}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </button>
        <span className="text-[10px] text-text-muted">透明度</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={layer.opacity}
          onChange={(e) => onChange({ opacity: parseFloat(e.target.value) })}
          className="flex-1 accent-[var(--accent-DEFAULT)]"
        />
        <span className="w-8 text-right text-[10px] font-mono text-text-secondary">
          {Math.round(layer.opacity * 100)}%
        </span>
      </div>

      {/* X/Y/模糊 滑块 */}
      <div className="space-y-1">
        {sliders.map((s) => (
          <div key={s.key} className="flex items-center gap-2">
            <span className="w-12 text-[10px] text-text-muted">{s.label}</span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={layer[s.key] as number}
              onChange={(e) => onChange({ [s.key]: parseFloat(e.target.value) } as Partial<ShadowLayer>)}
              className="flex-1 accent-[var(--accent-DEFAULT)]"
            />
            <span className="w-10 text-right text-[10px] font-mono text-text-secondary">
              {layer[s.key] as number}{s.unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
