/**
 * 窗口管理 — BrowserWindow 创建与事件绑定
 */

import { BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// 防止 ipcMain.handle 重复注册（dev 模式 HMR 重启 / 窗口重建时触发）
ipcMain.removeHandler('window:ready')

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

  // 窗口显示策略（三重保障）：
  // 1. ready-to-show: Chromium 完成首帧渲染即触发（HTML 内联背景已可见）
  // 2. window:ready IPC: 渲染进程 JS 首帧完成后触发（React 已挂载）
  // 3. setTimeout 2s: 兜底，防止上述两者都失败
  let shown = false
  const showWindow = (): void => {
    if (shown || mainWindow.isDestroyed()) return
    shown = true
    mainWindow.show()
  }

  const showFallback = setTimeout(showWindow, 2000)

  mainWindow.once('ready-to-show', () => {
    clearTimeout(showFallback)
    showWindow()
  })

  ipcMain.handle('window:ready', () => {
    clearTimeout(showFallback)
    showWindow()
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

  // 页面加载失败时重试（dev 模式下 Vite dev server 可能尚未就绪）
  let retryCount = 0
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDesc) => {
    if (retryCount < 5 && errorCode !== -3) { // -3 = ABORTED（正常导航跳转，不需重试）
      retryCount++
      setTimeout(() => {
        if (!mainWindow.isDestroyed()) {
          if (process.env['ELECTRON_RENDERER_URL']) {
            mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
          } else {
            mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
          }
        }
      }, 1000)
    }
  })

  // 开发环境加载 dev server，生产环境加载打包文件
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}
