import { useState, useRef, useCallback, useEffect } from 'react'
import { useStore } from '@renderer/store/useStore'
import { useStreamingTTS } from './useStreamingTTS'
import type { ApiMessage, ChatRequest, StreamChunk } from '@shared/types'

export type DiscussionState = 'idle' | 'listening' | 'transcribing' | 'speaking'

/**
 * 语音讨论模式 — 回合制，讨论内容存本地实例，不污染主对话框。
 *
 * 流程：
 * 1. start() → 打开麦克风 → 自动开始录音 → state='listening'
 * 2. 用户点击麦克风 → 停止录音 → 转写 → discussWithAI() → state='speaking'
 * 3. AI 回复通过 window.api.chat.stream 直接流式获取 → TTS 朗读（不经过 store）
 * 4. TTS 朗读完毕 → 自动开始下一轮录音 → state='listening'
 * 5. stop() → 汇总所有讨论内容 → 改写为明确任务描述 → 一次性 sendMessage 到主对话框
 */
export function useVoiceDiscussion(): {
  isActive: boolean
  state: DiscussionState
  volume: number
  error: string | null
  isAIResponding: boolean
  start: () => Promise<void>
  stop: () => Promise<void>
  toggleRecording: () => void
} {
  const [isActive, setIsActive] = useState(false)
  const [state, setState] = useState<DiscussionState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isAIResponding, setIsAIResponding] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const isActiveRef = useRef(false)
  const isAIRespondingRef = useRef(false)

  // 讨论消息 — 完全存本地，不进入 store 的 conversation
  const discussionMessagesRef = useRef<ApiMessage[]>([])

  const edgeTtsVoice = useStore((s) => s.settings?.edgeTtsVoice)
  const streamingTTS = useStreamingTTS(edgeTtsVoice)
  const ttsPush = streamingTTS.push
  const ttsFlush = streamingTTS.flush
  const ttsStop = streamingTTS.stop
  const ttsSpeakingRef = useRef(false)
  useEffect(() => { ttsSpeakingRef.current = streamingTTS.isSpeaking }, [streamingTTS.isSpeaking])

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

  // startRecording 用 ref 持有，避免循环依赖
  const startRecordingRef = useRef<() => void>(() => {})
  // 标记 AI 被用户手动打断，跳过自动重新录音
  const interruptedRef = useRef(false)

  /** 直接调用 AI 流式接口 — 绕过 store，讨论内容不进入主对话框 */
  const discussWithAI = useCallback(async (userText: string) => {
    const store = useStore.getState()
    const settings = store.settings
    if (!settings) return

    // 追加用户消息到讨论历史
    discussionMessagesRef.current.push({ role: 'user', content: userText })

    // 构建请求 — 简洁讨论模式，无工具、无思维链
    const request: ChatRequest = {
      mode: store.currentMode,
      messages: [
        { role: 'system', content: '你是用户的语音讨论伙伴。正在通过语音讨论任务方案。回复规则：极简口语化，不超过两句话，直接回答核心问题，不用列表/代码/标题。' },
        ...discussionMessagesRef.current,
      ],
      model: settings.model,
      thinkingMode: false,
      reasoningEffort: 'off',
      temperature: settings.temperature,
      maxTokens: 2048,
      sessionId: 'voice-discussion',
      providerId: settings.activeProviderId ?? 'deepseek',
    }

    isAIRespondingRef.current = true
    setIsAIResponding(true)
    setState('speaking')

    let fullResponse = ''
    try {
      await window.api.chat.stream(request, (chunk: StreamChunk) => {
        if (chunk.content) {
          fullResponse += chunk.content
          ttsPush(chunk.content)
        }
        if (chunk.error) {
          setError(chunk.error)
        }
      })
    } catch {
      // 流式异常 — 不中断讨论，继续下一轮
    }

    // 追加 AI 回复到讨论历史
    if (fullResponse.trim()) {
      discussionMessagesRef.current.push({ role: 'assistant', content: fullResponse })
    }

    isAIRespondingRef.current = false
    setIsAIResponding(false)

    if (!interruptedRef.current) {
      // 正常结束 → 等待 TTS 朗读完毕 → 自动开始下一轮录音
      // 需要连续 3 次（600ms）检测到非播放状态才确认 TTS 真正结束，避免 isSpeaking 异步更新导致的竞态
      ttsFlush()
      let stableCount = 0
      const check = setInterval(() => {
        if (!ttsSpeakingRef.current) {
          stableCount++
          if (stableCount >= 3) {
            clearInterval(check)
            if (isActiveRef.current) startRecordingRef.current()
          }
        } else {
          stableCount = 0
        }
      }, 200)
      setTimeout(() => clearInterval(check), 30000)
    } else {
      // 用户已手动打断 → 跳过自动重新录音
      interruptedRef.current = false
    }
  }, [ttsPush, ttsFlush])

  /** 处理录音结束后的音频 */
  const processAudio = useCallback(async (blob: Blob) => {
    if (blob.size < 500) {
      startRecordingRef.current()
      return
    }
    setState('transcribing')
    try {
      const pcm = await decodeToPCM(blob)
      const result = await window.api.voice.transcribe(pcm, 16000)
      if (result.error) {
        setError(result.error)
        startRecordingRef.current()
      } else if (result.text) {
        await discussWithAI(result.text)
      } else {
        startRecordingRef.current()
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError('语音识别失败: ' + msg)
      startRecordingRef.current()
    }
  }, [decodeToPCM, discussWithAI])

  /** 开始一轮新录音 */
  const startRecording = useCallback(() => {
    if (!isActiveRef.current) return
    const stream = streamRef.current
    if (!stream) return
    const old = recorderRef.current
    if (old && old.state !== 'inactive') {
      old.onstop = null
      old.stop()
    }
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
    setState('listening')
  }, [processAudio])

  useEffect(() => { startRecordingRef.current = startRecording }, [startRecording])

  /** 切换录音 — listening→停止并发送 / speaking→打断AI并开始新录音 */
  const toggleRecording = useCallback(() => {
    if (state === 'listening') {
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop()
        recorderRef.current = null
      }
    } else if (state === 'speaking') {
      // 用户手动打断 AI → 取消流 + 停止 TTS + 立即开始新录音
      interruptedRef.current = true
      void window.api.chat.cancel()
      ttsStop()
      ttsSpeakingRef.current = false
      isAIRespondingRef.current = false
      setIsAIResponding(false)
      startRecordingRef.current()
    }
  }, [state, ttsStop])

  /** 进入语音讨论模式 */
  const start = useCallback(async () => {
    setError(null)
    try {
      // 清理残留状态
      const store = useStore.getState()
      if (store.isStreaming) await store.cancelStream()
      ttsStop()
      ttsSpeakingRef.current = false
      discussionMessagesRef.current = []

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream
      isActiveRef.current = true
      setIsActive(true)
      startRecording()
      stream.getTracks().forEach((t) => {
        t.onended = () => {
          if (isActiveRef.current) {
            setError('麦克风被系统关闭（可能被其他应用占用或系统隐私设置）')
          }
        }
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('NotAllowed') || msg.includes('Permission')) {
        setError('麦克风权限被拒绝，请在系统设置中允许')
      } else {
        setError('启动语音讨论失败:B ' + msg)
      }
    }
  }, [startRecording, ttsStop])

  /** 结束讨论 → 汇总讨论内容 → 一次性发送到主对话框 */
  const stop = useCallback(async () => {
    isActiveRef.current = false
    setIsActive(false)
    setState('idle')
    setError(null)
    setIsAIResponding(false)
    isAIRespondingRef.current = false

    ttsStop()
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null
      recorder.stop()
      recorderRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null

    // 取消可能正在进行的讨论流
    await window.api.chat.cancel()

    // 汇总讨论内容
    const messages = discussionMessagesRef.current
    discussionMessagesRef.current = []

    if (messages.length === 0) return

    // 将讨论内容格式化为一条明确的任务描述
    const discussionTranscript = messages
      .map((m) => m.role === 'user' ? `用户：${m.content}` : `AI：${m.content}`)
      .join('\n\n')

    const summaryPrompt = `以下是用户与AI通过语音讨论的完整内容：

${discussionTranscript}

---

请基于以上讨论，汇总并改写为明确的任务描述，然后直接开始实施。不需要再确认，直接执行。`

    // 一次性发送到主对话框
    const store = useStore.getState()
    if (store.isStreaming) await store.cancelStream()
    void store.sendMessage(summaryPrompt, { skipNetworkHint: true })
  }, [ttsStop])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      isActiveRef.current = false
      isAIRespondingRef.current = false
      ttsStop()
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') recorder.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [ttsStop])

  return { isActive, state, volume: 0, error, isAIResponding, start, stop, toggleRecording }
}
