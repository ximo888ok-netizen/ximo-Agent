import type { ReactElement } from 'react'
import { AlertTriangle } from 'lucide-react'

/**
 * 统一错误条
 *
 * 抽取前实测：三个布局文件里有**逐字符相同**的实现
 *   `CodingParts.tsx` · `OfficeLayout.tsx` · `DesignLayout.tsx`
 * 都是 `mx-4 mb-1 ... border-red-500/20 bg-red-500/8 ... ⚠ {message}`。
 *
 * 用令牌而不是硬编码红色，保证深/浅色主题下对比度一致。
 */
export function ErrorBanner({
  message,
  onRetry,
  className,
}: {
  message: string
  onRetry?: () => void
  className?: string
}): ReactElement {
  return (
    <div
      role="alert"
      className={`mx-4 mb-1 flex items-center gap-2 rounded-panel border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400 backdrop-blur-sm ${className ?? ''}`}
    >
      <AlertTriangle size={13} className="shrink-0" aria-hidden />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="focus-ring shrink-0 rounded-control px-2 py-0.5 text-caption text-red-400 transition-colors hover:bg-red-500/15"
        >
          重试
        </button>
      )}
    </div>
  )
}
