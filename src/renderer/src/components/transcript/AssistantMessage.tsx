// ── AssistantMessage — 助手消息（推理面板 + Markdown 正文） ────────────
// 参考 DeepSeek-Reasonix 的 AssistantMessage + ReasoningPanel

import { memo, useState, useRef, useEffect, useCallback, createContext, useContext } from 'react'
import { ChevronRight, Brain } from 'lucide-react'
import type { AssistantItem, LiveStream } from '@renderer/lib/transcriptTypes'
import { MarkdownRenderer } from '@renderer/components/MarkdownRenderer'

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
  const shown = live && live.id === item.id
    ? { ...item, text: live.text, reasoning: live.reasoning, streaming: true, reasoningComplete: live.reasoningComplete }
    : item

  const hasText = shown.text.trim() !== ''
  const hasReasoning = Boolean(shown.reasoning?.trim())

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
      {shown.streaming && !hasText && !hasReasoning && (
        <div className="msg__body">
          <div className="flex items-center gap-1 py-2">
            <span className="h-2 w-2 animate-bounce rounded-full bg-accent/60 [animation-delay:-0.3s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-accent/60 [animation-delay:-0.15s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-accent/60" />
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
  const bodyRef = useRef<HTMLDivElement>(null)
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
        <Brain size={12} className="text-accent" />
        <span>{label}</span>
        {meta && <span className="reasoning__meta">{meta}</span>}
        <ChevronRight size={12} className={`reasoning__chevron${open ? ' reasoning__chevron--open' : ''}`} />
      </button>
      {open && visibleReasoning && (
        <div ref={bodyRef} className="reasoning__body">{visibleReasoning}</div>
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
