import { Brain, ChevronDown } from 'lucide-react'
import type { StreamingSegment } from '@shared/types'
import { MarkdownRenderer } from '../MarkdownRenderer'
import { ToolCallGroup } from './ToolCallGroup'

/** 单个工作步骤区块 — 渲染一轮的思考链、工具调用和正文 */
export function SegmentBlock({
  segment,
  isStreaming,
  showReasoning,
  onToggleReasoning
}: {
  segment: StreamingSegment
  isStreaming: boolean
  showReasoning: boolean
  onToggleReasoning: () => void
}): React.ReactElement {
  return (
    <>
      {/* 思考过程（可折叠） */}
      {segment.reasoning && (
        <div className="mb-2 overflow-hidden rounded-xl border border-border-subtle bg-bg-surface/60 backdrop-blur-sm">
          <button
            onClick={onToggleReasoning}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary transition-colors hover:text-text-primary"
          >
            <Brain size={13} className="text-accent" />
            <span>思考过程</span>
            <ChevronDown
              size={13}
              className={`ml-auto transition-transform ${showReasoning ? 'rotate-180' : ''}`}
            />
          </button>
          {(showReasoning || isStreaming) && (
            <div className="border-t border-border-subtle px-3 py-2 text-xs leading-relaxed text-text-muted">
              <p className="whitespace-pre-wrap">{segment.reasoning}</p>
            </div>
          )}
        </div>
      )}

      {/* 工具调用指示器 */}
      {segment.toolCalls.length > 0 && (
        <div className="mb-2">
          <ToolCallGroup calls={segment.toolCalls} />
        </div>
      )}

      {/* 内容 */}
      <div className="overflow-x-auto">
        {segment.content ? (
          <MarkdownRenderer content={segment.content} />
        ) : isStreaming && !segment.reasoning ? (
          <div className="flex items-center gap-1 py-2">
            <span className="h-2 w-2 animate-bounce rounded-full bg-accent/60 [animation-delay:-0.3s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-accent/60 [animation-delay:-0.15s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-accent/60" />
          </div>
        ) : null}
      </div>

      {/* 流式光标 */}
      {isStreaming && segment.content && (
        <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-full bg-accent align-middle shadow-[0_0_8px_var(--glow-color)]" />
      )}
    </>
  )
}
