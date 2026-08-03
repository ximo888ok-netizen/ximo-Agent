/** 内嵌浏览器 — 类型定义 */

export interface TabState {
  id: string
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

/** webview API 接口（Electron <webview> 标签暴露的方法） */
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
