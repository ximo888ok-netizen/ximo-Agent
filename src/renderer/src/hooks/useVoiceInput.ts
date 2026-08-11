import { useState, useRef, useCallback, useEffect } from 'react'

export interface UseVoiceInputResult {
  /** 是否正在录音 */
  isListening: boolean
  /** 是否正在转写（录音结束后的本地推理阶段） */
  isTranscribing: boolean
  /** 当前浏览器是否支持录音 */
  supported: boolean
  /** 错误信息 */
  error: string | null
  /** 开始录音 */
  start: () => void
  /** 停止录音 → 自动转写 */
  stop: () => void
}

/**
 * 语音输入 Hook — 纯本地 STT，无需联网
 *
 * 工作流程：
 * 1. 点击开始 → getUserMedia 获取麦克风 → MediaRecorder 录制音频
 * 2. 点击停止 → MediaRecorder 停止 → 生成 webm Blob
 * 3. 用 OfflineAudioContext 将 webm 解码并重采样为 16kHz 单声道 PCM
 * 4. 将 Float32Array PCM 通过 IPC 发送到主进程
 * 5. 主进程用本地 Whisper 模型推理，返回文本
 * 6. 通过 onFinalText 回调追加到输入框
 */
export function useVoiceInput(onFinalText: (text: string) => void): UseVoiceInputResult {
  const [isListening, setIsListening] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const onFinalTextRef = useRef(onFinalText)

  useEffect(() => {
    onFinalTextRef.current = onFinalText
  }, [onFinalText])

  const supported = typeof window !== 'undefined'
    && 'mediaDevices' in navigator
    && 'MediaRecorder' in window

  /**
   * 将 MediaRecorder 产生的 webm Blob 解码并重采样为 16kHz 单声道 PCM Float32Array。
   *
   * 使用 OfflineAudioContext 完成解码 + 重采样，纯浏览器 API，无需额外依赖。
   */
  const decodeToPCM = useCallback(async (blob: Blob): Promise<Float32Array> => {
    const TARGET_SR = 16000

    // 1. 解码 webm/opus → AudioBuffer（采样率为系统默认，通常 44100 或 48000）
    const arrayBuffer = await blob.arrayBuffer()
    const audioCtx = new AudioContext()
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
    audioCtx.close()

    // 2. 用 OfflineAudioContext 重采样为 16kHz 单声道
    const targetLength = Math.ceil(audioBuffer.duration * TARGET_SR)
    const offlineCtx = new OfflineAudioContext(1, targetLength, TARGET_SR)
    const source = offlineCtx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(offlineCtx.destination)
    source.start()
    const rendered = await offlineCtx.startRendering()

    // 3. 取出单声道 PCM 数据
    return rendered.getChannelData(0).slice()
  }, [])

  const start = useCallback(async () => {
    if (!supported) {
      setError('当前浏览器不支持语音录制')
      return
    }
    if (mediaRecorderRef.current) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      streamRef.current = stream
      chunksRef.current = []

      // 选择最优编码格式
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : ''

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        // 清理麦克风流
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null

        const audioBlob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })
        chunksRef.current = []

        if (audioBlob.size < 500) {
          // 音频太短（< 500 bytes），可能是误触
          setIsListening(false)
          return
        }

        // 发送到主进程本地推理
        setIsTranscribing(true)
        setError(null)
        try {
          const pcm = await decodeToPCM(audioBlob)
          const result = await window.api.voice.transcribe(pcm, 16000)
          if (result.error) {
            setError(result.error)
          } else if (result.text) {
            onFinalTextRef.current(result.text)
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          setError('语音识别失败: ' + msg)
        } finally {
          setIsTranscribing(false)
        }
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setIsListening(true)
      setError(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('NotAllowed') || msg.includes('Permission')) {
        setError('麦克风权限被拒绝，请在系统设置中允许')
      } else if (msg.includes('NotFound') || msg.includes('Devices')) {
        setError('未找到麦克风设备')
      } else {
        setError('启动录音失败: ' + msg)
      }
    }
  }, [supported, decodeToPCM])

  const stop = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      setIsListening(false)
      return
    }
    recorder.stop() // 触发 onstop 回调
    mediaRecorderRef.current = null
    setIsListening(false)
  }, [])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop()
      }
      streamRef.current?.getTracks().forEach(t => t.stop())
      mediaRecorderRef.current = null
      streamRef.current = null
    }
  }, [])

  return { isListening, isTranscribing, supported, error, start, stop }
}
