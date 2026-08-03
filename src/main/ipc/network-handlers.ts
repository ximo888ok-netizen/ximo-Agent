import { ipcMain } from 'electron'
import type { CapturedRequest } from '@shared/types'
import { loadSettings } from '@main/store'

/** 抓包状态 */
let networkCapturing = false
let capturedRequests: CapturedRequest[] = []
let maxCaptured = 500

// 使用独立 partition，方便拦截请求
const EMBEDDED_PARTITION = 'embedded-browser'

export function registerNetworkHandlers(): void {
  ipcMain.handle('network-capture:start', async () => {
    if (networkCapturing) return
    const settings = await loadSettings()
    maxCaptured = settings.maxCapturedRequests ?? 500
    const { session } = await import('electron')
    const ses = session.fromPartition(EMBEDDED_PARTITION)

    networkCapturing = true
    capturedRequests = []

    ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details) => {
      if (!networkCapturing) return
      // 只记录 XHR/Fetch 类型请求（API 端点），过滤掉图片/字体/样式等
      const apiTypes = ['xhr', 'fetch']
      if (!apiTypes.includes(details.resourceType)) return

      const req: CapturedRequest = {
        id: String(details.id),
        url: details.url,
        method: details.method,
        resourceType: details.resourceType,
        timestamp: details.timestamp
      }
      capturedRequests.push(req)
      if (capturedRequests.length > maxCaptured) {
        capturedRequests = capturedRequests.slice(-maxCaptured)
      }
    })

    ses.webRequest.onCompleted({ urls: ['*://*/*'] }, (details) => {
      if (!networkCapturing) return
      const req = capturedRequests.find((r) => r.id === String(details.id))
      if (req) {
        req.statusCode = details.statusCode
        req.completedAt = details.timestamp
        req.duration = details.timestamp - req.timestamp
      }
    })

    return { success: true }
  })

  ipcMain.handle('network-capture:stop', async () => {
    networkCapturing = false
    const { session } = await import('electron')
    const ses = session.fromPartition(EMBEDDED_PARTITION)
    ses.webRequest.onBeforeRequest(null)
    ses.webRequest.onCompleted(null)
    return { success: true }
  })

  ipcMain.handle('network-capture:get', async () => {
    return capturedRequests
  })

  ipcMain.handle('network-capture:clear', async () => {
    capturedRequests = []
    return { success: true }
  })
}
