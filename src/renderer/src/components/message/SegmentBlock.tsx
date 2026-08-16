import { useState } from 'react'
import { Brain, ChevronDown, ChevronUp } from 'lucide-react'
import type { StreamingSegment, SegmentEvent } from '@shared/types'
import { MarkdownRenderer } from '@renderer/components/markdown/MarkdownRenderer'
import { ToolCallGroup } from './ToolCallGroup'

/** 思考链截断阈值 — 超过此长度的 reasoning 默认只显示最后 N 字（最近思考） */
const REASONING_MAX_CHARS = 500

/** 思考链区块 — 可截断 + 展开 */
function ReasoningBlock({ text, isStreaming, showReasoning, onToggle }: {
  text: string
  isStreaming: boolean
  showReasoning: boolean
  onToggle: () => void
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const shouldTruncate = text.length > REASONING_MAX_CHARS
  const displayText = shouldTruncate && !expanded
    ? text.slice(-REASONING_MAX_CHARS)
    : text

  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-border-subtle bg-bg-surface/60 backdrop-blur-sm">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary transition-colors hover:text-text-primary"
      >
        <Brain size={13} className="text-accent" />
        <span>思考过程</span>
        {shouldTruncate && !expanded && (
          <span className="text-text-muted/50 text-[10px]">{text.length} 字</span>
        )}
        <ChevronDown size={13} className={`ml-auto transition-transform ${showReasoning ? 'rotate-180' : ''}`} />
      </button>
      {(showReasoning || isStreaming) && (
        <div className="border-t border-border-subtle px-3 py-2 text-xs leading-relaxed text-text-muted">
          {shouldTruncate && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="mb-1.5 flex items-center gap-1 text-[10px] text-accent/70 transition-colors hover:text-accent"
            >
              <ChevronUp size={11} />
              <span>展开全部 {text.length} 字</span>
            </button>
          )}
          {shouldTruncate && expanded && (
            <button
              onClick={() => setExpanded(false)}
              className="mb-1.5 flex items-center gap-1 text-[10px] text-accent/70 transition-colors hover:text-accent"
            >
              <ChevronDown size={11} />
              <span>收起（只显示最近 {REASONING_MAX_CHARS} 字）</span>
            </button>
          )}
          <p className="whitespace-pre-wrap">{displayText}</p>
        </div>
      )}
    </div>
  )
}

/** 流式加载指示器 */
function LoadingDots(): React.ReactElement {
  return (
    <div className="flex items-center gap-1 py-2">
      <span className="h-2 w-2 animate-bounce rounded-full bg-accent/60 [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-accent/60 [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-accent/60" />
    </div>
  )
}

/** 将连续的 tool 事件打包为 ToolCallGroup */
function flushToolBatch(batch: SegmentEvent[], key: string): React.ReactElement | null {
  if (batch.length === 0) return null
  return (
    <div key={key} className="mb-2">
      <ToolCallGroup calls={batch.map(t => ({
        name: t.toolName || '',
        status: (t.status || 'done') as 'calling' | 'done',
        args: t.args,
        result: t.result,
      }))} />
    </div>
  )
}

/**
 * 有序事件流渲染 — 按实际发生顺序输出，避免同类型堆叠
 *
 * 事件顺序示例：reasoning → tool → tool → content
 * 渲染时严格按此顺序，不把所有 reasoning 堆在一起再堆所有 tool
 */
function EventStream({ segment, isStreaming, showReasoning, onToggleReasoning }: {
  segment: StreamingSegment
  isStreaming: boolean
  showReasoning: boolean
  onToggleReasoning: () => void
}): React.ReactElement {
  const events = segment.events || []
  const elements: React.ReactElement[] = []
  let toolBatch: SegmentEvent[] = []
  let toolBatchIdx = 0

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]

    if (ev.type === 'tool') {
      toolBatch.push(ev)
      continue
    }

    // 非 tool 事件前先 flush tool 批次
    if (toolBatch.length > 0) {
      const flushed = flushToolBatch(toolBatch, `tool-${toolBatchIdx++}`)
      if (flushed) elements.push(flushed)
      toolBatch = []
    }

    if (ev.type === 'reasoning' && ev.text) {
      elements.push(
        <ReasoningBlock
          key={`reasoning-${i}`}
          text={ev.text}
          isStreaming={isStreaming}
          showReasoning={showReasoning}
          onToggle={onToggleReasoning}
        />
      )
    } else if (ev.type === 'content' && ev.text) {
      elements.push(
        <div key={`content-${i}`} className="overflow-x-auto">
          <MarkdownRenderer content={ev.text} />
        </div>
      )
    }
  }

  // flush 剩余 tool 批次
  if (toolBatch.length > 0) {
    const flushed = flushToolBatch(toolBatch, `tool-${toolBatchIdx++}`)
    if (flushed) elements.push(flushed)
  }

  // 空事件 + 流式中 → 显示加载指示器
  if (elements.length === 0 && isStreaming) {
    elements.push(<LoadingDots key="loading" />)
  }

  // 流式光标
  if (isStreaming && segment.content) {
    elements.push(
      <span key="cursor" className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-full bg-accent align-middle shadow-[0_0_8px_var(--glow-color)]" />
    )
  }

  return <>{elements}</>
}

/** 单个工作步骤区块 — 渲染一轮的思考链、工具调用和正文 */
export function SegmentBlock({
  segment,
  isStreaming,
  showReasoning,
  onToggleReasoning,
}: {
  segment: StreamingSegment
  isStreaming: boolean
  showReasoning: boolean
  onToggleReasoning: () => void
}): React.ReactElement {
  // 有序事件模式 — 按实际发生顺序渲染
  if (segment.events && segment.events.length > 0) {
    return (
      <EventStream
        segment={segment}
        isStreaming={isStreaming}
        showReasoning={showReasoning}
        onToggleReasoning={onToggleReasoning}
      />
    )
  }

  // 降级：无 events 时用原有布局（reasoning → tools → content）
  return (
    <>
      {segment.reasoning && (
        <ReasoningBlock
          text={segment.reasoning}
          isStreaming={isStreaming}
          showReasoning={showReasoning}
          onToggle={onToggleReasoning}
        />
      )}

      {segment.toolCalls.length > 0 && (
        <div className="mb-2">
          <ToolCallGroup calls={segment.toolCalls} />
        </div>
      )}

      <div className="overflow-x-auto">
        {segment.content ? (
          <MarkdownRenderer content={segment.content} />
        ) : isStreaming && !segment.reasoning ? (
          <LoadingDots />
        ) : null}
      </div>

      {isStreaming && segment.content && (
        <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-full bg-accent align-middle shadow-[0_0_8px_var(--glow-color)]" />
      )}
    </>
  )
}
