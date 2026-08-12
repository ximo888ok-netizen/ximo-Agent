import { useRef, useCallback, useEffect, useState } from 'react'

/** VAD 配置 */
interface VADOptions {
  /** 音量阈值（0-255），超过此值认为在说话。默认 18 */
  threshold?: number
  /** 静音持续多久（ms）判定说话结束。默认 1200 */
  silenceDuration?: number
  /** 检测到说话开始 */
  onSpeechStart?: () => void
  /** 检测到说话结束 */
  onSpeechEnd?: () => void
}

/**
 * VAD（Voice Activity Detection）— 基于 AnalyserNode 的能量阈值检测。
 *
 * 给定一个 MediaStream（麦克风），持续分析音量：
 * - 音量 > threshold → 标记"正在说话"
 * - 说话后音量 < threshold 持续 silenceDuration ms → 触发 onSpeechEnd
 * - 安静状态下音量 > threshold → 触发 onSpeechStart
 *
 * 纯浏览器 API，零依赖，零模型。
 */
export function useVAD(stream: MediaStream | null, options: VADOptions = {}): {
  isMonitoring: boolean
  isSpeaking: boolean
  volume: number
  start: () => void
  stop: () => void
} {
  const { threshold = 18, silenceDuration = 1200, onSpeechStart, onSpeechEnd } = options

  const [isMonitoring, setIsMonitoring] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [volume, setVolume] = useState(0)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const dataRef = useRef<Uint8Array | null>(null)
  const speakingRef = useRef(false)
  const silenceStartRef = useRef<number | null>(null)
  const callbacksRef = useRef({ onSpeechStart, onSpeechEnd })

  useEffect(() => {
    callbacksRef.current = { onSpeechStart, onSpeechEnd }
  }, [onSpeechStart, onSpeechEnd])

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    analyserRef.current = null
    dataRef.current = null
    speakingRef.current = false
    silenceStartRef.current = null
    setIsMonitoring(false)
    setIsSpeaking(false)
    setVolume(0)
  }, [])

  const start = useCallback(() => {
    if (!stream || isMonitoring) return

    const audioCtx = new AudioContext()
    const source = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.6
    source.connect(analyser)

    audioCtxRef.current = audioCtx
    analyserRef.current = analyser
    dataRef.current = new Uint8Array(analyser.frequencyBinCount)
    setIsMonitoring(true)

    const data = dataRef.current

    const tick = (): void => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      analyser.getByteFrequencyData(data as any)
      // 计算平均音量（人声主要在 85-255Hz，对应低频 bin）
      let sum = 0
      const bins = Math.min(data.length, 32) // 只取低频部分，减少高频噪声干扰
      for (let i = 0; i < bins; i++) sum += data[i]
      const avg = sum / bins
      setVolume(avg)

      if (avg > threshold) {
        // 有声音
        if (!speakingRef.current) {
          speakingRef.current = true
          silenceStartRef.current = null
          setIsSpeaking(true)
          callbacksRef.current.onSpeechStart?.()
        }
      } else {
        // 安静
        if (speakingRef.current) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = Date.now()
          } else if (Date.now() - silenceStartRef.current > silenceDuration) {
            speakingRef.current = false
            silenceStartRef.current = null
            setIsSpeaking(false)
            callbacksRef.current.onSpeechEnd?.()
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [stream, isMonitoring, threshold, silenceDuration])

  // 组件卸载或 stream 变化时清理
  useEffect(() => {
    return () => { stop() }
  }, [stop])

  return { isMonitoring, isSpeaking, volume, start, stop }
}
