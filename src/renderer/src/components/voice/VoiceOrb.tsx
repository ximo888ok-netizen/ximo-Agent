import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, MessageCircle, Volume2 } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { useVoiceInput } from '@renderer/hooks/useVoiceInput'
import { useVoiceOutput } from '@renderer/hooks/useVoiceOutput'
import { useVoiceDiscussion } from '@renderer/hooks/useVoiceDiscussion'
import { VoiceOrbPanel } from './VoiceOrbPanel'

const ORB_SIZE = 52
const STORAGE_KEY = 'ximo:voice-orb-pos'

type OrbState = 'idle' | 'listening' | 'transcribing' | 'speaking' | 'discussing'

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
 * 悬浮语音圆球 — 点击弹出全屏语音讨论面板
 *
 * - 点击（无拖拽）：弹出/收起全屏语音讨论面板
 * - 拖拽：重新定位（位置持久化到 localStorage）
 * - 面板内「麦克风」→ 开始实时语音对话
 * - 面板内「结束」→ AI 总结讨论内容并自动开始实施
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

  // 语音讨论模式
  const discussion = useVoiceDiscussion()

  const supported = sttSupported || ttsSupported
  const orbState: OrbState = discussion.isActive
    ? 'discussing'
    : isListening ? 'listening' : isTranscribing ? 'transcribing' : isSpeaking ? 'speaking' : 'idle'

  // ---- 面板开合 ----
  const [panelOpen, setPanelOpen] = useState(false)
  // ---- 最小化状态 ----
  const [isMinimized, setIsMinimized] = useState(false)

  // 讨论激活时自动打开面板（如果不是最小化状态），结束后关闭
  useEffect(() => {
    if (discussion.isActive) {
      setPanelOpen(true)
      setIsMinimized(false)
    } else {
      setPanelOpen(false)
    }
  }, [discussion.isActive])

  // ---- 拖拽定位 ----
  const [pos, setPos] = useState(loadPosition)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isTranscribing) return
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
    // 未拖拽 → 切换面板开合或还原最小化
    if (!drag.moved) {
      if (isMinimized) {
        // 最小化状态 → 还原面板
        setIsMinimized(false)
        setPanelOpen(true)
      } else if (!discussion.isActive) {
        // 正常状态 → 切换面板
        setPanelOpen((open) => !open)
      }
    }
    // 持久化位置
    setPos((p) => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)) } catch { /* ignore */ }
      return p
    })
    dragRef.current = null
  }, [discussion.isActive, isMinimized])

  // ESC 关闭面板
  useEffect(() => {
    if (!panelOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (discussion.isActive) discussion.stop()
        else setPanelOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panelOpen, discussion])

  // ---- 流式结束 → TTS 自动播报（非讨论模式下） ----
  const prevStreamingRef = useRef(false)
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && ttsEnabled && !discussion.isActive) {
      const state = useStore.getState()
      const conv = state.conversations.find(c => c.id === state.currentConversationId)
      const lastMsg = conv?.messages[conv.messages.length - 1]
      if (lastMsg?.role === 'assistant' && lastMsg.content) speak(lastMsg.content)
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming, ttsEnabled, speak, discussion.isActive])

  // ---- 组件卸载清理 ----
  useEffect(() => {
    return () => {
      stopTts()
    }
  }, [stopTts])

  if (!supported) return null

  const showActive = isListening || isSpeaking || discussion.isActive

  return (
    <>
      {/* 全屏居中弹窗 */}
      {panelOpen && (
        <div
          className="voice-panel-anchor"
          onClick={(e) => {
            // 点击遮罩层关闭面板（非讨论中）
            if (e.target === e.currentTarget && !discussion.isActive) {
              setPanelOpen(false)
            }
          }}
        >
          <VoiceOrbPanel
            isActive={discussion.isActive}
            state={discussion.state}
            error={error || discussion.error}
            sttSupported={sttSupported}
            ttsSupported={ttsSupported}
            ttsEnabled={ttsEnabled}
            isStreaming={isStreaming || discussion.isAIResponding}
            volume={discussion.volume}
            onStart={() => void discussion.start()}
            onStop={() => discussion.stop()}
            onToggleRecording={() => discussion.toggleRecording()}
            onToggleTts={() => {
              const next = !ttsEnabled
              void updateSettings({ ttsEnabled: next })
              if (!next) stopTts()
            }}
            onClose={() => setPanelOpen(false)}
            onMinimize={() => {
              setIsMinimized(true)
              setPanelOpen(false)
            }}
          />
        </div>
      )}

      {/* 悬浮球 */}
      <div
        className={'voice-orb voice-orb--' + orbState}
        style={{ left: pos.x, top: pos.y, width: ORB_SIZE, height: ORB_SIZE }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* 涟漪环 */}
        {showActive && (
          <>
            <span className="voice-orb__ripple" />
            <span className="voice-orb__ripple voice-orb__ripple--delayed" />
          </>
        )}

        {/* 声波柱 */}
        {showActive && (
          <div className="voice-orb__bars">
            <span /><span /><span /><span />
          </div>
        )}

        {/* 中心图标 */}
        <div className="voice-orb__core">
          {discussion.isActive ? (
            <MessageCircle size={16} />
          ) : panelOpen ? (
            <MessageCircle size={16} />
          ) : isTranscribing ? (
            <Volume2 size={20} />
          ) : isListening ? (
            <Volume2 size={20} />
          ) : isSpeaking ? (
            <Volume2 size={20} />
          ) : (
            <Mic size={16} />
          )}
        </div>

        {/* 录音中状态提示 */}
        {isListening && !discussion.isActive && (
          <div className="voice-orb__interim">录音中... 点击停止</div>
        )}

        {/* 转写中状态提示 */}
        {isTranscribing && !discussion.isActive && (
          <div className="voice-orb__interim">转写中...</div>
        )}

        {/* 错误提示（非面板模式下） */}
        {error && !panelOpen && !discussion.isActive && (
          <div className="voice-orb__error">{error}</div>
        )}

        {/* 最小化状态：讨论中指示 */}
        {isMinimized && discussion.isActive && (
          <div className="voice-orb__badge">讨论中</div>
        )}
      </div>
    </>
  )
}
