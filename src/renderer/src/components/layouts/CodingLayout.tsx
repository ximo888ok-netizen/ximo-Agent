import { useMemo, useCallback } from 'react'
import { useStore } from '@renderer/store/useStore'
import { MODE_CONFIGS } from '@renderer/modes'
import { SessionBar } from '@renderer/components/coding/SessionBar'
import { Transcript } from '@renderer/components/transcript/Transcript'
import { ModeWelcome } from '@renderer/components/shared/ModeWelcome'
import { adaptMessages, buildLiveStream } from '@renderer/lib/transcriptAdapter'
import { getModelLabel } from '@shared/models'
import type { ChatMessage } from '@shared/types'
import { ErrorBanner } from '@renderer/components/shared/ErrorBanner'

export function CodingLayout(): React.ReactElement {
  // 精确选择当前会话 — 避免订阅整个 conversations 数组
  const conversation = useStore((s) => s.conversations.find((c) => c.id === s.currentConversationId) ?? null)
  const isStreaming = useStore((s) => s.isStreaming)
  const streamingContent = useStore((s) => s.streamingContent)
  const streamingReasoning = useStore((s) => s.streamingReasoning)
  const streamingConversationId = useStore((s) => s.streamingConversationId)
  const streamingTokens = useStore((s) => s.streamingTokens)
  const streamingToolCalls = useStore((s) => s.streamingToolCalls)
  const streamingAssistantId = useStore((s) => s.streamingAssistantId)
  // 有序事件流 —— 推理与工具按真实发生顺序交错渲染的依据
  const streamingSegments = useStore((s) => s.streamingSegments)
  const error = useStore((s) => s.error)
  const regenerate = useStore((s) => s.regenerate)
  const sendMessage = useStore((s) => s.sendMessage)
  const projectPath = useStore((s) => s.projectPath)
  const editMessage = useStore((s) => s.editMessage)
  const clearDraft = useStore((s) => s.clearDraft)

  const fontSize = useStore((s) => s.settings?.fontSize) ?? 'md'
  const model = useStore((s) => s.settings?.model)
  const modelLabel = getModelLabel(model)

  const isEmpty = !conversation || conversation.messages.length === 0
  const isStreamingThis = isStreaming && streamingConversationId === conversation?.id

  // ── 适配：把 ChatMessage[] 转成扁平 TranscriptItem[] ──────────────────
  const items = useMemo(() => {
    if (!conversation) return []
    return adaptMessages(
      conversation.messages,
      isStreamingThis ? streamingToolCalls : undefined,
      isStreamingThis ? streamingAssistantId : undefined,
      isStreamingThis ? streamingSegments : undefined,
    )
  }, [conversation, isStreamingThis, streamingToolCalls, streamingAssistantId, streamingSegments])

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
      // editMessage 同步更新 store（截断消息 + 设置 pendingDraft），之后直接发送新文本即可
      // 保留原消息的 slashCommand 胶囊（如果存在）
      editMessage(target.id)
      // 立即清除 pendingDraft — editMessage 会设置 pendingDraft 为旧消息内容，
      // 但此处已通过 sendMessage 发送新文本，旧内容不应填入输入框
      clearDraft()
      void sendMessage(text, target.slashCommand ? { slashCommand: target.slashCommand } : undefined)
    }
  }, [conversation, editMessage, clearDraft, sendMessage])

  // 空状态 — 主入口，输入框由 GlobalChatInput 管理
  if (isEmpty) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
          <ModeWelcome
            icon={MODE_CONFIGS.coding.icon}
            title={MODE_CONFIGS.coding.name}
            description={MODE_CONFIGS.coding.description}
            projectPath={projectPath}
          />
        </div>
      </div>
    )
  }

  // 任务执行状态
  return (
    <div className={`flex min-h-0 flex-1 flex-col chat-fs-${fontSize}`}>
      {/* 顶部状态栏 — 项目 / 分支 / 一键运行 / 模型 / Token / 耗时（原空态专用，现改为会话态常驻，两条栏合一） */}
      <SessionBar
        projectPath={projectPath}
        model={modelLabel}
        tokenCount={streamingTokens}
        sessionStartTime={conversation?.createdAt ?? Date.now()}
        toolCalls={streamingToolCalls}
        onRunProject={() => sendMessage('请帮我运行当前项目。先检查 package.json 中的 scripts，然后执行启动命令。', { skipNetworkHint: true })}
      />

      <div className="flex min-h-0 flex-1">
        {/* 中间主内容区 —— 三个模式共用同一套 Transcript 渲染；
            这里包 chat-fs-* 把字号设置传下去，与 Office / Design 保持一致 */}
        <div className={`flex min-h-0 min-w-0 flex-1 flex-col chat-fs-${fontSize}`}>
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

        </div>
      </div>
    </div>
  )
}
