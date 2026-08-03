import { useRef, useEffect, useState, useCallback } from 'react'
import { useStore } from '@renderer/store/useStore'
import type { RecordedEvent, SkillStep, CapturedRequest } from '@shared/types'
import type { TabState, WebviewAPI } from './embedded-browser/types'
import { genTabId, safeCall, normalizeUrl, selectorToJs, urlToTitle } from './embedded-browser/utils'
import { BrowserTab } from './embedded-browser/BrowserTab'
import { TabBar, UrlBar, RecordingBar, createWebviewOps } from './embedded-browser/BrowserToolbar'
import { CapturePanel } from './embedded-browser/CapturePanel'
import { SaveSkillDialog } from './embedded-browser/SaveSkillDialog'

export function EmbeddedBrowserPanel(): React.ReactElement {
  const urlInputRef = useRef<HTMLInputElement>(null)
  const setBrowserUrl = useStore((s) => s.setBrowserUrl)
  const toggleBrowser = useStore((s) => s.toggleBrowser)
  const isBrowserRecording = useStore((s) => s.isBrowserRecording)
  const toggleBrowserRecording = useStore((s) => s.toggleBrowserRecording)
  const capturedRequests = useStore((s) => s.capturedRequests)
  const refreshCapturedRequests = useStore((s) => s.refreshCapturedRequests)
  const clearCapturedRequests = useStore((s) => s.clearCapturedRequests)
  const loadSkills = useStore((s) => s.loadSkills)

  const [tabs, setTabs] = useState<TabState[]>([
    { id: genTabId(), url: 'https://www.bing.com', title: 'Bing', loading: false, canGoBack: false, canGoForward: false }
  ])
  const [activeTabId, setActiveTabId] = useState(tabs[0]!.id)
  const webviewRefs = useRef<Map<string, HTMLElement>>(new Map())
  const webviewReadyRef = useRef(false)
  const [showCapturePanel, setShowCapturePanel] = useState(true)
  const [recordedEvents, setRecordedEvents] = useState<RecordedEvent[]>([])
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [skillName, setSkillName] = useState('')
  const [skillDesc, setSkillDesc] = useState('')
  const [startUrl, setStartUrl] = useState('')
  const eventsRef = useRef<RecordedEvent[]>([])
  const pendingDataRef = useRef<string>('')

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]
  const activeTabIdRef = useRef(activeTabId)

  useEffect(() => { activeTabIdRef.current = activeTabId }, [activeTabId])
  useEffect(() => {
    window.api.embeddedBrowser.setActive(true).catch(() => {})
    return () => { window.api.embeddedBrowser.setActive(false).catch(() => {}) }
  }, [])
  useEffect(() => {
    webviewReadyRef.current = !!webviewRefs.current.get(activeTabId)
  }, [activeTabId, tabs])

  const registerWebview = useCallback((tabId: string, wv: HTMLElement | null): void => {
    if (wv) {
      webviewRefs.current.set(tabId, wv)
      if (tabId === activeTabIdRef.current) webviewReadyRef.current = true
    } else {
      webviewRefs.current.delete(tabId)
      if (tabId === activeTabIdRef.current) webviewReadyRef.current = false
    }
  }, [])

  // Agent ↔ webview 命令桥
  useEffect(() => {
    const cleanup = window.api.embeddedBrowser.onCommand(async (data) => {
      const wv = webviewRefs.current.get(activeTabIdRef.current)
      if (!wv || !webviewReadyRef.current) {
        window.api.embeddedBrowser.sendResult({ id: data.id, success: false, error: 'Webview 未就绪' })
        return
      }
      try {
        let result: unknown
        const wvApi = wv as unknown as WebviewAPI
        switch (data.cmd) {
          case 'navigate': wvApi.loadURL(data.args.url as string); result = { url: data.args.url }; break
          case 'getURL': result = wvApi.getURL(); break
          case 'getTitle': result = wvApi.getTitle(); break
          case 'executeJS': result = await wvApi.executeJavaScript(`(() => { ${data.args.code as string} })()`); break
          case 'getContent': {
            const sel = (data.args.selector as string) || 'body'
            result = await wvApi.executeJavaScript(`(${selectorToJs(sel)} || document.body).textContent || ''`)
            break
          }
          case 'click': {
            const sel = data.args.selector as string
            result = await wvApi.executeJavaScript(`(() => { const el = ${selectorToJs(sel)}; if (el) { el.click(); return true; } return false; })()`)
            break
          }
          case 'type': {
            const sel = data.args.selector as string; const text = data.args.text as string
            result = await wvApi.executeJavaScript(`(() => { const el = ${selectorToJs(sel)}; if (!el) return false; const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; const desc = Object.getOwnPropertyDescriptor(proto, 'value'); if (desc && desc.set) desc.set.call(el, ${JSON.stringify(text)}); else el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); return true; })()`)
            break
          }
          case 'screenshot': { const img = await wvApi.capturePage(); result = img.toDataURL(); break }
          case 'back': wvApi.goBack(); result = true; break
          case 'forward': wvApi.goForward(); result = true; break
          case 'reload': wvApi.reload(); result = true; break
          case 'injectScript': result = await wvApi.executeJavaScript(data.args.code as string); break
          case 'getNetwork': {
            const reqs = await window.api.networkCapture.getRequests()
            result = reqs.map((r: CapturedRequest) => ({ url: r.url, method: r.method, status: r.statusCode || 200, type: r.resourceType || 'xhr', timestamp: r.timestamp }))
            break
          }
          default: throw new Error(`未知命令: ${data.cmd}`)
        }
        window.api.embeddedBrowser.sendResult({ id: data.id, success: true, result })
      } catch (e) {
        window.api.embeddedBrowser.sendResult({ id: data.id, success: false, error: (e as Error).message })
      }
    })
    return cleanup
  }, [])

  useEffect(() => {
    if (!isBrowserRecording) return
    const interval = setInterval(() => { void refreshCapturedRequests() }, 1000)
    return () => clearInterval(interval)
  }, [isBrowserRecording, refreshCapturedRequests])

  useEffect(() => {
    if (activeTab && urlInputRef.current) urlInputRef.current.value = activeTab.url
    setBrowserUrl(activeTab?.url || '')
  }, [activeTabId, activeTab, setBrowserUrl])

  const handleNewTab = useCallback((url: string): void => {
    const newTab: TabState = { id: genTabId(), url: url || 'https://www.bing.com', title: urlToTitle(url || '新标签页'), loading: false, canGoBack: false, canGoForward: false }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(newTab.id)
  }, [])

  const handleCloseTab = useCallback((tabId: string, e: React.MouseEvent): void => {
    e.stopPropagation()
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId)
      if (idx === -1) return prev
      const next = prev.filter((t) => t.id !== tabId)
      if (next.length === 0) { toggleBrowser(); return prev }
      if (tabId === activeTabId) { const newActive = next[Math.min(idx, next.length - 1)]!; setActiveTabId(newActive.id) }
      return next
    })
  }, [activeTabId, toggleBrowser])

  const handleNavigate = useCallback((url: string): void => {
    const target = normalizeUrl(url)
    if (!target) return
    const wv = webviewRefs.current.get(activeTabId)
    if (!wv) return
    safeCall(() => (wv as unknown as WebviewAPI).loadURL(target))
  }, [activeTabId])

  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') handleNavigate(urlInputRef.current?.value || activeTab?.url || '')
  }

  const onNavStateChange = useCallback((tabId: string, state: { url?: string; canGoBack?: boolean; canGoForward?: boolean; loading?: boolean }): void => {
    setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, url: state.url ?? t.url, canGoBack: state.canGoBack ?? t.canGoBack, canGoForward: state.canGoForward ?? t.canGoForward, loading: state.loading ?? t.loading } : t))
  }, [])

  const onTitleChange = useCallback((tabId: string, title: string): void => {
    setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, title: title || t.title } : t))
  }, [])

  const onRecordedEvent = useCallback((): void => { setRecordedEvents([...eventsRef.current]) }, [])

  const wvOps = createWebviewOps(() => webviewRefs.current.get(activeTabId))

  useEffect(() => {
    if (isBrowserRecording && activeTab) {
      setStartUrl(activeTab.url)
      void window.api.skills.startRecording(activeTab.url).catch(() => {})
    }
  }, [isBrowserRecording]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStopRecording = useCallback(async (): Promise<void> => {
    toggleBrowserRecording()
    const latestRequests = await window.api.networkCapture.getRequests()
    const skillSession = await window.api.skills.stopRecording()

    const endpoints = [...new Set(latestRequests.map(r => {
      try { const u = new URL(r.url); return u.origin + u.pathname } catch { return r.url }
    }))]

    const manualSteps: SkillStep[] = eventsRef.current.map(ev => {
      if (ev.type === 'navigate') return { tool: 'browser_navigate', arguments: { url: ev.url }, timestamp: ev.timestamp, description: `导航到 ${ev.url}` }
      if (ev.type === 'click') return { tool: 'browser_click', arguments: { selector: ev.selector }, timestamp: ev.timestamp, description: `点击 ${ev.selector}` }
      if (ev.type === 'input') return { tool: 'browser_type', arguments: { selector: ev.selector, text: ev.value }, timestamp: ev.timestamp, description: `输入 "${ev.value}"` }
      return { tool: 'unknown', arguments: {}, timestamp: ev.timestamp }
    })

    const agentSteps = skillSession?.steps ?? []
    const allSteps = [...manualSteps, ...agentSteps].sort((a, b) => a.timestamp - b.timestamp)
    const rrwebEvents = skillSession?.rrwebEvents && skillSession.rrwebEvents.length > 0 ? skillSession.rrwebEvents : undefined

    const autoName = `技能_${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`
    setSkillName(autoName)
    setSkillDesc(`${startUrl ? `从 ${startUrl} 开始的` : ''}操作序列（${allSteps.length} 步，${endpoints.length} 个 API 端点）`)
    pendingDataRef.current = JSON.stringify({ steps: allSteps, apiEndpoints: endpoints, rrwebEvents })
    setShowSaveDialog(true)
  }, [toggleBrowserRecording, startUrl])

  useEffect(() => {
    const handler = (): void => { void handleStopRecording() }
    window.addEventListener('ximo:stop-recording', handler)
    return () => window.removeEventListener('ximo:stop-recording', handler)
  }, [handleStopRecording])

  const handleSaveSkill = useCallback(async (name: string, desc: string): Promise<void> => {
    const data = JSON.parse(pendingDataRef.current) as { steps: SkillStep[]; apiEndpoints: string[]; rrwebEvents?: Record<string, unknown>[] }
    await window.api.skillRecording.save({ name, description: desc, steps: data.steps, apiEndpoints: data.apiEndpoints, startUrl, rrwebEvents: data.rrwebEvents })
    await loadSkills()
    setShowSaveDialog(false)
    eventsRef.current = []
    setRecordedEvents([])
    await clearCapturedRequests()
  }, [startUrl, loadSkills, clearCapturedRequests])

  const handleCancelSave = (): void => {
    setShowSaveDialog(false)
    eventsRef.current = []
    setRecordedEvents([])
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TabBar tabs={tabs} activeTabId={activeTabId} onSelect={setActiveTabId} onClose={handleCloseTab} onNewTab={handleNewTab} />
      <UrlBar tab={activeTab} urlInputRef={urlInputRef} onNavigate={handleNavigate} onKeyDown={handleUrlKeyDown} onBack={wvOps.goBack} onForward={wvOps.goForward} onReload={wvOps.reload} onClose={toggleBrowser} />
      {isBrowserRecording && <RecordingBar eventCount={recordedEvents.length} requestCount={capturedRequests.length} onStop={() => void handleStopRecording()} />}

      <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
        {tabs.map((tab) => (
          <BrowserTab key={tab.id} tab={tab} active={tab.id === activeTabId} onNewTab={handleNewTab} onTitleChange={onTitleChange} onNavStateChange={onNavStateChange} registerWebview={registerWebview} isRecording={isBrowserRecording} recordingEventsRef={eventsRef} onRecordedEvent={onRecordedEvent} />
        ))}
      </div>

      {showCapturePanel && (
        <CapturePanel requests={capturedRequests} isRecording={isBrowserRecording} onClear={() => void clearCapturedRequests()} onClose={() => setShowCapturePanel(false)} />
      )}

      {showSaveDialog && (
        <SaveSkillDialog
          initialName={skillName}
          initialDesc={skillDesc}
          stepCount={(JSON.parse(pendingDataRef.current || '{"steps":[]}')).steps?.length ?? 0}
          endpointCount={(JSON.parse(pendingDataRef.current || '{"apiEndpoints":[]}')).apiEndpoints?.length ?? 0}
          onSave={(name, desc) => void handleSaveSkill(name, desc)}
          onCancel={handleCancelSave}
        />
      )}
    </div>
  )
}
