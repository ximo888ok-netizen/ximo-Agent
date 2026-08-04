import { ipcMain } from 'electron'

/** 注册桌面操控（pi-computer-use）相关 IPC handler */
export function registerComputerUseHandlers(): void {
  // pi-computer-use Helper 状态查询
  ipcMain.handle('pi-helper:status', async () => {
    const { piBridge, WINDOWS_HELPER_PATH } = await import('../tools/ComputerUse/PiBridge')
    try {
      await piBridge.ensureReady()
      return { ready: true, path: WINDOWS_HELPER_PATH }
    } catch (e) {
      return { ready: false, error: (e as Error).message, path: WINDOWS_HELPER_PATH }
    }
  })

  // 操控电脑启停
  ipcMain.handle('computer-use:start', async () => {
    try {
      const { piBridge } = await import('../tools/ComputerUse/PiBridge')
      await piBridge.ensureReady()
      return { success: true, running: true }
    } catch (e) {
      return { success: false, running: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('computer-use:stop', async () => {
    try {
      const { piBridge } = await import('../tools/ComputerUse/PiBridge')
      piBridge.dispose()
      return { success: true, running: false }
    } catch {
      return { success: true, running: false }
    }
  })

  ipcMain.handle('computer-use:status', async () => {
    const { piBridge } = await import('../tools/ComputerUse/PiBridge')
    return { running: piBridge.ready }
  })
}
