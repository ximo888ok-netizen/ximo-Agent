import { app, BrowserWindow, protocol, net } from 'electron'
import { pathToFileURL } from 'url'
import { configureGpuAcceleration } from './gpu-config'
import { createWindow } from './window-manager'
import { registerChatHandlers } from './ipc/chat-handler'
import { registerUpdateHandlers } from './ipc/update-handlers'
import { registerFsHandlers } from './ipc/fs-handlers'
import { registerNetworkHandlers } from './ipc/network-handlers'
import { registerDataHandlers } from './ipc/data-handlers'
import { registerSystemHandlers } from './ipc/system-handlers'
// 内嵌浏览器 IPC 桥 — 模块加载时注册 handler，必须在启动时导入，
// 否则用户打开内置浏览器时 'embedded-browser:set-active' 尚未注册导致报错
import './tools/Browser/WebviewBridge'

// ---------- GPU 硬件加速 ----------
// 必须在 app.whenReady() 之前设置
configureGpuAcceleration()

// ---------- 注册自定义协议 ximobg:// ----------
// 必须在 app.whenReady() 之前注册 scheme
protocol.registerSchemesAsPrivileged([
  { scheme: 'ximobg', privileges: { bypassCSP: true, stream: true, supportFetchAPI: true } },
])

// ---------- 注册 IPC 处理器 ----------
registerChatHandlers()
registerFsHandlers()
registerNetworkHandlers()
registerUpdateHandlers()
registerDataHandlers()
registerSystemHandlers()

// 全局异常兜底，防止未捕获异常导致应用崩溃
process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught Exception:', error)
})
process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled Rejection:', reason)
})

app.whenReady().then(() => {
  // 注册 ximobg:// 协议处理器 — 用于渲染进程加载本地背景图
  // URL 格式: ximobg://bg/<encodeURIComponent(文件路径)>
  protocol.handle('ximobg', (request) => {
    const urlObj = new URL(request.url)
    const filePath = decodeURIComponent(urlObj.pathname.slice(1))
    return net.fetch(pathToFileURL(filePath).href)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', async () => {
  // 确保防抖中的会话数据落盘，避免退出时丢失最后 500ms 的变更
  try {
    const { flushSaveConversations } = await import('./store')
    await flushSaveConversations()
  } catch { /* ignore */ }
})

app.on('window-all-closed', () => {
  // 关闭 pi-computer-use Helper
  import('./tools/ComputerUse/PiBridge').then(({ piBridge }) => piBridge.dispose()).catch(() => {})
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
