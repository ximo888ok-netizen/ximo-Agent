import type { LucideIcon } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'

/**
 * 统一空态
 *
 * 抽取前实测：各面板空态"各写各的" —— 文案格式、图标尺寸、间距、是否给操作按钮
 * 都不一致，切换面板时视觉基线会跳。
 * 这里固定三段式：图标 → 标题 → 提示（可选）→ 操作（可选）。
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  hint?: string
  action?: ReactNode
  className?: string
}): ReactElement {
  return (
    <div className={`flex flex-col items-center justify-center gap-1.5 px-3 py-6 text-center ${className ?? ''}`}>
      {Icon && <Icon size={20} className="mb-0.5 text-text-quaternary" aria-hidden />}
      <p className="text-xs text-text-muted">{title}</p>
      {hint && <p className="max-w-[240px] text-caption leading-relaxed text-text-quaternary">{hint}</p>}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  )
}
