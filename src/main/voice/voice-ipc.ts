import { ipcMain, BrowserWindow } from 'electron'
import { transcribeLocal } from './stt-local'
import { synthesize, listVoices } from './edge-tts'

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

  // Edge TTS — 合成语音
  ipcMain.handle('voice:tts:synthesize', async (_event, text: string, voiceName: string) => {
    try {
      const buffer = await synthesize(text, voiceName)
      return { buffer, error: null }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { buffer: null, error: msg }
    }
  })

  // Edge TTS — 获取可用音色列表
  ipcMain.handle('voice:tts:voices', async () => {
    return await listVoices()
  })
}
