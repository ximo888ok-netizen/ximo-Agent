import { useRef, useCallback, useEffect, useState } from 'react'

/** 句子结束符 — 检测到这些字符时切割出一句 */
const SENTENCE_END = /[。！？!?\n]/

/**
 * 流式 TTS — 将 AI 流式输出的文本按句子切割，逐句送 Web Speech API 朗读。
 *
 * 工作原理：
 * 1. push(chunk) 累积文本到缓冲区
 * 2. 检测到句号/问号/感叹号/换行 → 切割出完整句子 → 加入朗读队列
 * 3. 队列中句子依次朗读（utterance.onend → 播放下一句）
 * 4. flush() 强制朗读缓冲区剩余文本
 * 5. stop() 立即停止朗读并清空队列
 */
export function useStreamingTTS(): {
  isSpeaking: boolean
  push: (text: string) => void
  flush: () => void
  stop: () => void
} {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

  const bufferRef = useRef('')
  const queueRef = useRef<string[]>([])
  const speakingRef = useRef(false)
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)

  // 加载中文语音（异步）
  useEffect(() => {
    if (!supported) return
    const load = (): void => {
      const list = window.speechSynthesis.getVoices()
      if (list.length > 0) {
        voiceRef.current = list.find(v => v.lang.startsWith('zh')) ?? list[0] ?? null
      }
    }
    load()
    window.speechSynthesis.onvoiceschanged = load
    return () => { window.speechSynthesis.onvoiceschanged = null }
  }, [supported])

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

  /** 朗读队列中下一句 */
  const speakNext = useCallback(() => {
    if (queueRef.current.length === 0) {
      speakingRef.current = false
      setIsSpeaking(false)
      return
    }

    const text = queueRef.current.shift()!
    const clean = cleanText(text)
    if (!clean) {
      speakNext()
      return
    }

    const utterance = new SpeechSynthesisUtterance(clean)
    if (voiceRef.current) {
      utterance.voice = voiceRef.current
      utterance.lang = voiceRef.current.lang
    }
    utterance.rate = 1.1
    utterance.onend = () => speakNext()
    utterance.onerror = () => speakNext()
    window.speechSynthesis.speak(utterance)
  }, [])

  /** 推入流式文本片段 */
  const push = useCallback((text: string) => {
    if (!supported || !text) return
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
      speakingRef.current = true
      setIsSpeaking(true)
      speakNext()
    }
  }, [supported, speakNext])

  /** 强制朗读缓冲区剩余文本 */
  const flush = useCallback(() => {
    if (!supported) return
    if (bufferRef.current.trim()) {
      queueRef.current.push(bufferRef.current)
      bufferRef.current = ''
    }
    if (!speakingRef.current && queueRef.current.length > 0) {
      speakingRef.current = true
      setIsSpeaking(true)
      speakNext()
    }
  }, [supported, speakNext])

  /** 立即停止 */
  const stop = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.cancel()
    queueRef.current = []
    bufferRef.current = ''
    speakingRef.current = false
    setIsSpeaking(false)
  }, [supported])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel()
    }
  }, [supported])

  return { isSpeaking, push, flush, stop }
}
