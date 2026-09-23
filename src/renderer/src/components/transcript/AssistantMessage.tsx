// ── AssistantMessage — 助手消息（推理面板 + Markdown 正文） ────────────
// 参考 DeepSeek-Reasonix 的 AssistantMessage + ReasoningPanel

import { memo, useState, useRef, useEffect, useCallback, createContext, useContext } from 'react'
import { ChevronRight, Brain } from 'lucide-react'
import type { AssistantItem, LiveStream } from '@renderer/lib/transcriptTypes'
import { MarkdownRenderer } from '@renderer/components/markdown/MarkdownRenderer'
import { ReasoningBody } from './ReasoningText'

interface AssistantMessageProps {
  item: AssistantItem
  defaultExpanded?: boolean
  expandWhileStreaming?: boolean
  truncateStreamingReasoning?: boolean
  live?: LiveStream
}

function displayReasoningText(reasoning: string, opts: { streaming?: boolean; truncate?: boolean }): string {
  if (!reasoning) return ''
  if (opts.streaming && opts.truncate) {
    const lines = reasoning.split('\n')
    if (lines.length > 50) return lines.slice(-50).join('\n')
  }
  return reasoning
}

function reasoningDurationLabel(durationMs: number | undefined): string {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) return '思考完成'
  const seconds = Math.max(1, Math.round(durationMs / 1000))
  return `思考 ${seconds}s`
}

export const AssistantMessage = memo(function AssistantMessage({
  item,
  defaultExpanded = false,
  expandWhileStreaming = true,
  truncateStreamingReasoning = false,
  live,
}: AssistantMessageProps): React.ReactElement {
  // 合并 live 流式数据
  // liveTextOnly 项只承接正文 —— 它的推理已在有序事件流里输出过，
  // 再注入 live.reasoning 会把整段推理重复渲染一遍
  const shown = live && live.id === item.id
    ? {
        ...item,
        text: live.text,
        reasoning: item.liveTextOnly ? item.reasoning : live.reasoning,
        streaming: true,
        reasoningComplete: item.liveTextOnly ? true : live.reasoningComplete,
      }
    : item

  const hasText = shown.text.trim() !== ''
  const hasReasoning = Boolean(shown.reasoning?.trim())

  /*
   * 「等待首字」指示器只在**真正的当前流**上出现。
   *
   * 原来判定用的是 item.streaming —— 那是持久化在历史条目上的标志位，
   * 旧条目可能一直留着 streaming: true，于是每一条空消息都渲染一份三点指示器，
   * 几条并发就在会话里散出一排无意义的弹跳点（看起来像渲染坏了）。
   * 改成只看 live（当前唯一活跃的那条流），结构上最多只会有一个。
   */
  const isWaitingFirstToken = Boolean(
    live && live.id === item.id && !live.reasoning?.trim() && !live.text.trim(),
  )

  return (
    <div className={`msg msg--assistant${hasReasoning && !hasText ? ' msg--process-only' : ''}${hasReasoning && hasText ? ' msg--process-with-text' : ''}`}>
      {hasReasoning && (
        <ReasoningPanel
          reasoning={shown.reasoning}
          streaming={shown.streaming}
          reasoningComplete={shown.reasoningComplete}
          reasoningDurationMs={shown.reasoningDurationMs}
          defaultExpanded={defaultExpanded}
          expandWhileStreaming={expandWhileStreaming}
          truncateStreamingReasoning={truncateStreamingReasoning}
        />
      )}
      {hasText && (
        <div className="msg__body">
          <MarkdownRenderer content={shown.text} />
        </div>
      )}
      {isWaitingFirstToken && (
        <div className="msg__body">
          <div className="msg-waiting" role="status" aria-label="正在思考">
            <span className="msg-waiting__pulse" aria-hidden />
            <span className="msg-waiting__text">正在思考</span>
          </div>
        </div>
      )}
    </div>
  )
})

// ── ReasoningPanel — 推理过程面板 ──────────────────────────────────────

interface ReasoningPanelProps {
  reasoning: string
  streaming: boolean
  reasoningComplete?: boolean
  reasoningDurationMs?: number
  defaultExpanded: boolean
  expandWhileStreaming: boolean
  truncateStreamingReasoning: boolean
}

function ReasoningPanel({
  reasoning,
  streaming,
  reasoningComplete,
  reasoningDurationMs,
  defaultExpanded,
  expandWhileStreaming,
  truncateStreamingReasoning,
}: ReasoningPanelProps): React.ReactElement {
  const [open, setOpen] = useState((expandWhileStreaming && streaming) || defaultExpanded)
  const userOverridden = useRef(false)
  const prevStreaming = useRef(streaming)
  const prevComplete = useRef(reasoningComplete ?? false)

  useEffect(() => {
    const wasStreaming = prevStreaming.current
    const nowStreaming = streaming
    prevStreaming.current = nowStreaming

    const wasComplete = prevComplete.current
    const nowComplete = reasoningComplete ?? false
    prevComplete.current = nowComplete

    if (nowStreaming) {
      if (!wasStreaming) userOverridden.current = false
      if (defaultExpanded) {
        setOpen(true)
      } else if (!userOverridden.current) {
        setOpen(expandWhileStreaming && !nowComplete)
      }
    } else if (nowComplete && !wasComplete) {
      if (!defaultExpanded && !userOverridden.current) setOpen(false)
    } else if (wasStreaming) {
      if (!defaultExpanded && !userOverridden.current) setOpen(false)
    }
  }, [streaming, reasoningComplete, defaultExpanded, expandWhileStreaming])

  const toggle = useCallback(() => {
    userOverridden.current = true
    setOpen((v) => !v)
  }, [])

  const isRunning = streaming && !reasoningComplete
  const visibleReasoning = open
    ? displayReasoningText(reasoning, { streaming, truncate: truncateStreamingReasoning })
    : ''
  const label = isRunning ? '思考中' : '思考过程'
  const meta = isRunning ? '' : reasoningDurationLabel(reasoningDurationMs)

  return (
    <div className="reasoning">
      <button
        type="button"
        className="reasoning__head"
        data-running={isRunning ? '' : undefined}
        onClick={toggle}
        aria-expanded={open}
      >
        <Brain size={13} className="text-accent" />
        <span>{label}</span>
        {meta && <span className="reasoning__meta">{meta}</span>}
        <ChevronRight size={13} className={`reasoning__chevron${open ? ' reasoning__chevron--open' : ''}`} />
      </button>
      {open && visibleReasoning && (
        <ReasoningBody text={visibleReasoning} running={isRunning} />
      )}
    </div>
  )
}

// ── LiveAssistantMessage — 流式包装器 ──────────────────────────────────

export const LiveStreamContext = createContext<LiveStream | undefined>(undefined)

export const LiveAssistantMessage = memo(function LiveAssistantMessage({
  item,
  defaultExpanded = false,
  expandWhileStreaming = true,
  truncateStreamingReasoning = false,
}: {
  item: AssistantItem
  defaultExpanded?: boolean
  expandWhileStreaming?: boolean
  truncateStreamingReasoning?: boolean
}) {
  const live = useContext(LiveStreamContext)
  return (
    <AssistantMessage
      item={item}
      defaultExpanded={defaultExpanded}
      expandWhileStreaming={expandWhileStreaming}
      truncateStreamingReasoning={truncateStreamingReasoning}
      live={live}
    />
  )
})
