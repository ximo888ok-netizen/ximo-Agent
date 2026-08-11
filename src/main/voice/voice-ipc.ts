import { ipcMain, BrowserWindow } from 'electron'
import { transcribeLocal } from './stt-local'

/** 向主窗口发送事件 */
function sendToRenderer(channel: string, data: unknown): void {
  const windows = BrowserWindow.getAllWindows()
  if (windows.length > 0) windows[0].webContents.send(channel, data)
}

/** 注册语音 IPC handlers */
export function registerVoiceHandlers(): void {
  // 转写音频 — 接收渲染进程解码后的 PCM 数据，本地 Whisper 推理
  ipcMain.handle('voice:transcribe', async (_event, pcm: Float32Array, sampleRate: number) => {
    const result = await transcribeLocal(pcm, sampleRate)
    if (result.error) sendToRenderer('voice:error', { message: result.error })
    return { text: result.text, error: result.error }
  })
}
