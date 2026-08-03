import { useState } from 'react'
import { Minus, Plus, ChevronDown } from 'lucide-react'
// 默认设置统一从 shared/defaults 引用，主进程与渲染进程共用单一数据源
export { DEFAULT_SETTINGS as FALLBACK_SETTINGS } from '@shared/defaults'

// 主题颜色预设
export const THEME_PRESETS: { name: string; value: string }[] = [
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Orange', value: '#f97316' }
]

export type TabId = 'api' | 'model' | 'agent' | 'tools' | 'appearance' | 'about'
export type TestState = 'idle' | 'testing' | 'success' | 'error'

// 简单展示型组件从 shared-primitives 复用
export { SectionTitle, Divider, InfoCard, FeatureRow, LinkRow, DataRow } from './shared-primitives'

export function NumberInputRow({
  icon,
  label,
  desc,
  value,
  min,
  max,
  step,
  unit,
  onChange
}: {
  icon: React.ReactNode
  label: string
  desc: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (v: number) => void
}): React.ReactElement {
  const clamp = (v: number): number => Math.min(max, Math.max(min, v))
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-text-muted shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">{label}</p>
          <p className="text-xs text-text-muted truncate">{desc}</p>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onChange(clamp(value - step))}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-bg-elevated text-text-secondary hover:border-accent hover:text-accent transition-colors"
        >
          <Minus size={13} />
        </button>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = parseInt(e.target.value)
            if (!isNaN(v)) onChange(clamp(v))
          }}
          className="w-20 rounded-md border border-border bg-bg-elevated px-2 py-1 text-center text-sm font-mono text-text-primary focus:border-accent focus:outline-none"
        />
        <span className="text-xs text-text-muted w-8">{unit}</span>
        <button
          onClick={() => onChange(clamp(value + step))}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-bg-elevated text-text-secondary hover:border-accent hover:text-accent transition-colors"
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  )
}

export function CollapsibleSection({
  icon,
  title,
  desc,
  defaultOpen = false,
  children
}: {
  icon: React.ReactNode
  title: string
  desc?: string
  defaultOpen?: boolean
  children: React.ReactNode
}): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="ios-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-3.5 text-left transition-colors hover:bg-bg-elevated/50"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-accent">{icon}</span>
          <div>
            <p className="text-sm font-medium text-text-primary">{title}</p>
            {desc && <p className="text-xs text-text-muted">{desc}</p>}
          </div>
        </div>
        <ChevronDown
          size={16}
          className={`text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="border-t border-border-subtle px-3.5 py-1">
          {children}
        </div>
      )}
    </div>
  )
}

export function ModelCard({
  active,
  onClick,
  icon,
  title,
  subtitle,
  specs,
  desc
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  subtitle: string
  specs: string[]
  desc: string
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className={`ios-card p-4 text-left transition-all ${
        active
          ? 'border-accent shadow-glow'
          : 'hover:border-border-hover'
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className={active ? 'text-accent' : 'text-text-muted'}>{icon}</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            active ? 'bg-accent/20 text-accent' : 'bg-bg-base text-text-muted'
          }`}
        >
          {subtitle}
        </span>
      </div>
      <p className={`text-base font-bold ${active ? 'text-accent' : 'text-text-primary'}`}>
        {title}
      </p>
      <div className="mt-1.5 space-y-0.5">
        {specs.map((s) => (
          <p key={s} className="text-[11px] text-text-muted">
            {s}
          </p>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-text-secondary">{desc}</p>
    </button>
  )
}

export function ToggleRow({
  icon,
  label,
  desc,
  active,
  onToggle,
  activeText,
  inactiveText
}: {
  icon: React.ReactNode
  label: string
  desc: string
  active: boolean
  onToggle: () => void
  activeText: string
  inactiveText: string
}): React.ReactElement {
  return (
    <div
      className={`ios-card p-3.5 transition-all ${
        active ? 'border-accent/40' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={active ? 'text-accent' : 'text-text-muted'}>{icon}</span>
          <div>
            <p className="text-sm font-medium text-text-primary">{label}</p>
            <p className="text-xs text-text-muted">{active ? activeText : inactiveText}</p>
          </div>
        </div>
        <button
          onClick={onToggle}
          className={`relative h-6 w-10 rounded-full transition-colors duration-300 ease-out-quart ${
            active ? 'bg-accent shadow-glow' : 'bg-border'
          }`}
        >
          <div
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-300 ease-out-quart ${
              active ? 'translate-x-[18px]' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
      <p className="mt-2 text-xs text-text-muted">{desc}</p>
    </div>
  )
}
