import { useEffect, useState } from 'react'
import { Minus, X, Briefcase, Code2, PenTool, PanelRightOpen, PanelRightClose } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import type { Mode } from '@shared/types'

// 自定义 Windows 窗口控制图标（还原按钮：两个重叠方框）
function RestoreIcon({ size = 16 }: { size?: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
      <rect x="3" y="5" width="8" height="8" rx="1" />
      <path d="M5.5 5V3.5a1 1 0 0 1 1-1H12a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1h-1.5" />
    </svg>
  )
}

// 最大化图标（实心方框）
function MaximizeIcon({ size = 16 }: { size?: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
      <rect x="3" y="3" width="10" height="10" rx="1.5" />
    </svg>
  )
}

const TAB_ITEMS: { id: Mode; label: string; icon: typeof Briefcase }[] = [
  { id: 'office', label: 'Work', icon: Briefcase },
  { id: 'coding', label: '+Code', icon: Code2 },
  { id: 'design', label: 'Design', icon: PenTool }
]

export function TitleBar(): React.ReactElement {
  const currentMode = useStore((s) => s.currentMode)
  const setMode = useStore((s) => s.setMode)
  const conversations = useStore((s) => s.conversations)
  const currentConversationId = useStore((s) => s.currentConversationId)
  const isStreaming = useStore((s) => s.isStreaming)
  const browserOpen = useStore((s) => s.browserOpen)
  const rightPanelCollapsed = useStore((s) => s.rightPanelCollapsed)
  const toggleRightPanel = useStore((s) => s.toggleRightPanel)
  const [isMaximized, setIsMaximized] = useState(false)

  // 浏览器开启期间右栏锁定为展开（webview + 录制现场不能卸载），此时开关不可用
  const rightPanelLocked = browserOpen

  useEffect(() => {
    void window.api.window.isMaximized().then(setIsMaximized)
    const unsubscribe = window.api.window.onMaximizeChange(setIsMaximized)
    return unsubscribe
  }, [])

  const currentConv = conversations.find((c) => c.id === currentConversationId)
  const statusText = currentConv ? currentConv.title : 'ximo-Agent 任务状态'

  return (
    <div className="drag-region relative z-20 flex h-[52px] flex-shrink-0 items-center justify-between border-b border-border-subtle glass pr-0">
      {/* 左侧：iOS 分段控件模式切换 */}
      <div className="no-drag flex items-center pl-3">
        <div className="flex items-center gap-0.5 rounded-full border border-border-subtle bg-bg-elevated-soft p-1 shadow-inner">
          {TAB_ITEMS.map((tab) => {
            const IconCmp = tab.icon
            const isActive = currentMode === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setMode(tab.id)}
                className={`relative flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] duration-base ease-out-quart ${
                  isActive
                    ? 'accent-fill shadow-glow'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                }`}
              >
                <IconCmp size={13} className={isActive ? 'drop-shadow' : ''} />
                <span className="mode-tab-label">{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 中间：当前任务状态（生成中显示脉冲微光） */}
      <div className="flex flex-1 items-center justify-center gap-2 overflow-hidden px-4">
        {isStreaming && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent animate-pulse-dot shadow-glow" />}
        <span
          className={`truncate text-xs transition-colors ${
            isStreaming ? 'text-shine font-medium' : 'text-text-muted'
          }`}
        >
          {statusText}
        </span>
      </div>

      {/* 右侧：右侧栏开关 + 窗口控制按钮 */}
      <div className="no-drag flex h-full">
        <button aria-label={rightPanelLocked
              ? '内嵌浏览器开启中，右侧栏保持展开'
              : rightPanelCollapsed ? '展开右侧栏 (Ctrl+B)' : '收起右侧栏 (Ctrl+B)'}
          onClick={toggleRightPanel}
          disabled={rightPanelLocked}
          className={`flex h-full w-11 items-center justify-center transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] duration-fast active:scale-90 disabled:cursor-not-allowed ${
            rightPanelLocked
              ? 'text-text-muted opacity-30'
              : rightPanelCollapsed
                ? 'text-text-muted hover:bg-bg-hover hover:text-accent'
                : 'text-accent hover:bg-bg-hover'
          }`}
          title={
            rightPanelLocked
              ? '内嵌浏览器开启中，右侧栏保持展开'
              : rightPanelCollapsed ? '展开右侧栏 (Ctrl+B)' : '收起右侧栏 (Ctrl+B)'
          }
        >
          {rightPanelCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
        </button>
        <button
          onClick={() => void window.api.window.minimize()}
          className="flex h-full w-11 items-center justify-center text-text-secondary transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] duration-fast hover:bg-bg-hover hover:text-text-primary active:scale-90"
          title="最小化"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={() => void window.api.window.maximize()}
          className="flex h-full w-11 items-center justify-center text-text-secondary transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] duration-fast hover:bg-bg-hover hover:text-text-primary active:scale-90"
          title={isMaximized ? '还原' : '最大化'}
        >
          {isMaximized ? <RestoreIcon size={13} /> : <MaximizeIcon size={13} />}
        </button>
        <button
          onClick={() => void window.api.window.close()}
          className="flex h-full w-11 items-center justify-center text-text-secondary transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] duration-fast hover:bg-gradient-to-br hover:from-red-500 hover:to-red-600 hover:text-white hover:shadow-[0_0_20px_rgba(239,68,68,0.35)] active:scale-90"
          title="关闭"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
