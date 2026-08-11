import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, Square, Volume2, VolumeX, Loader2 } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { useVoiceInput } from '@renderer/hooks/useVoiceInput'
import { useVoiceOutput } from '@renderer/hooks/useVoiceOutput'

const ORB_SIZE = 52
const STORAGE_KEY = 'ximo:voice-orb-pos'

type OrbState = 'idle' | 'listening' | 'transcribing' | 'speaking'

/** 从 localStorage 读取上次位置，缺省右下角 */
function loadPosition(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number') return parsed
    }
  } catch { /* ignore */ }
  return { x: window.innerWidth - 80, y: window.innerHeight - 140 }
}

/**
 * 悬浮语音圆球 — 集成 STT + TTS
 *
 * - 点击：开始录音 / 停止录音并转写 / 停止播报
 * - 拖拽：重新定位（位置持久化到 localStorage）
 * - hover 时出现 TTS 开关小按钮
 * - 录音中：红色脉冲 + 涟漪 + 声波柱
 * - 转写中：旋转加载图标
 * - 播报中：主题色跳动 + 声波柱
 * - 流式结束 + ttsEnabled → 自动播报最后一条助手消息
 */
export function VoiceOrb(): React.ReactElement | null {
  const ttsEnabled = useStore((s) => s.settings?.ttsEnabled ?? false)
  const updateSettings = useStore((s) => s.updateSettings)
  const isStreaming = useStore((s) => s.isStreaming)

  // 语音输入 — 识别结果通过 CustomEvent 发送给 GlobalChatInput
  const handleFinalText = useCallback((text: string) => {
    window.dispatchEvent(new CustomEvent('ximo:voice-text', { detail: text }))
  }, [])
  const { isListening, isTranscribing, supported: sttSupported, error, start, stop } = useVoiceInput(handleFinalText)

  // 语音输出
  const { isSpeaking, speak, stop: stopTts, supported: ttsSupported } = useVoiceOutput()

  const supported = sttSupported || ttsSupported
  const orbState: OrbState = isListening ? 'listening' : isTranscribing ? 'transcribing' : isSpeaking ? 'speaking' : 'idle'

  // ---- 拖拽定位 ----
  const [pos, setPos] = useState(loadPosition)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isTranscribing) return // 转写中不可拖拽
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [pos.x, pos.y, isTranscribing])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true
    if (drag.moved) {
      const newX = Math.max(8, Math.min(window.innerWidth - ORB_SIZE - 8, drag.origX + dx))
      const newY = Math.max(8, Math.min(window.innerHeight - ORB_SIZE - 8, drag.origY + dy))
      setPos({ x: newX, y: newY })
    }
  }, [])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    // 未移动 → 视为点击
    if (!drag.moved && !isTranscribing) {
      if (isListening) stop()
      else if (isSpeaking) stopTts()
      else void start()
    }
    // 持久化位置
    setPos((p) => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)) } catch { /* ignore */ }
      return p
    })
    dragRef.current = null
  }, [isListening, isTranscribing, isSpeaking, start, stop, stopTts])

  // ---- 流式结束 → TTS 自动播报 ----
  const prevStreamingRef = useRef(false)
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && ttsEnabled) {
      const state = useStore.getState()
      const conv = state.conversations.find(c => c.id === state.currentConversationId)
      const lastMsg = conv?.messages[conv.messages.length - 1]
      if (lastMsg?.role === 'assistant' && lastMsg.content) speak(lastMsg.content)
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming, ttsEnabled, speak])

  // ---- 组件卸载清理 ----
  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    }
  }, [])

  if (!supported) return null

  const showTtsBadge = ttsSupported
  const showActive = isListening || isSpeaking // 有动画的状态
  const showStatus = isTranscribing || (isListening && !isTranscribing)

  return (
    <div
      className={'voice-orb voice-orb--' + orbState}
      style={{ left: pos.x, top: pos.y, width: ORB_SIZE, height: ORB_SIZE }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* 涟漪环 — 录音/播报时扩散 */}
      {showActive && (
        <>
          <span className="voice-orb__ripple" />
          <span className="voice-orb__ripple voice-orb__ripple--delayed" />
        </>
      )}

      {/* 声波柱 — 录音/播报时跳动 */}
      {showActive && (
        <div className="voice-orb__bars">
          <span /><span /><span /><span />
        </div>
      )}

      {/* 中心图标 */}
      <div className="voice-orb__core">
        {isTranscribing ? (
          <Loader2 size={18} className="animate-spin" />
        ) : isListening ? (
          <Square size={16} fill="currentColor" />
        ) : isSpeaking ? (
          <Volume2 size={20} />
        ) : (
          <Mic size={18} />
        )}
      </div>

      {/* TTS 开关徽章 — hover 时显现 */}
      {showTtsBadge && (
        <button
          className="voice-orb__tts-badge"
          onClick={(e) => {
            e.stopPropagation()
            const next = !ttsEnabled
            void updateSettings({ ttsEnabled: next })
            if (!next) stopTts()
          }}
          title={ttsEnabled ? '关闭语音播报' : '开启语音播报'}
        >
          {ttsEnabled ? <Volume2 size={10} /> : <VolumeX size={10} />}
        </button>
      )}

      {/* 录音中状态提示 */}
      {isListening && (
        <div className="voice-orb__interim">录音中... 点击停止</div>
      )}

      {/* 转写中状态提示 */}
      {isTranscribing && (
        <div className="voice-orb__interim">转写中...</div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="voice-orb__error">{error}</div>
      )}
    </div>
  )
}
