import type { ReactElement } from 'react'

/**
 * 统一加载指示器 —— 圆环式
 *
 * 替代各文件手写的 `h-6 w-6 animate-spin rounded-full border-2 border-accent/20 border-t-accent`。
 * 抽取前实测：同类手写圆环有 6 处，尺寸分别是 16/20/24px，色搭配还有
 * `border-accent border-t-transparent`、`border-indigo-500 border-t-transparent` 两种变体
 * —— 同一个意思三种长相。
 *
 * 注：按钮内与文案行内的行内加载指示仍用 `<Loader2 className="animate-spin" />`
 * （需与相邻图标同尺寸），那是另一类场景，故意不合并。
 */
const RING: Record<'sm' | 'md', string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
}

export function Spinner({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md'
  className?: string
}): ReactElement {
  return (
    <div
      role="status"
      aria-label="加载中"
      className={`animate-spin rounded-full border-accent/20 border-t-accent ${RING[size]} ${className ?? ''}`}
    />
  )
}

/** 居中包裹版 —— 用于"整块区域正在加载"的占位 */
export function SpinnerBlock({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md'
  className?: string
}): ReactElement {
  return (
    <div className={`flex items-center justify-center ${className ?? ''}`}>
      <Spinner size={size} />
    </div>
  )
}
