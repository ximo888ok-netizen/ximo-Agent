import { useEffect } from 'react'
import type { CapturedRequest } from '@shared/types'
import type { WebviewAPI } from './types'

/** Agent ↔ webview 命令桥 — 注册一次，操作当前活动标签 */
export function useCommandBridge(
  webviewRefs: React.MutableRefObject<Map<string, HTMLElement>>,
  webviewReadyRef: React.MutableRefObject<boolean>,
  activeTabIdRef: React.MutableRefObject<string>
): void {
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
          case 'navigate':
            wvApi.loadURL(data.args.url as string)
            result = { url: data.args.url }
            break
          case 'getURL':
            result = wvApi.getURL()
            break
          case 'getTitle':
            result = wvApi.getTitle()
            break
          case 'executeJS':
            result = await wvApi.executeJavaScript(`(() => { ${data.args.code as string} })()`)
            break
          case 'getContent': {
            const sel = (data.args.selector as string) || 'body'
            result = await wvApi.executeJavaScript(
              `(document.querySelector(${JSON.stringify(sel)}) || document.body).textContent || ''`
            )
            break
          }
          case 'click': {
            const sel = data.args.selector as string
            result = await wvApi.executeJavaScript(
              `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (el) { el.click(); return true; } return false; })()`
            )
            break
          }
          case 'type': {
            const sel = data.args.selector as string
            const text = data.args.text as string
            result = await wvApi.executeJavaScript(
              `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (el) { el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); return true; } return false; })()`
            )
            break
          }
          case 'screenshot': {
            const img = await wvApi.capturePage()
            result = img.toDataURL()
            break
          }
          case 'back':
            wvApi.goBack()
            result = true
            break
          case 'forward':
            wvApi.goForward()
            result = true
            break
          case 'reload':
            wvApi.reload()
            result = true
            break
          case 'getNetwork': {
            const reqs = await window.api.networkCapture.getRequests()
            result = reqs.map((r: CapturedRequest) => ({
              url: r.url, method: r.method, status: r.statusCode || 200,
              type: r.resourceType || 'xhr', timestamp: r.timestamp
            }))
            break
          }
          default:
            throw new Error(`未知命令: ${data.cmd}`)
        }
        window.api.embeddedBrowser.sendResult({ id: data.id, success: true, result })
      } catch (e) {
        window.api.embeddedBrowser.sendResult({ id: data.id, success: false, error: (e as Error).message })
      }
    })
    return cleanup
  }, [])
}
