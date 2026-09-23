import {
  Search, ArrowRight,
  type LucideIcon
} from 'lucide-react'

// 依赖图标映射
export const DEP_LABELS: Record<string, string> = {
  'motion': 'Motion',
  'gsap': 'GSAP',
  'ogl': 'OGL',
  'three': 'Three.js',
  'matter-js': 'Matter',
  '@gsap/react': 'useGSAP',
}

export type PanelTab = 'components' | 'styles'

export function CompactTab({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: LucideIcon; label: string; count: number }): React.ReactElement {
  return (
    <button onClick={onClick} className={`flex flex-1 items-center justify-center gap-1 rounded-control px-2 py-1 text-caption font-medium transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] ${active ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated-soft'}`}>
      <Icon size={13} />
      {label}
      <span className={`rounded-full px-1 text-caption ${active ? 'bg-accent/20' : 'bg-bg-elevated-soft'}`}>{count}</span>
    </button>
  )
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }): React.ReactElement {
  return (
    <div className="relative">
      <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-control border border-border-subtle bg-bg-elevated-soft pl-7 pr-2 py-1 text-caption text-text-primary placeholder:text-text-muted focus:border-accent/40 focus-ring transition-colors" />
    </div>
  )
}

export function BackButton({ onBack }: { onBack: () => void }): React.ReactElement {
  return <button onClick={onBack} className="mb-2 text-caption text-text-muted hover:text-text-secondary transition-colors active:scale-[0.97]">← 返回</button>
}

export function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="mt-3">
      <h4 className="mb-1 text-caption font-semibold uppercase tracking-wider text-text-muted">{title}</h4>
      {typeof children === 'string' ? <p className="text-caption text-text-secondary">{children}</p> : children}
    </div>
  )
}

export function ColorSwatch({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5 rounded-control border border-border-subtle bg-bg-elevated-soft p-1">
      <div className="h-5 w-5 shrink-0 rounded-control ring-1 ring-white/10" style={{ backgroundColor: value }} />
      <div className="min-w-0">
        <div className="text-caption font-medium text-text-secondary">{label}</div>
        <div className="text-caption text-text-muted truncate">{value}</div>
      </div>
    </div>
  )
}

export function UseButton({ onClick, label = '使用此模板' }: { onClick: () => void; label?: string }): React.ReactElement {
  return <button onClick={onClick} className="accent-fill mt-3 flex w-full items-center justify-center gap-1 rounded-card px-2 py-2 text-caption font-medium transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] active:scale-[0.98]">{label}<ArrowRight size={13} /></button>
}

export function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }): React.ReactElement {
  return <div className="flex flex-col items-center justify-center py-8 text-center"><Icon size={20} className="text-text-muted mb-1.5 opacity-50" /><p className="text-caption text-text-muted">{text}</p></div>
}

