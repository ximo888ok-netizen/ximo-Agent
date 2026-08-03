import { useMemo, useCallback, lazy, Suspense } from 'react'
import { FileCode2 } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { ToolPanel } from '@renderer/components/ToolPanel'
import { SessionBar } from '@renderer/components/coding/SessionBar'
import { Transcript } from '@renderer/components/transcript/Transcript'
import { adaptMessages, buildLiveStream } from '@renderer/lib/transcriptAdapter'
import type { ChatMessage } from '@shared/types'
import { extractChangeRows, type ChangeRow } from '@renderer/components/coding/change-rows'
import { SessionTimer, ErrorBanner, ChangeSummarySection, CodingActionBar } from '@renderer/components/coding/CodingParts'

// 懒加载检查点浏览器 — 仅在有文件变更时才显示
const CheckpointViewer = lazy(() => import('@renderer/components/coding/CheckpointViewer').then(m => ({ default: m.CheckpointViewer })))
// 懒加载空状态欢迎页
const CodingWelcome = lazy(() => import('@renderer/CodingWelcome').then(m => ({ default: m.CodingWelcome })))

export function CodingLayout(): React.ReactElement {
  // 精确选择当前会话 — 避免订阅整个 conversations 数组
  const conversation = useStore((s) => s.conversations.find((c) => c.id === s.currentConversationId) ?? null)
  const currentConversationId = useStore((s) => s.currentConversationId)
  const isStreaming = useStore((s) => s.isStreaming)
  const streamingContent = useStore((s) => s.streamingContent)
  const streamingReasoning = useStore((s) => s.streamingReasoning)
  const streamingConversationId = useStore((s) => s.streamingConversationId)
  const streamingTokens = useStore((s) => s.streamingTokens)
  const streamingToolCalls = useStore((s) => s.streamingToolCalls)
  const streamingAssistantId = useStore((s) => s.streamingAssistantId)
  const error = useStore((s) => s.error)
  const regenerate = useStore((s) => s.regenerate)
  const sendMessage = useStore((s) => s.sendMessage)
  const projectPath = useStore((s) => s.projectPath)
  const editMessage = useStore((s) => s.editMessage)

  const fontSize = useStore((s) => s.settings?.fontSize) ?? 'md'
  const modelLabel = useStore((s) => s.settings?.model?.includes('pro')) ? 'DeepSeek V4-Pro' : 'DeepSeek V4-Flash'

  const isEmpty = !conversation || conversation.messages.length === 0
  const isStreamingThis = isStreaming && streamingConversationId === conversation?.id

  const changeRows = useMemo(() => {
    if (!conversation?.messages) return []
    return extractChangeRows(conversation.messages)
  }, [conversation?.messages])

  const totalAdditions = changeRows.reduce((sum, r) => sum + r.additions, 0)
  const totalDeletions = changeRows.reduce((sum, r) => sum + r.deletions, 0)

  // ── 适配：把 ChatMessage[] 转成扁平 TranscriptItem[] ──────────────────
  const items = useMemo(() => {
    if (!conversation) return []
    return adaptMessages(
      conversation.messages,
      isStreamingThis ? streamingToolCalls : undefined,
      isStreamingThis ? streamingAssistantId : undefined,
    )
  }, [conversation, isStreamingThis, streamingToolCalls, streamingAssistantId])

  // ── 流式 LiveStream ──────────────────────────────────────────────────
  const live = useMemo(() => {
    if (!isStreamingThis || !conversation) return undefined
    const lastAssistantId = conversation.messages.length > 0
      ? conversation.messages[conversation.messages.length - 1]?.id
      : undefined
    if (!lastAssistantId) return undefined
    return buildLiveStream(lastAssistantId, streamingContent, streamingReasoning)
  }, [isStreamingThis, conversation, streamingContent, streamingReasoning])

  // ── 编辑消息回调 ──────────────────────────────────────────────────────
  const handleEditMessage = useCallback((_turn: number, text: string) => {
    // 找到对应的用户消息并调用 editMessage
    if (!conversation) return
    // turn 是从 0 开始的用户消息序号
    const userMessages = conversation.messages.filter((m: ChatMessage) => m.role === 'user')
    const target = userMessages[_turn]
    if (target) {
      // editMessage 同步更新 store，之后直接发送新文本即可
      // 保留原消息的 slashCommand 胶囊（如果存在）
      editMessage(target.id)
      void sendMessage(text, target.slashCommand ? { slashCommand: target.slashCommand } : undefined)
    }
  }, [conversation, editMessage, sendMessage])

  // 空状态 — 主入口，输入框由 GlobalChatInput 管理
  if (isEmpty) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <SessionBar
          projectPath={projectPath}
          model={modelLabel}
          tokenCount={streamingTokens}
          sessionStartTime={conversation?.createdAt ?? Date.now()}
          toolCalls={streamingToolCalls}
          onRunProject={() => sendMessage('请帮我运行当前项目。先检查 package.json 中的 scripts，然后执行启动命令。', { skipNetworkHint: true })}
        />
        <div className="flex min-h-0 flex-1">
          <div className="flex-1 overflow-hidden">
            <Suspense fallback={null}>
            <CodingWelcome />
          </Suspense>
          </div>
        </div>
      </div>
    )
  }

  // 任务执行状态
  return (
    <div className={`flex min-h-0 flex-1 flex-col chat-fs-${fontSize}`}>
      {/* 头部 — 任务执行详情 */}
      <div className="flex items-center justify-between border-b border-border-subtle glass px-4 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <FileCode2 size={14} className="text-accent" />
          <span className="text-sm font-medium text-text-primary">ximo-Agent Code</span>
          <span className="text-xs text-text-muted">· 任务耗时 <SessionTimer startTime={conversation?.createdAt ?? Date.now()} /></span>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip px-2 py-0.5 text-[11px] text-text-muted">{modelLabel}</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 中间主内容区 */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ToolPanel />

          {/* 变更摘要区域 — 默认收起，点击展开 */}
          {changeRows.length > 0 && (
            <ChangeSummarySection
              changeRows={changeRows}
              totalAdditions={totalAdditions}
              totalDeletions={totalDeletions}
              projectPath={projectPath}
              sendMessage={sendMessage}
            />
          )}

          {/* 检查点浏览器 */}
          {currentConversationId && changeRows.length > 0 && (
          <div className="px-4 py-1.5">
            <Suspense fallback={null}>
              <CheckpointViewer sessionId={currentConversationId} />
            </Suspense>
          </div>
          )}

          {/* ── 新 Transcript 会话区 ── */}
          <Transcript
            items={items}
            live={live}
            running={isStreamingThis}
            turnStartAt={isStreamingThis ? (conversation?.messages[conversation.messages.length - 1]?.timestamp ?? Date.now()) : undefined}
            onEditMessage={handleEditMessage}
            onRegenerate={regenerate}
            canRegenerate={!isStreamingThis}
          />

          {error && <ErrorBanner message={error} />}

          {/* 操作工具条 */}
          {changeRows.length > 0 && !isStreamingThis && (
            <CodingActionBar
              changeRows={changeRows}
              projectPath={projectPath}
              sendMessage={sendMessage}
            />
          )}
        </div>
      </div>
    </div>
  )
}
