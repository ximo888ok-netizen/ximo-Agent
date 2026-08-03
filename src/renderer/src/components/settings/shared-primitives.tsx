import { ExternalLink } from 'lucide-react'

// ─── 简单展示型组件（无状态，适合单独提取） ─────────────

export function SectionTitle({ title, desc }: { title: string; desc?: string }): React.ReactElement {
  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      {desc && <p className="mt-0.5 text-xs text-text-muted">{desc}</p>}
    </div>
  )
}

export function Divider(): React.ReactElement {
  return <div className="border-t border-border-subtle" />
}

export function InfoCard({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="ios-card p-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-text-primary">{value}</p>
    </div>
  )
}

export function FeatureRow({
  icon,
  title,
  desc
}: {
  icon: string
  title: string
  desc: string
}): React.ReactElement {
  return (
    <div className="ios-card flex items-center gap-3 p-3">
      <span className="text-lg">{icon}</span>
      <div>
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="text-xs text-text-muted">{desc}</p>
      </div>
    </div>
  )
}

export function LinkRow({ href, label }: { href: string; label: string }): React.ReactElement {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="ios-card flex items-center justify-between px-3 py-2.5 transition-all hover:border-accent/40"
    >
      <span className="text-sm text-text-secondary">{label}</span>
      <ExternalLink size={14} className="text-text-muted" />
    </a>
  )
}

export function DataRow({
  icon,
  title,
  desc,
  children,
  danger
}: {
  icon: React.ReactNode
  title: string
  desc: string
  children: React.ReactNode
  danger?: boolean
}): React.ReactElement {
  return (
    <div className="ios-card flex items-center justify-between p-3.5">
      <div className="flex items-start gap-2.5">
        <span className={danger ? 'text-red-400' : 'text-text-muted'}>{icon}</span>
        <div>
          <p className={`text-sm font-medium ${danger ? 'text-red-400' : 'text-text-primary'}`}>
            {title}
          </p>
          <p className="text-xs text-text-muted">{desc}</p>
        </div>
      </div>
      {children}
    </div>
  )
}
