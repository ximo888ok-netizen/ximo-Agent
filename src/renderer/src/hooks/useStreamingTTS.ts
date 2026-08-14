import { useRef, useCallback, useEffect, useState } from 'react'

/** 句子结束符 — 检测到这些字符时切割出一句 */
const SENTENCE_END = /[。！？!?\n]/

const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural'

/**
 * 流式 TTS — 将 AI 流式输出的文本按句子切割，逐句送 Edge TTS 合成并播放。
 *
 * 工作原理：
 * 1. push(chunk) 累积文本到缓冲区
 * 2. 检测到句号/问号/感叹号/换行 → 切割出完整句子 → 加入朗读队列
 * 3. 队列中句子依次通过 Edge TTS 合成 MP3 → AudioContext 解码播放
 * 4. flush() 强制朗读缓冲区剩余文本
 * 5. stop() 立即停止朗读并清空队列
 */
export function useStreamingTTS(voice?: string): {
  isSpeaking: boolean
  push: (text: string) => void
  flush: () => void
  stop: () => void
} {
  const [isSpeaking, setIsSpeaking] = useState(false)

  const bufferRef = useRef('')
  const queueRef = useRef<string[]>([])
  const speakingRef = useRef(false)
  const voiceRef = useRef(voice || DEFAULT_VOICE)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const sessionRef = useRef(0)

  // 更新 voice
  useEffect(() => {
    voiceRef.current = voice || DEFAULT_VOICE
  }, [voice])

  /** 剥离 Markdown 标记 */
  function cleanText(text: string): string {
    return text
      .replace(/```[\w]*[\s\S]*?```/g, '（代码块）')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/(\*{1,3}|_{1,3})(.+?)\1/g, '$2')
      .replace(/^>\s+/gm, '')
      .replace(/^[\s]*[-*+]\s+/gm, '')
      .replace(/^[\s]*\d+\.\s+/gm, '')
      .trim()
  }

  /** 获取或创建 AudioContext */
  function getAudioContext(): AudioContext {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext()
    }
    return audioCtxRef.current
  }

  /** 将 IPC 返回的数据转为 ArrayBuffer */
  function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
    if (data instanceof ArrayBuffer) return data
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  }

  /** 朗读队列中下一句 */
  const speakNext = useCallback(async () => {
    const session = sessionRef.current
    if (queueRef.current.length === 0) {
      speakingRef.current = false
      setIsSpeaking(false)
      return
    }

    const text = queueRef.current.shift()!
    const clean = cleanText(text)
    if (!clean) {
      void speakNext()
      return
    }

    try {
      const { buffer, error } = await window.api.voice.tts.synthesize(clean, voiceRef.current)
      if (session !== sessionRef.current || !buffer || error) {
        if (session === sessionRef.current) void speakNext()
        return
      }

      const ctx = getAudioContext()
      const arrayBuf = toArrayBuffer(buffer)
      const audioBuffer = await ctx.decodeAudioData(arrayBuf)
      if (session !== sessionRef.current) return

      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)
      currentSourceRef.current = source
      source.onended = () => {
        currentSourceRef.current = null
        if (session === sessionRef.current) void speakNext()
      }
      source.start()
    } catch {
      if (session === sessionRef.current) void speakNext()
    }
  }, [])

  /** 推入流式文本片段 */
  const push = useCallback((text: string) => {
    if (!text) return
    bufferRef.current += text

    // 按句子结束符切割
    while (true) {
      const match = bufferRef.current.match(SENTENCE_END)
      if (!match || match.index === undefined) break
      const end = match.index + match[0].length
      const sentence = bufferRef.current.slice(0, end)
      bufferRef.current = bufferRef.current.slice(end)
      if (sentence.trim()) {
        queueRef.current.push(sentence)
      }
    }

    // 如果没有正在说话，立即开始
    if (!speakingRef.current && queueRef.current.length > 0) {
      sessionRef.current++
      speakingRef.current = true
      setIsSpeaking(true)
      void speakNext()
    }
  }, [speakNext])

  /** 强制朗读缓冲区剩余文本 */
  const flush = useCallback(() => {
    if (bufferRef.current.trim()) {
      queueRef.current.push(bufferRef.current)
      bufferRef.current = ''
    }
    if (!speakingRef.current && queueRef.current.length > 0) {
      sessionRef.current++
      speakingRef.current = true
      setIsSpeaking(true)
      void speakNext()
    }
  }, [speakNext])

  /** 立即停止 */
  const stop = useCallback(() => {
    sessionRef.current++
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop() } catch { /* noop */ }
      currentSourceRef.current = null
    }
    queueRef.current = []
    bufferRef.current = ''
    speakingRef.current = false
    setIsSpeaking(false)
  }, [])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      sessionRef.current++
      if (currentSourceRef.current) {
        try { currentSourceRef.current.stop() } catch { /* noop */ }
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {})
      }
    }
  }, [])

  return { isSpeaking, push, flush, stop }
}
