import { useCallback, useMemo } from 'react'
import { useStore } from '@renderer/store/useStore'
import { MODE_CONFIGS } from '@renderer/modes'
import { ModeWelcome } from '@renderer/components/shared/ModeWelcome'
import { ErrorBanner } from '@renderer/components/shared/ErrorBanner'
import { Transcript } from '@renderer/components/transcript/Transcript'
import { adaptMessages, buildLiveStream } from '@renderer/lib/transcriptAdapter'
import { getModelShortLabel } from '@shared/models'
import type { Mode, ChatMessage } from '@shared/types'

/**
 * OfficeLayout — 办公模式
 *
 * 会话区与 Coding / Design 共用 `Transcript`（同一套渲染）：
 * 思考与工具按真实发生顺序交错、扁平流出、折叠收起。
 * 之前这里走的是旧的 `MessageItem` 逐条渲染，三个模式各长一个样。
 * 空态仍保留模式专属的 ModeWelcome —— 那是有意的入口设计，不属于会话渲染。
 */
export function OfficeLayout(): React.ReactElement {
  // 精确选择当前会话 — 避免订阅整个 conversations 数组
  const conversation = useStore((s) => s.conversations.find((c) => c.id === s.currentConversationId) ?? null)
  const currentMode = useStore((s) => s.currentMode)
  const isStreaming = useStore((s) => s.isStreaming)
  const streamingContent = useStore((s) => s.streamingContent)
  const streamingReasoning = useStore((s) => s.streamingReasoning)
  const streamingConversationId = useStore((s) => s.streamingConversationId)
  const streamingToolCalls = useStore((s) => s.streamingToolCalls)
  const streamingAssistantId = useStore((s) => s.streamingAssistantId)
  const streamingSegments = useStore((s) => s.streamingSegments)
  const error = useStore((s) => s.error)
  const regenerate = useStore((s) => s.regenerate)
  const editMessage = useStore((s) => s.editMessage)
  const clearDraft = useStore((s) => s.clearDraft)
  const sendMessage = useStore((s) => s.sendMessage)
  const fontSize = useStore((s) => s.settings?.fontSize) ?? 'md'
  const projectPath = useStore((s) => s.projectPath)

  const handleExportDoc = (): void => {
    if (!conversation) return
    const lastAssistant = [...conversation.messages].reverse().find((m) => m.role === 'assistant' && m.content)
    if (!lastAssistant) return
    const blob = new Blob([lastAssistant.content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${conversation.title || 'ximo-doc'}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const isEmpty = !conversation || conversation.messages.length === 0
  const isStreamingThis = isStreaming && streamingConversationId === conversation?.id

  // ── 适配：ChatMessage[] → 扁平 TranscriptItem[] ──
  const items = useMemo(() => {
    if (!conversation) return []
    return adaptMessages(
      conversation.messages,
      isStreamingThis ? streamingToolCalls : undefined,
      isStreamingThis ? streamingAssistantId : undefined,
      isStreamingThis ? streamingSegments : undefined,
    )
  }, [conversation, isStreamingThis, streamingToolCalls, streamingAssistantId, streamingSegments])

  // ── 流式 LiveStream ──
  const live = useMemo(() => {
    if (!isStreamingThis || !conversation) return undefined
    const lastAssistantId = conversation.messages[conversation.messages.length - 1]?.id
    if (!lastAssistantId) return undefined
    return buildLiveStream(lastAssistantId, streamingContent, streamingReasoning)
  }, [isStreamingThis, conversation, streamingContent, streamingReasoning])

  // ── 编辑消息回调 ──
  const handleEditMessage = useCallback((turn: number, text: string) => {
    if (!conversation) return
    const target = conversation.messages.filter((m: ChatMessage) => m.role === 'user')[turn]
    if (target) {
      editMessage(target.id)
      clearDraft()
      void sendMessage(text, target.slashCommand ? { slashCommand: target.slashCommand } : undefined)
    }
  }, [conversation, editMessage, clearDraft, sendMessage])

  // 主入口状态 — 只展示内容，输入框由 GlobalChatInput 统一管理
  if (isEmpty) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
          <ModeWelcome
            icon={MODE_CONFIGS.office.icon}
            title={MODE_CONFIGS.office.name}
            description={MODE_CONFIGS.office.description}
            projectPath={projectPath}
          />
        </div>

        {error && <ErrorBanner message={error} />}
      </div>
    )
  }

  // 对话状态 — 只展示消息列表，输入框由 GlobalChatInput 管理
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ChatHeader mode={(conversation?.mode ?? currentMode) as Mode} title={conversation?.title} onExport={handleExportDoc} />
      {/* 包一层只为把字号设置（--chat-font-size）传下去，布局类与 CodingLayout 保持一致 */}
      <div className={`flex min-h-0 min-w-0 flex-1 flex-col chat-fs-${fontSize}`}>
        <Transcript
          items={items}
          live={live}
          running={isStreamingThis}
          turnStartAt={isStreamingThis ? (conversation?.messages[conversation.messages.length - 1]?.timestamp ?? Date.now()) : undefined}
          onEditMessage={handleEditMessage}
          onRegenerate={regenerate}
          canRegenerate={!isStreamingThis}
        />
      </div>
      {error && <ErrorBanner message={error} />}
    </div>
  )
}

function ChatHeader({ mode, title, onExport }: { mode: Mode; title?: string; onExport: () => void }): React.ReactElement {
  const thinkingMode = useStore((s) => s.settings?.thinkingMode)
  const model = useStore((s) => s.settings?.model)
  const config = MODE_CONFIGS[mode]
  return (
    <div className="flex items-center justify-between border-b border-border-subtle glass px-5 py-2 shrink-0">
      <div className="flex items-center gap-2 no-drag">
        <span className="text-sm font-medium text-text-secondary">{config.name}</span>
        {title && <><span className="text-text-muted">·</span><span className="text-sm text-text-primary">{title}</span></>}
      </div>
      <div className="flex items-center gap-2 no-drag">
        <button aria-label="导出最后一条回复为 Markdown" onClick={onExport} className="btn-ghost rounded-card px-3 py-1 text-caption" title="导出最后一条回复为 Markdown">
          导出
        </button>
        {thinkingMode !== undefined && model && <span className="chip px-2 py-0.5 text-caption text-text-muted">{thinkingMode ? '思考' : '快速'} · {getModelShortLabel(model)}</span>}
      </div>
    </div>
  )
}
