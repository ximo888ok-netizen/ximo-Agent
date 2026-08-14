import { useState, useRef, useEffect, useCallback } from 'react'
import { Mic, Keyboard, Link, X, Minimize2, Volume2 } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import type { DiscussionState } from '@renderer/hooks/useVoiceDiscussion'

interface TtsVoiceInfo {
  shortName: string
  name: string
  gender: string
  locale: string
}

export interface VoiceOrbPanelProps {
  /** 讨论是否激活 */
  isActive: boolean
  /** 讨论状态 */
  state: DiscussionState
  /** 错误信息 */
  error: string | null
  /** STT 是否可用 */
  sttSupported: boolean
  /** TTS 是否可用 */
  ttsSupported: boolean
  /** TTS 是否开启 */
  ttsEnabled: boolean
  /** 是否正在流式回复 */
  isStreaming: boolean
  /** 实时麦克风音量（0-255），用于排障：判断系统是否真的捕获到麦克风信号 */
  volume: number
  /** 开始讨论 */
  onStart: () => void
  /** 结束讨论 */
  onStop: () => void
  /** 切换录音（录音中 → 停止并发送） */
  onToggleRecording: () => void
  /** 切换 TTS 开关 */
  onToggleTts: () => void
  /** 关闭面板（仅关闭，不触发结束讨论） */
  onClose: () => void
  /** 最小化面板 */
  onMinimize: () => void
}

/** 格式化 MM:ss */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * 粒子圆环 — 用 Canvas 绘制旋转的粒子环
 * 支持自定义颜色、大小、速度
 */
