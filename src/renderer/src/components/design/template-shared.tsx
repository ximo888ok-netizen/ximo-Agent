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
    <button onClick={onClick} className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all ${active ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated/50'}`}>
      <Icon size={12} />
      {label}
      <span className={`rounded-full px-1 text-[8px] ${active ? 'bg-accent/20' : 'bg-bg-elevated/80'}`}>{count}</span>
    </button>
  )
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }): React.ReactElement {
  return (
    <div className="relative">
      <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-md border border-border-subtle bg-bg-elevated/60 pl-7 pr-2 py-1 text-[11px] text-text-primary placeholder:text-text-muted focus:border-accent/40 focus:outline-none transition-colors" />
    </div>
  )
}

export function BackButton({ onBack }: { onBack: () => void }): React.ReactElement {
  return <button onClick={onBack} className="mb-2 text-[10px] text-text-muted hover:text-text-secondary transition-colors">← 返回</button>
}

export function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="mt-3">
      <h4 className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-text-muted">{title}</h4>
      {typeof children === 'string' ? <p className="text-[10px] text-text-secondary">{children}</p> : children}
    </div>
  )
}

export function ColorSwatch({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border-subtle bg-bg-elevated/40 p-1">
      <div className="h-5 w-5 shrink-0 rounded ring-1 ring-white/10" style={{ backgroundColor: value }} />
      <div className="min-w-0">
        <div className="text-[9px] font-medium text-text-secondary">{label}</div>
        <div className="text-[8px] text-text-muted truncate">{value}</div>
      </div>
    </div>
  )
}

export function UseButton({ onClick, label = '使用此模板' }: { onClick: () => void; label?: string }): React.ReactElement {
  return <button onClick={onClick} className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg bg-accent px-2 py-2 text-[11px] font-medium text-white transition-all hover:bg-accent-hover active:scale-[0.98]">{label}<ArrowRight size={12} /></button>
}

export function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }): React.ReactElement {
  return <div className="flex flex-col items-center justify-center py-8 text-center"><Icon size={20} className="text-text-muted mb-1.5 opacity-50" /><p className="text-[10px] text-text-muted">{text}</p></div>
}

