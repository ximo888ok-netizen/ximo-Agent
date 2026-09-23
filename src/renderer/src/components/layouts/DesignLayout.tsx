import { useCallback, useMemo } from 'react'
import { useStore } from '@renderer/store/useStore'
import { MODE_CONFIGS } from '@renderer/modes'
import { Icon } from '@renderer/components/Icon'
import { ModeWelcome } from '@renderer/components/shared/ModeWelcome'
import { ErrorBanner } from '@renderer/components/shared/ErrorBanner'
import { Transcript } from '@renderer/components/transcript/Transcript'
import { adaptMessages, buildLiveStream } from '@renderer/lib/transcriptAdapter'
import { getModelShortLabel } from '@shared/models'
import type { Mode, ChatMessage } from '@shared/types'

/**
 * DesignLayout — 设计模式
 *
 * 会话区与 Office / Coding 共用 `Transcript`（同一套渲染）：
 * 思考与工具按真实发生顺序交错、扁平流出、折叠收起。
 * 设计模式特有的「预览 / 导出 HTML」保留在头部，不属于会话渲染。
 */
export function DesignLayout(): React.ReactElement {
  // 用 getCurrentConversation 选择器替代 conversations.find 全量扫描 —
  // 每次 conversations 数组变化（含流式每 chunk）都不再重建 find 结果
  const conversation = useStore((s) => s.getCurrentConversation())
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
  const projectPath = useStore((s) => s.projectPath)

  const fontSize = useStore((s) => s.settings?.fontSize) ?? 'md'

  const messages = conversation?.messages
  const latestHtml = useMemo(() => {
    if (!messages) return ''
    return extractLatestHtml(messages)
  }, [messages])

  const isStreamingThis = isStreaming && streamingConversationId === conversation?.id
  const isEmpty = !conversation || conversation.messages.length === 0

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

  const handleEditMessage = useCallback((turn: number, text: string) => {
    if (!conversation) return
    const target = conversation.messages.filter((m: ChatMessage) => m.role === 'user')[turn]
    if (target) {
      editMessage(target.id)
      clearDraft()
      void sendMessage(text, target.slashCommand ? { slashCommand: target.slashCommand } : undefined)
    }
  }, [conversation, editMessage, clearDraft, sendMessage])

  const handleOpenPreview = (): void => {
    if (latestHtml) {
      sendMessage(`请使用 design_preview 工具预览以下 HTML 组件：\n\n\`\`\`html\n${latestHtml.slice(0, 500)}\n\`\`\``, { skipNetworkHint: true })
    } else {
      sendMessage('请使用 design_preview 工具预览我们刚才生成的 UI 组件。', { skipNetworkHint: true })
    }
  }

  const handleExportHtml = (): void => {
    if (!latestHtml) return
    const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;}</style>
</head>
<body class="dark p-8 min-h-screen">
  ${latestHtml}
</body>
</html>`
    const blob = new Blob([fullHtml], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ximo-design-export.html'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* 二级头部只在会话态出现：空态的模式名已由 ModeWelcome 承担，
          再压一条全宽栏会随居中组一起飘到屏幕中间，且与窄内容宽度不匹配 */}
      {!isEmpty && (
        <ChatHeader mode={(conversation?.mode ?? currentMode) as Mode} title={conversation?.title} onPreview={handleOpenPreview} onExport={handleExportHtml} hasContent={!!latestHtml} />
      )}
      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
          <ModeWelcome
            icon={MODE_CONFIGS.design.icon}
            title={MODE_CONFIGS.design.name}
            description={MODE_CONFIGS.design.description}
            projectPath={projectPath}
          />
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  )
}

/** 从消息列表中提取最近一次 ui_generate 生成的 HTML 代码 */
function extractLatestHtml(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== 'assistant') continue
    const htmlMatch = msg.content.match(/```(?:html|tsx|jsx)\s*\n([\s\S]*?)```/g)
    if (htmlMatch) {
      const lastBlock = htmlMatch[htmlMatch.length - 1]
      return lastBlock.replace(/^```(?:html|tsx|jsx)\s*\n/, '').replace(/```$/, '')
    }
  }
  return ''
}

function ChatHeader({ mode, title, onPreview, onExport, hasContent }: { mode: Mode; title?: string; onPreview: () => void; onExport: () => void; hasContent: boolean }): React.ReactElement {
  const thinkingMode = useStore((s) => s.settings?.thinkingMode)
  const model = useStore((s) => s.settings?.model)
  const config = MODE_CONFIGS[mode]
  return (
    <div className="flex items-center justify-between border-b border-border-subtle glass px-5 py-2 shrink-0">
      <div className="flex items-center gap-2 no-drag">
        <Icon name={config.icon} size={16} className="text-accent" />
        <span className="text-sm font-medium text-text-secondary">{config.name}</span>
        {title && <><span className="text-text-muted">·</span><span className="text-sm text-text-primary">{title}</span></>}
      </div>
      <div className="flex items-center gap-2 no-drag">
        {hasContent && (
          <>
            <button
              onClick={onPreview}
              className="chip flex items-center gap-1 px-3 py-1 text-caption text-accent border-accent/25 bg-accent/10 hover:bg-accent/15 transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] duration-fast hover:scale-105 active:scale-95"
            >
              预览
            </button>
            <button
              onClick={onExport}
              className="btn-ghost rounded-card px-3 py-1 text-caption"
            >
              导出
            </button>
          </>
        )}
        {thinkingMode !== undefined && model && <span className="chip px-2 py-0.5 text-caption text-text-muted">{thinkingMode ? '思考' : '快速'} · {getModelShortLabel(model)}</span>}
      </div>
    </div>
  )
}
