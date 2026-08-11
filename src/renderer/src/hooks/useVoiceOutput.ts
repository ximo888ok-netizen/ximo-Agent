import { useState, useRef, useCallback, useEffect } from 'react'

export interface UseVoiceOutputResult {
  /** 是否正在播放 */
  isSpeaking: boolean
  /** 系统可用语音列表 */
  voices: SpeechSynthesisVoice[]
  /** 当前浏览器是否支持语音合成 */
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

/**
 * 语音输出 Hook — 基于 Web Speech API (speechSynthesis)
 *
 * - 首次调用时异步加载系统语音列表
 * - 优先选择中文语音
 * - 自动剥离 Markdown 标记后再朗读
 * - 组件卸载时自动停止
 */
export function useVoiceOutput(): UseVoiceOutputResult {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

  const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null)

  // 加载语音列表（异步）
  useEffect(() => {
    if (!supported) return

    const loadVoices = (): void => {
      const list = window.speechSynthesis.getVoices()
      if (list.length > 0) {
        setVoices(list)
        selectedVoiceRef.current =
          list.find(v => v.lang.startsWith('zh')) ??
          list[0] ??
          null
      }
    }

    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices

    return () => {
      window.speechSynthesis.onvoiceschanged = null
    }
  }, [supported])

  const speak = useCallback((text: string) => {
    if (!supported || !text.trim()) return

    window.speechSynthesis.cancel()

    const cleanText = stripMarkdownForSpeech(text)
    if (!cleanText) return

    const utterance = new SpeechSynthesisUtterance(cleanText)
    if (selectedVoiceRef.current) {
      utterance.voice = selectedVoiceRef.current
      utterance.lang = selectedVoiceRef.current.lang
    }
    utterance.rate = 1.0
    utterance.pitch = 1.0

    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)

    window.speechSynthesis.speak(utterance)
  }, [supported])

  const stop = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }, [supported])

  // 组件卸载时停止
  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel()
    }
  }, [supported])

  return { isSpeaking, voices, speak, stop, supported }
}
