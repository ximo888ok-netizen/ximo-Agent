/**
 * 状态语义图标组件
 *
 * 把"成功 / 警告 / 错误 / 信息 / 加载中 / 禁用 / 待处理"等语义图标
 * 与项目色板绑定（与 design tokens / clear-glass-theme.json 对齐），
 * 避免业务代码到处传 className="text-emerald-400"。
 *
 * 使用 Tailwind 的 `text-*` 颜色类即可覆盖（color 通过 currentColor 透传）。
 */
import type { CSSProperties, FC } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Loader2,
  Ban,
  Clock
} from 'lucide-react'

export const SUCCESS = '#34D399' // emerald-400
export const WARNING = '#FBBF24' // amber-400
export const ERROR = '#F87171'   // red-400
export const INFO = '#38BDF8'    // sky-400（与强调色一致）
export const MUTED = '#A3AAB8'   // --text-secondary

interface StatusIconProps {
  size?: number
  strokeWidth?: number
  className?: string
  style?: CSSProperties
  /** 给屏幕阅读器的标签（默认中文） */
  title?: string
}

function make(
  Cmp: typeof CheckCircle2,
  color: string,
  defaultTitle: string
): FC<StatusIconProps> {
  const Wrapped: FC<StatusIconProps> = ({
    size = 20,
    strokeWidth = 2,
    className,
    style,
    title
  }) => (
    <Cmp
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      style={{ color, ...style }}
      role="img"
      aria-label={title ?? defaultTitle}
    />
  )
  Wrapped.displayName = `StatusIcon(${defaultTitle})`
  return Wrapped
}

export const SuccessIcon = make(CheckCircle2, SUCCESS, '成功')
export const WarningIcon = make(AlertTriangle, WARNING, '警告')
export const ErrorIcon = make(XCircle, ERROR, '错误')
export const InfoIcon = make(Info, INFO, '信息')
export const LoadingIcon: FC<StatusIconProps> = ({
  size = 20,
  strokeWidth = 2,
  className,
  style,
  title = '加载中'
}) => (
  <Loader2
    size={size}
    strokeWidth={strokeWidth}
    className={`animate-spin ${className ?? ''}`}
    style={{ color: INFO, ...style }}
    role="img"
    aria-label={title}
  />
)
export const ForbiddenIcon = make(Ban, MUTED, '禁用')
export const PendingIcon = make(Clock, MUTED, '待处理')