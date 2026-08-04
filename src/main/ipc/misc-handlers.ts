import { ipcMain } from 'electron'
import { getCheckpointStore, removeCheckpointStore } from '../CheckpointStore'
import type { Mode } from '@shared/types'
import { loadMemory, saveMemory } from '../store'

/** 注册 Checkpoint、模式记忆、Tokenizer、字体、终端相关 IPC handler */
export function registerMiscHandlers(): void {
  // Checkpoint 系统
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

  // 模式记忆读写
  ipcMain.handle('memory:load', async (_event, mode: Mode) => {
    return loadMemory(mode)
  })
  ipcMain.handle('memory:save', async (_event, mode: Mode, content: string) => {
    await saveMemory(mode, content)
    return true
  })

  // DeepSeek Tokenizer
  ipcMain.handle('tokenizer:count', async (_event, text: string) => {
    try {
      const { countTokens } = await import('../deepseek/tokenizer')
      return { success: true, count: countTokens(text) }
    } catch (e) {
      return { success: false, count: 0, error: (e as Error).message }
    }
  })

  ipcMain.handle('tokenizer:countMessages', async (_event, messages: { role: string; content: string }[]) => {
    try {
      const { countMessageTokens } = await import('../deepseek/tokenizer')
      return { success: true, count: countMessageTokens(messages) }
    } catch (e) {
      return { success: false, count: 0, error: (e as Error).message }
    }
  })

  // 系统字体
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

  // 终端命令执行
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
}
