import { useState, useRef, useCallback, useEffect } from 'react'
import { useStore } from '@renderer/store/useStore'

const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural'

export interface UseVoiceOutputResult {
  /** 是否正在播放 */
  isSpeaking: boolean
  /** Edge TTS 是否可用（始终 true，服务端合成） */
  supported: boolean
  /** 播放文本（自动清理 Markdown） */
  speak: (text: string) => void
  /** 停止播放 */
  stop: () => void
}

/** 剥离 Markdown 标记，使 TTS 朗读更自然 */
function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/```[\w]*[\s\S]*?```/g, '（代码块）')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*{1,3}|_{1,3})(.+?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/^>\s+/gm, '')
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** 将 IPC 返回的数据转为 ArrayBuffer */
function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data
  // 同 useStreamingTTS.ts：普通 Uint8Array 上的视图，slice 结果必然是 ArrayBuffer
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}

/**
 * 语音输出 Hook — 基于 Edge TTS
 *
 * - 通过 IPC 调用主进程 Edge TTS 合成 MP3 音频
 * - 使用 AudioContext 解码并播放
 * - 自动剥离 Markdown 标记后再朗读
 * - 组件卸载时自动停止
 */
export function useVoiceOutput(): UseVoiceOutputResult {
  const [isSpeaking, setIsSpeaking] = useState(false)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const sessionRef = useRef(0)
  const voiceRef = useRef(DEFAULT_VOICE)

  const edgeTtsVoice = useStore((s) => s.settings?.edgeTtsVoice)
  useEffect(() => {
    voiceRef.current = edgeTtsVoice || DEFAULT_VOICE
  }, [edgeTtsVoice])

  /** 获取或创建 AudioContext */
  function getAudioContext(): AudioContext {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext()
    }
    return audioCtxRef.current
  }

  const speak = useCallback((text: string) => {
    if (!text.trim()) return

    // 停止当前播放
    sessionRef.current++
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop() } catch { /* noop */ }
      currentSourceRef.current = null
    }

    const cleanText = stripMarkdownForSpeech(text)
    if (!cleanText) return

    const session = sessionRef.current
    setIsSpeaking(true)

    void (async () => {
      try {
        const { buffer, error } = await window.api.voice.tts.synthesize(cleanText, voiceRef.current)
        if (session !== sessionRef.current || !buffer || error) {
          setIsSpeaking(false)
          return
        }

        const ctx = getAudioContext()
        const audioBuffer = await ctx.decodeAudioData(toArrayBuffer(buffer))
        if (session !== sessionRef.current) return

        const source = ctx.createBufferSource()
        source.buffer = audioBuffer
        source.connect(ctx.destination)
        currentSourceRef.current = source
        source.onended = () => {
          currentSourceRef.current = null
          if (session === sessionRef.current) setIsSpeaking(false)
        }
        source.start()
      } catch {
        if (session === sessionRef.current) setIsSpeaking(false)
      }
    })()
  }, [])

  const stop = useCallback(() => {
    sessionRef.current++
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop() } catch { /* noop */ }
      currentSourceRef.current = null
    }
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

  return { isSpeaking, supported: true, speak, stop }
}
