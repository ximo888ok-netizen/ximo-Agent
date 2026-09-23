import type { LucideIcon } from 'lucide-react'
import { ChevronRight } from 'lucide-react'

interface SidebarNavItemProps {
  icon: LucideIcon
  label: string
  onClick: () => void
  /** 右侧徽标 — 真实数量或状态文案 */
  badge?: string
  /** 徽标语义：default 中性 / accent 高亮 / warn 需注意 / off 已关闭 */
  tone?: 'default' | 'accent' | 'warn' | 'off'
  /** 悬停提示（补充说明或完整路径） */
  title?: string
}

const BADGE_TONE: Record<NonNullable<SidebarNavItemProps['tone']>, string> = {
  default: 'text-text-muted bg-bg-hover',
  accent: 'text-accent bg-accent/10',
  warn: 'text-amber-500 bg-amber-500/10',
  off: 'text-text-tertiary bg-bg-hover',
}

/**
 * 侧栏导航项 — 图标 + 文字 + 真实数量徽标，悬停时浮出进入指示。
 * 用于承载全局面板入口（记忆 / 知识库 / 专家库 / MCP / 技能）。
 */
export function SidebarNavItem({ icon: Icon, label, onClick, badge, tone = 'default', title }: SidebarNavItemProps): React.ReactElement {
  return (
    <button aria-label={title ?? label}
      onClick={onClick}
      title={title ?? label}
      className="group flex w-full items-center gap-2 rounded-card px-2 py-1.5 text-left text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary active:scale-[0.97]"
    >
      <Icon size={13} className="shrink-0 text-text-muted transition-colors group-hover:text-accent" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge && (
        <span className={`shrink-0 rounded-control px-1 text-caption tabular-nums ${BADGE_TONE[tone]}`}>
          {badge}
        </span>
      )}
      <ChevronRight
        size={11}
        className="shrink-0 -translate-x-0.5 text-text-tertiary opacity-0 transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] duration-fast group-hover:translate-x-0 group-hover:opacity-100"
      />
    </button>
  )
}
