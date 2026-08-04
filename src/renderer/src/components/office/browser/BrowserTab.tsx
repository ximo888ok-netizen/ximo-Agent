import { useRef, useEffect, memo } from 'react'
import type { RecordedEvent } from '@shared/types'
import type { TabState, WebviewAPI } from './types'
import { safeCall } from './types'
import { injectRecordingScript } from './recordingScript'

// ---------- 单标签组件 ----------
// React.memo 防止父组件状态变更导致不必要重渲染
// 命令式创建 webview — React 18 对 custom element 的属性处理有根本性缺陷：
//   1. src 被设为 property 而非 attribute → attributeChangedCallback 不触发 → 页面不加载
//   2. 即使 setAttribute 也可能因元素未升级（upgrade）而无效
// 解决方案：用 document.createElement('webview') 创建，所有属性在创建时直接设置，完全不经过 React。
export const BrowserTab = memo(function BrowserTab({
  tab,
  active,
  onNewTab,
  onTitleChange,
  onNavStateChange,
  registerWebview,
  isRecording,
  recordingEventsRef,
  onRecordedEvent,
}: {
  tab: TabState
  active: boolean
  onNewTab: (url: string) => void
  onTitleChange: (tabId: string, title: string) => void
  onNavStateChange: (tabId: string, state: { url?: string; canGoBack?: boolean; canGoForward?: boolean; loading?: boolean }) => void
  registerWebview: (tabId: string, wv: HTMLElement | null) => void
  isRecording: boolean
  recordingEventsRef: React.RefObject<RecordedEvent[]>
  onRecordedEvent: () => void
}): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const webviewRef = useRef<HTMLElement | null>(null)
  const initialUrlRef = useRef(tab.url)

  // 录制状态变化时注入/移除脚本
  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    if (isRecording) {
      injectRecordingScript(wv)
    } else {
      const api = wv as unknown as { executeJavaScript: (code: string) => Promise<void> }
      api.executeJavaScript?.('window.__ximoStopRecording && window.__ximoStopRecording()').catch(() => {})
    }
  }, [isRecording])

  // active 变化时切换 display — 不重建 webview
  useEffect(() => {
    const wv = webviewRef.current
    if (wv) {
      wv.style.display = active ? 'flex' : 'none'
    }
  }, [active])

  // 一次性创建 webview 元素 + 绑定所有事件
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // 命令式创建 — 绕过 React 18 custom element 处理
    const wv = document.createElement('webview') as unknown as HTMLElement & WebviewAPI
    wv.setAttribute('src', initialUrlRef.current)
    wv.setAttribute('partition', 'embedded-browser')
    wv.setAttribute('allowpopups', '')
    wv.style.width = '100%'
    wv.style.height = '100%'
    wv.style.display = active ? 'flex' : 'none'
    container.appendChild(wv)
    webviewRef.current = wv
    registerWebview(tab.id, wv)

    let listenersBound = false
    const cleanupRef = { current: (): void => {} }

    const bindListeners = (): void => {
      if (listenersBound) return
      listenersBound = true

      const handleNavStateUpdate = (): void => {
        const back = safeCall(() => wv.canGoBack())
        const forward = safeCall(() => wv.canGoForward())
        const url = safeCall(() => wv.getURL())
        const title = safeCall(() => wv.getTitle())
        onNavStateChange(tab.id, {
          url: url,
          canGoBack: back,
          canGoForward: forward,
        })
        if (title) onTitleChange(tab.id, title)
      }

      const handleDidStartLoading = (): void => onNavStateChange(tab.id, { loading: true })
      const handleDidStopLoading = (): void => {
        onNavStateChange(tab.id, { loading: false })
        handleNavStateUpdate()
      }

      const handleDidNavigate = (e: Event): void => {
        const url = (e as CustomEvent<{ url: string }>).detail?.url
        if (url && isRecording && recordingEventsRef.current) {
          recordingEventsRef.current.push({ type: 'navigate', url, timestamp: Date.now() })
          onRecordedEvent()
        }
        handleNavStateUpdate()
      }

      const handleConsoleMessage = (e: Event): void => {
        if (!isRecording) return
        const msg = (e as CustomEvent<{ message: string }>).detail?.message
        if (!msg || !msg.startsWith('[XIMO_REC]')) return
        try {
          const data = JSON.parse(msg.slice('[XIMO_REC]'.length)) as RecordedEvent
          if (recordingEventsRef.current) {
            recordingEventsRef.current.push(data)
            onRecordedEvent()
          }
        } catch { /* ignore */ }
      }

      const handleNewWindow = (e: Event): void => {
        const url = (e as CustomEvent<{ url: string }>).detail?.url
        if (url) {
          e.preventDefault()
          onNewTab(url)
        }
      }

      // 加载失败 — 显示错误提示而非黑屏
      const handleDidFailLoad = (e: Event): void => {
        const detail = (e as CustomEvent<{ errorCode: number; errorDescription: string; validatedURL: string }>).detail
        if (detail?.errorCode === -3) return // ERR_ABORTED（导航被取消，正常行为）
        onNavStateChange(tab.id, { loading: false })
        const wvApi = wv as unknown as WebviewAPI
        wvApi.executeJavaScript?.(
          `document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#666;background:#fff;text-align:center;padding:2rem"><div><p style="font-size:14px;font-weight:500;margin-bottom:8px">页面加载失败</p><p style="font-size:12px;color:#999">${detail?.errorDescription || '未知错误'}</p></div></div>'`
        ).catch(() => {})
      }

      wv.addEventListener('did-start-loading', handleDidStartLoading as EventListener)
      wv.addEventListener('did-stop-loading', handleDidStopLoading as EventListener)
      wv.addEventListener('did-navigate', handleDidNavigate as EventListener)
      wv.addEventListener('did-navigate-in-page', handleNavStateUpdate as EventListener)
      wv.addEventListener('console-message', handleConsoleMessage as EventListener)
      wv.addEventListener('new-window', handleNewWindow as EventListener)
      wv.addEventListener('did-fail-load', handleDidFailLoad as EventListener)

      cleanupRef.current = () => {
        wv.removeEventListener('did-start-loading', handleDidStartLoading as EventListener)
        wv.removeEventListener('did-stop-loading', handleDidStopLoading as EventListener)
        wv.removeEventListener('did-navigate', handleDidNavigate as EventListener)
        wv.removeEventListener('did-navigate-in-page', handleNavStateUpdate as EventListener)
        wv.removeEventListener('console-message', handleConsoleMessage as EventListener)
        wv.removeEventListener('new-window', handleNewWindow as EventListener)
        wv.removeEventListener('did-fail-load', handleDidFailLoad as EventListener)
      }

      handleNavStateUpdate()
    }

    const onDomReady = (): void => bindListeners()
    wv.addEventListener('dom-ready', onDomReady as EventListener)
    const fallbackTimer = setTimeout(() => { if (!listenersBound) bindListeners() }, 1500)

    return () => {
      clearTimeout(fallbackTimer)
      wv.removeEventListener('dom-ready', onDomReady as EventListener)
      cleanupRef.current()
      registerWebview(tab.id, null)
      webviewRef.current = null
      container.removeChild(wv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id])

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0, display: active ? 'block' : 'none' }} />
})
