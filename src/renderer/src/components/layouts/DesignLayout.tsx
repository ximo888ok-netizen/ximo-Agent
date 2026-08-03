import { useEffect, useRef, useMemo, lazy, Suspense } from 'react'
import { useStore } from '@renderer/store/useStore'
import { MODE_CONFIGS } from '@renderer/modes'
import { MessageItem } from '@renderer/components/MessageItem'
import { Icon } from '@renderer/components/Icon'
import { ToolPanel } from '@renderer/components/ToolPanel'
import type { Mode, ChatMessage } from '@shared/types'

// 懒加载空状态欢迎页
const DesignWelcome = lazy(() => import('@renderer/DesignWelcome').then(m => ({ default: m.DesignWelcome })))

/** 稳定的流式占位消息对象 */
const STREAMING_MSG: ChatMessage = { id: 'streaming', role: 'assistant', content: '', timestamp: 0 }

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

export function DesignLayout(): React.ReactElement {
  const conversation = useStore((s) => s.conversations.find((c) => c.id === s.currentConversationId) ?? null)
  const currentMode = useStore((s) => s.currentMode)
  const isStreaming = useStore((s) => s.isStreaming)
  const streamingContent = useStore((s) => s.streamingContent)
  const streamingReasoning = useStore((s) => s.streamingReasoning)
  const streamingConversationId = useStore((s) => s.streamingConversationId)
  const streamingToolCalls = useStore((s) => s.streamingToolCalls)
  const streamingSegments = useStore((s) => s.streamingSegments)
  const error = useStore((s) => s.error)
  const regenerate = useStore((s) => s.regenerate)
  const editMessage = useStore((s) => s.editMessage)
  const sendMessage = useStore((s) => s.sendMessage)

  const fontSize = useStore((s) => s.settings?.fontSize) ?? 'md'
  const scrollRef = useRef<HTMLDivElement>(null)

  const messages = conversation?.messages
  const latestHtml = useMemo(() => {
    if (!messages) return ''
    return extractLatestHtml(messages)
  }, [messages])

  const isStreamingThis = isStreaming && streamingConversationId === conversation?.id

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight
    }
  }, [conversation?.messages.length, streamingContent, streamingReasoning, streamingSegments])

  const isEmpty = !conversation || conversation.messages.length === 0

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
      <ChatHeader mode={(conversation?.mode ?? currentMode) as Mode} title={conversation?.title} onPreview={handleOpenPreview} onExport={handleExportHtml} hasContent={!!latestHtml} />
      <ToolPanel />
      {isEmpty ? (
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={null}>
            <DesignWelcome />
          </Suspense>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
            <div className={`mx-auto max-w-3xl space-y-5 px-4 py-6 chat-fs-${fontSize}`}>
              {conversation!.messages.map((msg, idx) => (
                <MessageItem key={msg.id} message={msg} canRegenerate={!isStreaming && msg.role === 'assistant' && idx === conversation!.messages.length - 1} onRegenerate={regenerate} onEditMessage={editMessage} />
              ))}
              {isStreamingThis && (
                <MessageItem message={STREAMING_MSG} isStreaming streamingContent={streamingContent} streamingReasoning={streamingReasoning} streamingToolCalls={streamingToolCalls} streamingSegments={streamingSegments} />
              )}
            </div>
          </div>
          {error && <ErrorBanner message={error} />}
        </>
      )}
    </div>
  )
}

function ChatHeader({ mode, title, onPreview, onExport, hasContent }: { mode: Mode; title?: string; onPreview: () => void; onExport: () => void; hasContent: boolean }): React.ReactElement {
  const thinkingMode = useStore((s) => s.settings?.thinkingMode)
  const model = useStore((s) => s.settings?.model)
  const config = MODE_CONFIGS[mode]
  return (
    <div className="flex items-center justify-between border-b border-border-subtle glass px-5 py-2.5 shrink-0">
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
              className="chip flex items-center gap-1 px-2.5 py-1 text-[11px] text-accent border-accent/25 bg-accent/10 hover:bg-accent/15 transition-all duration-200 hover:scale-105 active:scale-95"
            >
              预览
            </button>
            <button
              onClick={onExport}
              className="btn-ghost rounded-lg px-2.5 py-1 text-[11px]"
            >
              导出
            </button>
          </>
        )}
        {thinkingMode !== undefined && model && <span className="chip px-2 py-0.5 text-[11px] text-text-muted">{thinkingMode ? '思考' : '快速'} · {model.includes('pro') ? 'V4-Pro' : 'V4-Flash'}</span>}
      </div>
    </div>
  )
}

function ErrorBanner({ message }: { message: string }): React.ReactElement {
  return <div className="mx-4 mb-1 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2 text-sm text-red-400 backdrop-blur-sm"><span className="text-xs">⚠</span><span className="flex-1">{message}</span></div>
}
