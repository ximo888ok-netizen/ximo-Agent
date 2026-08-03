/**
 * 共享工具函数 — 主进程与渲染进程通用
 *
 * 仅包含纯函数，不依赖 Electron / Node API，确保跨环境安全。
 */

/**
 * 将时间戳格式化为相对时间字符串（刚刚 / N 分钟前 / N 小时前 / 日期）
 */
export function formatRelativeTime(ts: number): string {
  const date = new Date(ts)
  const now = Date.now()
  const diff = now - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 将字节数格式化为人类可读的文件大小字符串
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
