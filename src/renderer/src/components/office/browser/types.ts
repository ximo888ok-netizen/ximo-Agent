// ---------- 类型 ----------
export interface TabState {
  id: string
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

// ---------- webview API 类型 ----------
export interface WebviewAPI {
  loadURL: (url: string) => void
  getURL: () => string
  getTitle: () => string
  canGoBack: () => boolean
  canGoForward: () => boolean
  goBack: () => void
  goForward: () => void
  reload: () => void
  executeJavaScript: (code: string) => Promise<unknown>
  capturePage: () => Promise<{ toDataURL: () => string }>
}

// ---------- 工具 ----------
let tabIdCounter = 0
export function genTabId(): string {
  tabIdCounter += 1
  return `tab-${Date.now()}-${tabIdCounter}`
}

/** 安全调用 webview 方法 */
export function safeCall<T>(fn: () => T): T | undefined {
  try { return fn() } catch { return undefined }
}

/** URL 智能补全 */
export function normalizeUrl(input: string): string {
  let target = input.trim()
  if (!target) return ''
  if (!/^https?:\/\//.test(target)) {
    if (/^[\w.-]+\.\w{2,}/.test(target)) {
      target = 'https://' + target
    } else {
      target = 'https://www.bing.com/search?q=' + encodeURIComponent(target)
    }
  }
  return target
}

/** 从 URL 提取简短标签标题 */
export function urlToTitle(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    return host.length > 18 ? host.slice(0, 18) + '…' : host
  } catch {
    return url.slice(0, 20) || '新标签页'
  }
}
