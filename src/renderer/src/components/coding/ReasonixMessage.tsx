import { memo, useState } from 'react'
import { ChevronDown, CheckCircle } from 'lucide-react'
import { MessageItem } from '@renderer/components/MessageItem'
import { InlineFileEdit } from './InlineFileEdit'
import { InlineTerminalOutput } from './InlineTerminalOutput'
import type { ChatMessage, ToolResult, StreamingSegment } from '@shared/types'

interface ReasonixMessageProps {
  message: ChatMessage
  isStreaming?: boolean
  streamingContent?: string
  streamingReasoning?: string
  streamingToolCalls?: { name: string; status: 'thinking' | 'calling' | 'done'; result?: string }[]
  streamingSegments?: StreamingSegment[]
  /** 流式子 Agent 工作过程事件（专家团编排时实时展示） */
  streamingExpertEvents?: NonNullable<import('@shared/types').StreamChunk['subAgentEvent']>[]
  canRegenerate?: boolean
  onRegenerate?: () => void
  onEditMessage?: (messageId: string) => void
}

function extractFileEditMeta(result: ToolResult): { fileName: string; additions: number; deletions: number; oldContent?: string; newContent?: string } | null {
  const content = result.content || ''
  const meta = result.metadata || {}

  const fileName =
    (meta.fileName as string) ||
    (meta.filePath as string)?.split(/[/\\]/).pop() ||
    (meta.destinationPath as string)?.split(/[/\\]/).pop() ||
    content.match(/^(?:编辑|修改|移动|创建|覆盖|edit|move|write)\s*(?:文件\s*)?[：:]\s*(.+)/im)?.[1]?.trim() ||
    ''
  if (!fileName) return null

  const additions = (meta.additions as number) ?? 0
  const deletions = (meta.deletions as number) ?? 0

  return {
    fileName,
    additions,
    deletions,
    oldContent: meta.oldContent as string | undefined,
    newContent: meta.newContent as string | undefined
  }
}

function extractTerminalMeta(result: ToolResult): { command: string; output: string } | null {
  const content = result.content || ''
  const meta = result.metadata || {}

  const command = (meta.command as string) || content.match(/^\$\s*(.+)/m)?.[1]?.trim() || ''
  const output = content.replace(/^\$\s*.+\n?/m, '').trim()

  return { command, output }
}

function renderToolResult(result: ToolResult): React.ReactElement | null {
  const toolName = result.toolName

  // 文件操作
  if (toolName === 'file_read' || toolName === 'file_write' || toolName === 'file_edit' || toolName === 'file_delete' || toolName === 'multi_edit' || toolName === 'move_file') {
    const meta = extractFileEditMeta(result)
    if (meta && meta.fileName) {
      return (
        <InlineFileEdit
          key={result.toolCallId}
          fileName={meta.fileName}
          additions={meta.additions}
          deletions={meta.deletions}
          status={result.success ? 'done' : 'pending'}
          oldContent={meta.oldContent}
          newContent={meta.newContent}
        />
      )
    }
  }

  // 终端执行
  if (toolName === 'terminal_exec') {
    const meta = extractTerminalMeta(result)
    const command = meta?.command || result.toolName
    const output = meta?.output || result.content
    return (
      <InlineTerminalOutput
        key={result.toolCallId}
        command={command}
        output={output}
        exitCode={result.success ? 0 : 1}
      />
    )
  }

  return null
}

/** 内联工具结果分组 — 收纳文件编辑/终端输出，默认收起 */
function CollapsedInlineResults({ results }: { results: ToolResult[] }): React.ReactElement {
  const [expanded, setExpanded] = useState(false)

  // 只渲染有内容的工具结果
  const rendered = results.map(r => renderToolResult(r)).filter(Boolean) as React.ReactElement[]
  if (rendered.length === 0) return <></>

  // 摘要：提取文件名或命令
  const summaries = results.map(r => {
    const meta = r.metadata || {}
    return (meta.fileName as string) ||
      (meta.filePath as string)?.split(/[/\\]/).pop() ||
      (meta.command as string) ||
      r.toolName
  }).filter(Boolean)
  const summaryText = summaries.slice(0, 2).join(', ') + (summaries.length > 2 ? ` 等${summaries.length}项` : '')

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-surface/40 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs transition-colors hover:bg-bg-hover/50"
      >
        <CheckCircle size={13} className="text-green-500/70 shrink-0" />
        <span className="text-text-secondary shrink-0">文件变更</span>
        <span className="text-text-muted">{rendered.length}</span>
        {summaryText && (
          <span className="text-text-muted/70 truncate">· {summaryText}</span>
        )}
        <span className="ml-auto flex items-center gap-1 text-text-muted shrink-0">
          <ChevronDown size={11} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border-subtle/50 px-2 py-1.5 space-y-1">
          {rendered}
        </div>
      )}
    </div>
  )
}

export const ReasonixMessage = memo(function ReasonixMessage({
  message,
  isStreaming,
  streamingContent,
  streamingReasoning,
  streamingToolCalls,
  streamingSegments,
  streamingExpertEvents,
  canRegenerate,
  onRegenerate,
  onEditMessage
}: ReasonixMessageProps): React.ReactElement {
  const hasToolResults = message.toolResults && message.toolResults.length > 0

  return (
    <div>
      {/* 正常消息渲染 */}
      <MessageItem
        message={message}
        isStreaming={isStreaming}
        streamingContent={streamingContent}
        streamingReasoning={streamingReasoning}
        streamingToolCalls={streamingToolCalls}
        streamingSegments={streamingSegments}
        streamingExpertEvents={streamingExpertEvents}
        canRegenerate={canRegenerate}
        onRegenerate={onRegenerate}
        onEditMessage={onEditMessage}
        showToolResults={false}
      />

      {/* 内联工具结果卡片 — 收纳为可折叠分组 */}
      {hasToolResults && !isStreaming && (
        <div className="ml-11 mt-1">
          <CollapsedInlineResults results={message.toolResults!} />
        </div>
      )}
    </div>
  )
})
