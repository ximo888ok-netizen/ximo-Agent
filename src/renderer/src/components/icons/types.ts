/**
 * 图标系统 · 类型定义
 *
 * 设计原则：
 * - 基于 lucide-react，类型透传以保持 lucide 升级时零改动。
 * - 尺寸使用令牌（'sm' | 'md' | 'lg' ...）而非裸数字，与设计系统保持一致。
 * - 所有可选属性向后兼容：旧代码 import { Icon } 的 { name, size, className } API 不变。
 */

export type IconCategory =
  | 'navigation'
  | 'action'
  | 'status'
  | 'form'
  | 'data'
  | 'common'

export interface IconMeta {
  /** lucide-react 组件名（PascalCase，与 lucide 一致） */
  name: string
  /** 业务分类 */
  category: IconCategory
  /** 中文用途描述 */
  zh: string
  /** 语义别名：支持 <Icon name="add" /> 写法，与 Plus 等价 */
  aliases?: string[]
}

/**
 * 尺寸令牌：直接对应 lucide 默认 24×24 网格下的常见显示尺寸。
 * 设计系统建议：按钮内 16 / 输入框 20 / 卡片标题 24 / 大屏/空状态 32。
 */
export type IconSize = number | 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export const ICON_SIZE_MAP: Record<Exclude<IconSize, number>, number> = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32
}

export const DEFAULT_SIZE: IconSize = 'md' // 20
export const DEFAULT_STROKE_WIDTH = 2

export interface IconProps {
  /** 图标名（lucide 组件名或语义别名） */
  name: string
  /** 尺寸：数值（像素）或令牌 */
  size?: IconSize
  /** 描边宽度（与 lucide 一致：默认 2） */
  strokeWidth?: number
  /** 是否旋转（用于加载中） */
  spin?: boolean
  /** Tailwind 类名或自定义 className */
  className?: string
  /** 给屏幕阅读器：无 title 时默认 aria-hidden，有 title 时 role="img"+aria-label */
  title?: string
}