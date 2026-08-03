import { memo, useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react'
import { Check, ChevronDown, Copy, RotateCcw, Brain, Cpu, Pencil } from 'lucide-react'
import type { ChatMessage, StreamingSegment } from '@shared/types'
import { MarkdownRenderer } from './MarkdownRenderer'
import { TOOL_LABELS } from './message-constants'
import { ToolCallGroup, CollapsedToolResults, CollapsedToolErrors } from './ToolCallGroup'
import { SegmentBlock } from './SegmentBlock'

// 懒加载截图预览 — 仅在点击截图放大时才需要
const ScreenshotPreview = lazy(() => import('./ScreenshotPreview').then(m => ({ default: m.ScreenshotPreview })))

interface MessageItemProps {
  message: ChatMessage
  isStreaming?: boolean
  streamingContent?: string
  streamingReasoning?: string
  streamingToolCalls?: { name: string; status: 'thinking' | 'calling' | 'done'; args?: string; result?: string }[]
  /** 流式工作步骤（按时间顺序，每轮 Agent Loop 一个 segment） */
  streamingSegments?: StreamingSegment[]
  isLast?: boolean
  canRegenerate?: boolean
  onRegenerate?: () => void
  /** 编辑用户消息回调 */
  onEditMessage?: (messageId: string) => void
  /** 是否在消息内渲染工具结果卡片（ReasonixMessage 设为 false 以避免重复） */
  showToolResults?: boolean
}

export const MessageItem = memo(function MessageItem({
  message,
  isStreaming = false,
  streamingContent = '',
  streamingReasoning = '',
  streamingToolCalls = [],
  streamingSegments = [],
  canRegenerate = false,
  onRegenerate,
  onEditMessage,
  showToolResults = true,
}: MessageItemProps): React.ReactElement {
  const [copied, setCopied] = useState(false)
  const [showReasoning, setShowReasoning] = useState(false)
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current) }
  }, [])

  const handleCopy = (): void => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true)
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
    })
  }

  const screenshots = useMemo<string[]>(() => {
    if (!message.toolResults) return []
    const result: string[] = []
    for (const r of message.toolResults) { if (r.screenshot) result.push(r.screenshot) }
    return result
  }, [message.toolResults])

  // 用户消息
  if (message.role === 'user') {
    return (
      <div className="group/msg flex justify-end animate-fade-scale">
        <div className="max-w-[80%] rounded-[22px] rounded-br-md bg-gradient-to-br from-accent to-accent-hover px-4 py-3 text-white shadow-lg shadow-accent/20 edge-light">
          {message.slashCommand && (
            <span className="mb-1.5 inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm" title={message.slashCommand.systemHint}>
              {message.slashCommand.cmd.replace(/^\//, '')}
            </span>
          )}
          <p className="whitespace-pre-wrap break-words leading-relaxed" style={{ fontSize: 'var(--chat-font-size, 15px)' }}>
            {message.content}
          </p>
        </div>
        {onEditMessage && (
          <button
            onClick={() => onEditMessage(message.id)}
            className="ml-1 self-center opacity-0 group-hover/msg:opacity-100 icon-btn rounded-lg p-1 text-text-muted hover:text-accent transition-all"
            title="编辑消息"
          >
            <Pencil size={13} />
          </button>
        )}
      </div>
    )
  }

  // 助手消息
  const reasoning = isStreaming ? streamingReasoning : message.reasoningContent
  const content = isStreaming ? streamingContent : message.content

  const segmentsToRender: StreamingSegment[] | null = (() => {
    if (isStreaming && streamingSegments) {
      const nonEmpty = streamingSegments.filter(s => s.reasoning || s.content || s.toolCalls.length > 0)
      if (nonEmpty.length > 1) return nonEmpty
    }
    if (!isStreaming && message.segments && message.segments.length > 1) return message.segments
    return null
  })()

  return (
    <div className="flex gap-3 animate-fade-in">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-muted shadow-md shadow-accent/25 edge-light">
        <Cpu size={16} className="text-white" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-medium text-text-secondary">XimoAgent</span>
          {message.model && !isStreaming && (
            <span className="chip px-1.5 py-0.5 text-[10px] text-text-muted">{message.model}</span>
          )}
        </div>

        {segmentsToRender ? (
          <>{segmentsToRender.map((seg, idx) => (
            <SegmentBlock
              key={idx}
              segment={seg}
              isStreaming={isStreaming && idx === segmentsToRender.length - 1}
              showReasoning={showReasoning}
              onToggleReasoning={() => setShowReasoning(!showReasoning)}
            />
          ))}</>
        ) : (
          <>
            {reasoning && (
              <div className="mb-2 overflow-hidden rounded-xl border border-border-subtle bg-bg-surface/60 backdrop-blur-sm">
                <button
                  onClick={() => setShowReasoning(!showReasoning)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary transition-colors hover:text-text-primary"
                >
                  <Brain size={13} className="text-accent" />
                  <span>思考过程</span>
                  <ChevronDown size={13} className={`ml-auto transition-transform ${showReasoning ? 'rotate-180' : ''}`} />
                </button>
                {(showReasoning || isStreaming) && (
                  <div className="border-t border-border-subtle px-3 py-2 text-xs leading-relaxed text-text-muted">
                    <p className="whitespace-pre-wrap">{reasoning}</p>
                  </div>
                )}
              </div>
            )}

            {streamingToolCalls.length > 0 && (
              <div className="mb-2"><ToolCallGroup calls={streamingToolCalls} /></div>
            )}

            <div className="overflow-x-auto">
              {content ? (
                <MarkdownRenderer content={content} />
              ) : isStreaming && !reasoning ? (
                <div className="flex items-center gap-1 py-2">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-accent/60 [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-accent/60 [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-accent/60" />
                </div>
              ) : null}
            </div>

            {isStreaming && content && (
              <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-full bg-accent align-middle shadow-[0_0_8px_var(--glow-color)]" />
            )}
          </>
        )}

        {/* 截图预览缩略图 */}
        {screenshots.length > 0 && !isStreaming && (
          <div className="mt-2 flex flex-wrap gap-2">
            {screenshots.map((dataUrl, i) => (
              <button
                key={i}
                onClick={() => setScreenshotUrl(dataUrl)}
                className="overflow-hidden rounded-lg border border-border hover:border-accent/40 transition-colors"
              >
                <img src={dataUrl} alt={`截图 ${i + 1}`} className="h-24 w-auto object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* 工具结果中的错误 */}
        {message.toolResults && !isStreaming && (() => {
          const errorResults = message.toolResults.filter(r => !r.success && r.error && !r.screenshot)
          if (errorResults.length === 0) return null
          return <CollapsedToolErrors results={errorResults} />
        })()}

        {/* 内联工具结果卡片 */}
        {showToolResults && !segmentsToRender && message.toolResults && !isStreaming && (() => {
          const visibleResults = message.toolResults.filter(r => r.success && (r.content?.trim() || r.screenshot))
          if (visibleResults.length === 0) return null
          return <CollapsedToolResults results={visibleResults} />
        })()}

        {/* 操作栏 */}
        {!isStreaming && content && (
          <div className="mt-2 flex items-center gap-1">
            <button onClick={handleCopy} className="icon-btn flex items-center gap-1 rounded-lg px-2 py-1 text-xs">
              {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
              {copied ? '已复制' : '复制'}
            </button>
            {canRegenerate && onRegenerate && (
              <button onClick={onRegenerate} className="icon-btn flex items-center gap-1 rounded-lg px-2 py-1 text-xs">
                <RotateCcw size={13} />
                重新生成
              </button>
            )}
            {message.tokens && (
              <span className="chip ml-1 px-1.5 py-0.5 text-[10px] text-text-muted">{message.tokens} tokens</span>
            )}
          </div>
        )}
      </div>

      {screenshotUrl && (
        <Suspense fallback={null}>
          <ScreenshotPreview dataUrl={screenshotUrl} onClose={() => setScreenshotUrl(null)} />
        </Suspense>
      )}
    </div>
  )
})
