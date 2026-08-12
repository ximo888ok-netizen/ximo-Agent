import { useState, useRef, useCallback, useEffect } from 'react'
import { useStore } from '@renderer/store/useStore'
import { useVAD } from './useVAD'
import { useStreamingTTS } from './useStreamingTTS'

export type DiscussionState = 'idle' | 'listening' | 'transcribing' | 'speaking'

/**
 * 语音讨论模式 — 用户与 AI 实时语音对话，讨论结束后自动转入实施。
 *
 * 流程：
 * 1. start() → 打开麦克风 → VAD 持续监测语音活动
 * 2. VAD 检测到说话 → 若 AI 正在回复则打断（cancel + stopTTS）→ 启动 MediaRecorder
 * 3. VAD 检测到说话结束 → 停止 MediaRecorder → 解码为 PCM → Whisper STT → 自动发送消息
 * 4. AI 流式回复 → 监听 store.streamingContent 变化 → 逐句推送 TTS 朗读
 * 5. 用户再次说话 → 打断 AI 回复（回到步骤 2）
 * 6. stop() → 关闭麦克风 → 发送"讨论结束，开始实施"触发正式任务执行
 */
export function useVoiceDiscussion(): {
  isActive: boolean
  state: DiscussionState
  volume: number
  error: string | null
  start: () => Promise<void>
  stop: () => void
} {
  const [isActive, setIsActive] = useState(false)
  const [state, setState] = useState<DiscussionState>('idle')
  const [error, setError] = useState<string | null>(null)

  const isStreaming = useStore((s) => s.isStreaming)
  const streamingContent = useStore((s) => s.streamingContent)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const isActiveRef = useRef(false)
  const prevContentRef = useRef('')
  const prevStreamingRef = useRef(false)

  const streamingTTS = useStreamingTTS()

  /** 解码音频 Blob 为 16kHz 单声道 PCM */
  const decodeToPCM = useCallback(async (blob: Blob): Promise<Float32Array> => {
    const TARGET_SR = 16000
    const arrayBuffer = await blob.arrayBuffer()
    const audioCtx = new AudioContext()
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
    audioCtx.close()
    const targetLength = Math.ceil(audioBuffer.duration * TARGET_SR)
    const offlineCtx = new OfflineAudioContext(1, targetLength, TARGET_SR)
    const source = offlineCtx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(offlineCtx.destination)
    source.start()
    const rendered = await offlineCtx.startRendering()
    return rendered.getChannelData(0).slice()
  }, [])

  /** 发送转写文本到 AI */
  const sendText = useCallback(async (text: string) => {
    if (!text.trim()) {
      setState('listening')
      return
    }
    prevContentRef.current = ''
    await useStore.getState().sendMessage(text, { skipNetworkHint: true })
  }, [])

  /** 处理录音结束后的音频 */
  const processAudio = useCallback(async (blob: Blob) => {
    if (blob.size < 500) {
      setState('listening')
      return
    }
    setState('transcribing')
    try {
      const pcm = await decodeToPCM(blob)
      const result = await window.api.voice.transcribe(pcm, 16000)
      if (result.error) {
        setError(result.error)
        setState('listening')
      } else if (result.text) {
        await sendText(result.text)
      } else {
        setState('listening')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError('语音识别失败: ' + msg)
      setState('listening')
    }
  }, [decodeToPCM, sendText])

  // VAD 回调 — 使用 ref 保持最新引用
  const onSpeechStart = useCallback(() => {
    if (!isActiveRef.current) return
    // 用户开始说话 → 打断 AI 回复
    const store = useStore.getState()
    if (store.isStreaming) void store.cancelStream()
    streamingTTS.stop()

    setState('listening')

    // 启动 MediaRecorder 录制这段语音
    try {
      const stream = streamRef.current
      if (!stream) return
      chunksRef.current = []
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
      recorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })
        chunksRef.current = []
        if (isActiveRef.current) void processAudio(audioBlob)
      }
      recorder.start()
      recorderRef.current = recorder
    } catch {
      // recorder 启动失败，忽略
    }
  }, [streamingTTS, processAudio])

  const onSpeechEnd = useCallback(() => {
    if (!isActiveRef.current) return
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
      recorderRef.current = null
    }
  }, [])

  // VAD — 传入 stream（start 后才有）
  const { isSpeaking: vadSpeaking, volume, start: vadStart, stop: vadStop } = useVAD(
    streamRef.current,
    { onSpeechStart, onSpeechEnd, threshold: 15, silenceDuration: 1000 },
  )

  // 监听 streamingContent → 推送流式 TTS
  useEffect(() => {
    if (!isActive || !isStreaming) return
    const prev = prevContentRef.current
    if (streamingContent.length > prev.length) {
      const newPart = streamingContent.slice(prev.length)
      streamingTTS.push(newPart)
      setState('speaking')
    }
    prevContentRef.current = streamingContent
  }, [streamingContent, isStreaming, isActive, streamingTTS])

  // 流式结束 → flush 剩余 TTS，回到 listening
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && isActive) {
      streamingTTS.flush()
      // 等待 TTS 朗读完毕后回到 listening
      const check = setInterval(() => {
        if (!streamingTTS.isSpeaking) {
          clearInterval(check)
          if (isActiveRef.current) setState('listening')
        }
      }, 200)
      setTimeout(() => clearInterval(check), 30000) // 兜底
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming, isActive, streamingTTS])

  // 同步 vadSpeaking 到 state
  useEffect(() => {
    if (isActive && vadSpeaking && !isStreaming) setState('listening')
  }, [vadSpeaking, isActive, isStreaming])

  /** 进入语音讨论模式 */
  const start = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      streamRef.current = stream
      isActiveRef.current = true
      setIsActive(true)
      setState('listening')
      prevContentRef.current = ''
      // VAD 需要在 stream 设置后启动
      // useVAD 的 start 在下一轮 effect 中调用（stream ref 更新后）
      setTimeout(() => vadStart(), 0)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('NotAllowed') || msg.includes('Permission')) {
        setError('麦克风权限被拒绝，请在系统设置中允许')
      } else {
        setError('启动语音讨论失败: ' + msg)
      }
    }
  }, [vadStart])

  /** 结束讨论 → 触发 AI 开始实施 */
  const stop = useCallback(() => {
    isActiveRef.current = false
    setIsActive(false)
    setState('idle')
    setError(null)

    // 停止 VAD
    vadStop()
    // 停止 TTS
    streamingTTS.stop()
    // 停止录音
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null // 阻止触发 processAudio
      recorder.stop()
      recorderRef.current = null
    }
    // 关闭麦克风流
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    prevContentRef.current = ''

    // 取消正在进行的流式回复
    const store = useStore.getState()
    if (store.isStreaming) void store.cancelStream()

    // 发送"讨论结束，开始实施"消息 — AI 基于讨论内容开始正式工作
    void store.sendMessage(
      '讨论结束。请基于以上讨论的方案，直接开始实施。不需要再确认，直接执行。',
      { skipNetworkHint: true },
    )
  }, [vadStop, streamingTTS])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      isActiveRef.current = false
      vadStop()
      streamingTTS.stop()
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') recorder.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [vadStop, streamingTTS])

  return { isActive, state, volume, error, start, stop }
}
