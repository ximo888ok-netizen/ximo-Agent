import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { FileText, Server, Square } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'

// 懒加载内嵌浏览器面板
const EmbeddedBrowserPanel = lazy(() => import('./EmbeddedBrowserPanel').then(m => ({ default: m.EmbeddedBrowserPanel })))
// 懒加载 Skill 列表面板
const SkillListPanel = lazy(() => import('./SkillListPanel').then(m => ({ default: m.SkillListPanel })))
// 懒加载 MCP 列表面板
const McpListPanel = lazy(() => import('./McpListPanel').then(m => ({ default: m.McpListPanel })))

/** 上下文模式（办公）右侧面板 — Skill 列表 + MCP 列表 */
export function ContextRightPanel({ hasConversation: _hasConversation }: { hasConversation: boolean }): React.ReactElement {
  const sendMessage = useStore((s) => s.sendMessage)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingStepCount, setRecordingStepCount] = useState(0)
  const [activeTab, setActiveTab] = useState<'skill' | 'mcp'>('skill')
  const browserOpen = useStore((s) => s.browserOpen)

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const status = await window.api.skills.recordingStatus()
        setIsRecording(status.isRecording)
        if (status.session) setRecordingStepCount(status.session.steps.length)
      } catch { /* ignore */ }
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  if (browserOpen) return <BrowserPanelContainer />

  return (
    <aside className="flex h-full w-full flex-col border-l border-border-subtle glass">
      {isRecording && (
        <div className="mx-3 mt-3 mb-1 rounded-xl bg-red-500/10 border border-red-500/20 p-2.5 animate-pulse-subtle">
          <div className="flex items-center gap-2">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </div>
            <span className="text-xs font-medium text-red-400">正在录制</span>
            <span className="text-[10px] text-red-400/70 ml-auto">{recordingStepCount} 步操作</span>
          </div>
          <button
            onClick={() => sendMessage('请使用 skill_record(action="stop") 结束录制并生成技能。', { skipNetworkHint: true })}
            className="mt-1.5 w-full flex items-center justify-center gap-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 px-2.5 py-1.5 text-xs text-red-400 transition-all"
          >
            <Square size={11} />停止录制
          </button>
        </div>
      )}

      <div className="flex items-center gap-0.5 border-b border-border-subtle px-2 py-1.5 shrink-0">
        <button
          onClick={() => setActiveTab('skill')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ${activeTab === 'skill' ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated/50'}`}
        >
          <FileText size={13} />Skill
        </button>
        <button
          onClick={() => setActiveTab('mcp')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ${activeTab === 'mcp' ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated/50'}`}
        >
          <Server size={13} />MCP
        </button>
      </div>

      <div className="flex-1 min-h-0">
        {activeTab === 'skill' ? (
          <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-accent/20 border-t-accent" /></div>}><SkillListPanel /></Suspense>
        ) : (
          <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-accent/20 border-t-accent" /></div>}><McpListPanel /></Suspense>
        )}
      </div>
    </aside>
  )
}

/** 浏览器面板容器 — 支持拖拽调节宽度 */
export function BrowserPanelContainer(): React.ReactElement {
  const [width, setWidth] = useState(480)
  const [isDragging, setIsDragging] = useState(false)

  const handleMouseDown = useCallback((e: React.MouseEvent): void => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return
    const handleMouseMove = (e: MouseEvent): void => { setWidth(Math.max(320, Math.min(1200, window.innerWidth - e.clientX))) }
    const handleMouseUp = (): void => { setIsDragging(false) }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp) }
  }, [isDragging])

  return (
    <div className="absolute inset-y-0 right-0 z-30 flex h-full" style={{ userSelect: isDragging ? 'none' : undefined }}>
      <div
        onMouseDown={handleMouseDown}
        className="group relative flex h-full w-1 shrink-0 cursor-col-resize items-center justify-center bg-border-subtle hover:bg-accent/40 transition-colors"
      >
        <div className="absolute inset-y-0 -left-1 -right-1" />
      </div>
      <aside className="flex h-full min-h-0 flex-col border-l border-border-subtle bg-bg-base" style={{ width: `${width}px`, flexShrink: 0 }}>
        <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-accent/20 border-t-accent" /></div>}>
          <EmbeddedBrowserPanel />
        </Suspense>
      </aside>
      {isDragging && <div className="fixed inset-0 z-[9999] cursor-col-resize" style={{ userSelect: 'none' }} />}
    </div>
  )
}