function ParticleRing({
  active,
  size = 240,
  color,
  scale = 1.0,
  speed = 1.0,
}: {
  active: boolean
  size?: number
  color?: string
  scale?: number
  speed?: number
}): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 高 DPI 支持
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    const cx = size / 2
    const cy = size / 2
    const radius = size * 0.38 * scale
    const particleCount = 120
    const particles: { angle: number; dist: number; speed: number; size: number; opacity: number }[] = []

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3
      const distVar = 0.85 + Math.random() * 0.3
      particles.push({
        angle,
        dist: radius * distVar,
        speed: (0.002 + Math.random() * 0.004) * speed,
        size: (1 + Math.random() * 1.8) * scale,
        opacity: 0.25 + Math.random() * 0.55,
      })
    }

    let rotation = 0
    const draw = (): void => {
      ctx.clearRect(0, 0, size, size)
      rotation += (active ? 0.003 : 0.0008) * speed

      for (const p of particles) {
        p.angle += p.speed
        const a = p.angle + rotation
        const x = cx + Math.cos(a) * p.dist
        const y = cy + Math.sin(a) * p.dist

        ctx.beginPath()
        ctx.arc(x, y, p.size, 0, Math.PI * 2)
        // 解析颜色
        if (color) {
          // 如果是 hex，转为 rgba
          const hex = color.replace('#', '')
          const r = parseInt(hex.substring(0, 2), 16)
          const g = parseInt(hex.substring(2, 4), 16)
          const b = parseInt(hex.substring(4, 6), 16)
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.opacity})`
        } else {
          ctx.fillStyle = `rgba(100, 100, 110, ${p.opacity})`
        }
        ctx.fill()
      }

      animRef.current = requestAnimationFrame(draw)
    }
    draw()

    return () => cancelAnimationFrame(animRef.current)
  }, [size, active, color, scale, speed])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className="voice-panel__ring"
    />
  )
}

/**
 * 语音讨论面板 — 全屏居中弹窗
 *
 * UI 结构（参考截图）：
 *   ┌─────────────────────────────┐
 *   │         00:00    [开启字幕] × │  ← 顶栏：计时器 + 字幕开关 + 关闭
 *   │                             │
 *   │       ○○○○○○○○○○            │  ← 粒子圆环动画
 *   │     ○○○○○ ○○○○○             │
 *   │    ○○○○     ○○○○             │
 *   │     ○○○○○ ○○○○○             │
 *   │       ○○○○○○○○○○            │
 *   │                             │
 *   │   throw error from...       │  ← 错误/提示文字
 *   │                             │
 *   │    [🎤]  [结束]  [🔗]       │  ← 底部三按钮
 *   └─────────────────────────────┘
 */
export function VoiceOrbPanel(props: VoiceOrbPanelProps): React.ReactElement {
  const { isActive, state, error, sttSupported, ttsEnabled, isStreaming, volume, onStart, onStop, onToggleRecording, onToggleTts, onClose, onMinimize } = props

  // 读取自定义设置
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const style = settings?.voiceDiscussionStyle ?? 'default'
  const particleColor = settings?.voiceDiscussionParticleColor
  const particleScale = settings?.voiceDiscussionParticleScale ?? 1.0
  const particleSpeed = settings?.voiceDiscussionParticleSpeed ?? 1.0
  const bgOpacity = settings?.voiceDiscussionBgOpacity ?? 0.96
  const borderRadius = settings?.voiceDiscussionBorderRadius ?? 24
  const blur = settings?.voiceDiscussionBlur ?? 20
  const customCss = settings?.voiceDiscussionCustomCss ?? ''

  const [seconds, setSeconds] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Edge TTS 音色列表
  const [voices, setVoices] = useState<TtsVoiceInfo[]>([])
  const currentVoice = settings?.edgeTtsVoice ?? 'zh-CN-XiaoxiaoNeural'

  useEffect(() => {
    void window.api.voice.tts.voices().then((list) => {
      if (list && list.length > 0) setVoices(list)
    })
  }, [])

  // 中文音色优先排序
  const sortedVoices = voices.length > 0
    ? [...voices].sort((a, b) => {
        const aZh = a.locale.startsWith('zh') ? 0 : 1
        const bZh = b.locale.startsWith('zh') ? 0 : 1
        if (aZh !== bZh) return aZh - bZh
        return a.shortName.localeCompare(b.shortName)
      })
    : []

  const handleVoiceChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    void updateSettings({ edgeTtsVoice: e.target.value })
  }, [updateSettings])

  // 计时器 — 讨论中计时
  useEffect(() => {
    if (isActive) {
      setSeconds(0)
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isActive])

  // 关闭按钮 → 结束讨论并关闭面板
  const handleClose = useCallback(() => {
    if (isActive) onStop()
    else onClose()
  }, [isActive, onStop, onClose])

  // 提示文字
  const hintText = error
    ? error
    : !isActive
      ? '点击下方麦克风按钮开始语音讨论'
      : state === 'listening'
        ? '录音中 · 点击麦克风结束说话'
        : state === 'transcribing'
          ? '识别中...'
          : state === 'speaking' || isStreaming
            ? 'AI 正在回复 · 点击麦克风打断'
            : '讨论中'

  // 构建面板样式
  const panelStyle: React.CSSProperties = {
    opacity: bgOpacity,
    borderRadius: `${borderRadius}px`,
  }

  // 样式类名
  const styleClass = `voice-panel--${style}`

  return (
    <>
      {/* 自定义CSS注入 */}
      {customCss && (
        <style>{`
          .voice-panel { ${customCss} }
        `}</style>
      )}
      <div
        className={`voice-panel ${styleClass}`}
        style={panelStyle}
        role="dialog"
        aria-label="语音讨论"
      >
        {/* 顶部栏 */}
        <div className="voice-panel__topbar">
          <span className="voice-panel__timer">{formatTime(seconds)}</span>
          <div className="voice-panel__top-actions">
            {/* 音色选择 */}
            <div className="voice-panel__voice-select">
              <Volume2 size={14} />
              <select
                value={currentVoice}
                onChange={handleVoiceChange}
                title="选择 TTS 音色"
              >
                {sortedVoices.length > 0 ? (
                  sortedVoices.map((v) => (
                    <option key={v.shortName} value={v.shortName}>
                      {v.shortName.replace(/Neural$/, '')} ({v.gender})
                    </option>
                  ))
                ) : (
                  <option value={currentVoice}>{currentVoice}</option>
                )}
              </select>
            </div>
            <button
              className="voice-panel__top-btn"
              onClick={onToggleTts}
              title={ttsEnabled ? '关闭字幕播报' : '开启字幕播报'}
            >
              <Keyboard size={14} />
              <span>{ttsEnabled ? '开启字幕' : '关闭字幕'}</span>
            </button>
            <button className="voice-panel__top-btn" onClick={onMinimize} title="最小化">
              <Minimize2 size={16} />
            </button>
            <button className="voice-panel__top-btn voice-panel__close" onClick={handleClose} title="关闭">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 中间区域：粒子圆环 + 提示文字 */}
        <div className="voice-panel__center">
          <ParticleRing
            active={isActive}
            color={particleColor || settings?.themeColor}
            scale={particleScale}
            speed={particleSpeed}
          />
          <p className={`voice-panel__hint ${error ? 'voice-panel__hint--error' : ''}`}>
            {hintText}
          </p>
          {/* 排障：实时麦克风音量条 */}
          {isActive && volume > 0 && (
            <div className="voice-panel__meter">
              <div
                className="voice-panel__meter-fill"
                style={{ width: `${Math.min(100, (volume / 255) * 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* 底部三按钮 */}
        <div className="voice-panel__actions">
          {/* 麦克风按钮 — 回合制：未激活→开始 / 录音中→停止并发送 / AI回复中→打断 / 识别中→禁用 */}
          <button
            className={`voice-panel__action-btn ${state === 'listening' ? 'voice-panel__action-btn--active' : ''}`}
            onClick={() => {
              if (!isActive) void onStart()
              else if (state === 'listening' || state === 'speaking') onToggleRecording()
            }}
            disabled={!sttSupported || (isActive && state === 'transcribing')}
            title={!isActive ? '开始讨论' : state === 'listening' ? '结束说话并发送' : state === 'speaking' ? '打断AI，开始说话' : '请稍候...'}
          >
            <Mic size={22} />
          </button>

          {/* 结束按钮 */}
          <button
            className={`voice-panel__action-btn voice-panel__action-btn--stop ${isActive ? '' : 'voice-panel__action-btn--disabled'}`}
            onClick={() => isActive ? onStop() : undefined}
            disabled={!isActive}
            title="结束讨论"
          >
            <span>结束</span>
          </button>

          {/* 链接/分享按钮 */}
          <button
            className="voice-panel__action-btn"
            title="分享讨论记录"
          >
            <Link size={20} />
          </button>
        </div>
      </div>
    </>
  )
}
