/**
 * 窗口管理 — BrowserWindow 创建与事件绑定
 */

import { BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    transparent: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      backgroundThrottling: false,
      spellcheck: false,
      paintWhenInitiallyHidden: true
    } as Electron.WebPreferences
  })

  // 窗口由 window:ready IPC 触发显示（渲染进程首帧完成后通知）
  // paintWhenInitiallyHidden 确保 DWM 在 show 时已有内容，不会出现黑窗闪烁

  // 安全兜底：5 秒后若渲染进程仍未通知，强制显示（防止 JS 异常导致永久白屏）
  const showFallback = setTimeout(() => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show()
    }
  }, 5000)

  ipcMain.handle('window:ready', () => {
    clearTimeout(showFallback)
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show()
    }
  })

  // 监听窗口最大化/还原状态变化，通知渲染进程
  mainWindow.on('maximize', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximizeChange', true)
    }
  })
  mainWindow.on('unmaximize', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximizeChange', false)
    }
  })

  // 外部链接用系统浏览器打开（仅允许 http/https 协议，防止恶意协议调用）
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url)
      }
    } catch { /* 无效 URL，忽略 */ }
    return { action: 'deny' }
  })

  // 渲染进程崩溃恢复
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Main] 渲染进程崩溃:', details.reason)
    if (details.reason !== 'clean-exit' && !mainWindow.isDestroyed()) {
      mainWindow.reload()
    }
  })

  // 开发环境加载 dev server，生产环境加载打包文件
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}
