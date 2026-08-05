import type { StateCreator } from 'zustand'
import type { CapturedRequest } from '@shared/types'
import type { StoreState } from '@renderer/store/types'

export type BrowserSlice = Pick<StoreState,
  | 'browserOpen'
  | 'browserUrl'
  | 'isBrowserRecording'
  | 'computerUseRunning'
  | 'capturedRequests'
  | 'toggleBrowser'
  | 'setBrowserUrl'
  | 'toggleBrowserRecording'
  | 'toggleComputerUse'
  | 'refreshCapturedRequests'
  | 'clearCapturedRequests'
  | 'refreshComputerUseStatus'
>

export const createBrowserSlice: StateCreator<StoreState, [], [], BrowserSlice> = (set, get) => ({
  browserOpen: false,
  browserUrl: 'about:blank',
  isBrowserRecording: false,
  computerUseRunning: false,
  capturedRequests: [] as CapturedRequest[],

  toggleBrowser: () => {
    set((s) => {
      if (s.browserOpen) {
        // 关闭浏览器时同时停止录制
        if (s.isBrowserRecording) {
          void window.api.networkCapture.stop()
        }
        return { browserOpen: false, isBrowserRecording: false, browserUrl: 'about:blank', capturedRequests: [] }
      }
      return { browserOpen: true }
    })
  },

  setBrowserUrl: (url: string) => set({ browserUrl: url }),

  toggleBrowserRecording: () => {
    set((s) => {
      if (s.isBrowserRecording) {
        // 停止录制 — 网络抓包停止
        void window.api.networkCapture.stop()
        return { isBrowserRecording: false }
      }
      // 开始录制 — 启动网络抓包
      void window.api.networkCapture.start()
      return { isBrowserRecording: true }
    })
  },

  toggleComputerUse: async () => {
    const running = get().computerUseRunning
    if (running) {
      await window.api.computerUse.stop()
      set({ computerUseRunning: false })
    } else {
      const result = await window.api.computerUse.start()
      set({ computerUseRunning: result.running })
      if (!result.running && result.error) {
        set({ error: `操控电脑启动失败：${result.error}` })
      }
    }
  },

  refreshCapturedRequests: async () => {
    const requests = await window.api.networkCapture.getRequests()
    set({ capturedRequests: requests })
  },

  clearCapturedRequests: async () => {
    await window.api.networkCapture.clear()
    set({ capturedRequests: [] })
  },

  refreshComputerUseStatus: async () => {
    const status = await window.api.computerUse.status()
    set({ computerUseRunning: status.running })
  },
})
