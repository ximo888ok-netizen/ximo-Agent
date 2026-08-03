/**
 * 系统相关 IPC 处理器 — 窗口控制、终端、操控电脑、字体、Checkpoint、Tokenizer
 */

import { ipcMain, BrowserWindow, app } from 'electron'
import { getCheckpointStore, removeCheckpointStore } from '@main/CheckpointStore'

export function registerSystemHandlers(): void {
  // ---------- 窗口控制 ----------
  ipcMain.handle('window:minimize', () => {
    BrowserWindow.getFocusedWindow()?.minimize()
  })
  ipcMain.handle('window:maximize', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize()
      } else {
        win.maximize()
      }
    }
  })
  ipcMain.handle('window:close', () => {
    BrowserWindow.getFocusedWindow()?.close()
  })
  ipcMain.handle('window:isMaximized', () => {
    return BrowserWindow.getFocusedWindow()?.isMaximized() ?? false
  })

  // ---------- pi-computer-use Helper 状态查询 ----------
  ipcMain.handle('pi-helper:status', async () => {
    const { piBridge, WINDOWS_HELPER_PATH } = await import('@main/tools/ComputerUse/PiBridge')
    try {
      await piBridge.ensureReady()
      return { ready: true, path: WINDOWS_HELPER_PATH }
    } catch (e) {
      return { ready: false, error: (e as Error).message, path: WINDOWS_HELPER_PATH }
    }
  })

  // ---------- 终端命令执行 ----------
  ipcMain.handle('terminal:execute', async (_event, command: string, cwd?: string) => {
    const { spawn } = await import('child_process')
    const isWin = process.platform === 'win32'
    const shell = isWin ? 'powershell.exe' : '/bin/sh'
    const shellArgs = isWin ? ['-NoProfile', '-Command', command] : ['-c', command]
    return new Promise((resolve) => {
      const child = spawn(shell, shellArgs, {
        cwd: cwd || undefined,
        windowsHide: true,
        timeout: 30000
      })
      let stdout = ''
      let stderr = ''
      child.stdout?.on('data', (data: Buffer) => { stdout += data.toString('utf-8') })
      child.stderr?.on('data', (data: Buffer) => { stderr += data.toString('utf-8') })
      child.on('close', (exitCode: number | null) => {
        const code = exitCode ?? 0
        resolve({
          stdout: stdout || '',
          stderr: stderr || (code !== 0 ? `Command exited with code ${code}` : ''),
          exitCode: code
        })
      })
      child.on('error', (err: Error) => {
        resolve({
          stdout: stdout || '',
          stderr: stderr || err.message,
          exitCode: 1
        })
      })
    })
  })

  // ---------- 操控电脑（pi-computer-use）启停 ----------
  ipcMain.handle('computer-use:start', async () => {
    try {
      const { piBridge } = await import('@main/tools/ComputerUse/PiBridge')
      await piBridge.ensureReady()
      return { success: true, running: true }
    } catch (e) {
      return { success: false, running: false, error: (e as Error).message }
    }
  })
  ipcMain.handle('computer-use:stop', async () => {
    try {
      const { piBridge } = await import('@main/tools/ComputerUse/PiBridge')
      piBridge.dispose()
      return { success: true, running: false }
    } catch {
      return { success: true, running: false }
    }
  })
  ipcMain.handle('computer-use:status', async () => {
    const { piBridge } = await import('@main/tools/ComputerUse/PiBridge')
    return { running: piBridge.ready }
  })

  // ---------- 系统字体 ----------
  ipcMain.handle('fonts:list', async () => {
    try {
      const { execSync } = await import('child_process')
      const ps = `Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }`
      const out = execSync(`powershell -NoProfile -Command "${ps}"`, { encoding: 'utf-8', timeout: 10000 })
      return out.split(/\r?\n/).map(f => f.trim()).filter(Boolean)
    } catch {
      return []
    }
  })

  // ---------- Checkpoint 系统 ----------
  ipcMain.handle('checkpoint:list', async (_event, sessionId: string) => {
    const store = getCheckpointStore(sessionId)
    return { success: true, checkpoints: store.list() }
  })
  ipcMain.handle('checkpoint:restore', async (_event, sessionId: string, fromTurn: number) => {
    const store = getCheckpointStore(sessionId)
    const result = await store.restoreCode(fromTurn)
    return { success: true, ...result }
  })
  ipcMain.handle('checkpoint:bounds', async (_event, sessionId: string) => {
    const store = getCheckpointStore(sessionId)
    const bounds: Record<number, number> = {}
    for (const [turn, idx] of store.bounds()) {
      bounds[turn] = idx
    }
    return { success: true, bounds }
  })
  ipcMain.handle('checkpoint:clear', async (_event, sessionId: string) => {
    await removeCheckpointStore(sessionId)
    return { success: true }
  })

  // ---------- DeepSeek Tokenizer ----------
  ipcMain.handle('tokenizer:count', async (_event, text: string) => {
    try {
      const { countTokens } = await import('@main/deepseek/tokenizer')
      return { success: true, count: countTokens(text) }
    } catch (e) {
      return { success: false, count: 0, error: (e as Error).message }
    }
  })
  ipcMain.handle('tokenizer:countMessages', async (_event, messages: { role: string; content: string }[]) => {
    try {
      const { countMessageTokens } = await import('@main/deepseek/tokenizer')
      return { success: true, count: countMessageTokens(messages) }
    } catch (e) {
      return { success: false, count: 0, error: (e as Error).message }
    }
  })

  // ---------- 获取应用版本 ----------
  ipcMain.handle('app:getVersion', () => app.getVersion())
}
