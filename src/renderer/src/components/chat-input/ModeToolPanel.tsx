import { useState, useEffect, useRef } from 'react'
import { Wrench, Globe, CircleDot, Cpu } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'

/** 开关视觉 — 与既有 chip 内的小开关保持一致 */
function Switch({ on, tone }: { on: boolean; tone: 'accent' | 'red' | 'green' }): React.ReactElement {
  const toneClass = tone === 'red' ? 'bg-red-500/40' : tone === 'green' ? 'bg-green-500/40' : 'bg-accent/40'
  return (
    <span className={`relative inline-flex h-3 w-5 shrink-0 items-center rounded-full transition-colors duration-fast ${on ? toneClass : 'bg-border'}`}>
      <span className={`inline-block h-2.5 w-2.5 rounded-full bg-white transition-transform duration-fast ${on ? 'translate-x-2' : 'translate-x-0.5'}`} />
    </span>
  )
}

/**
 * ModeToolPanel — 办公模式后台工具面板
 *
 * 把原先平铺在工具栏与空态区的 4 处后台工具入口收敛为单一入口：
 * 常驻 1 个「工具」按钮，点开后面板内呈 3 个开关 + 技能选择器。
 * 激活态走按钮上的圆点徽标，不再靠常驻 chip 表达状态。
 */
export function ModeToolPanel(): React.ReactElement {
  const browserOpen = useStore((s) => s.browserOpen)
  const isBrowserRecording = useStore((s) => s.isBrowserRecording)
  const computerUseRunning = useStore((s) => s.computerUseRunning)
  const toggleBrowser = useStore((s) => s.toggleBrowser)
  const toggleBrowserRecording = useStore((s) => s.toggleBrowserRecording)
  const toggleComputerUse = useStore((s) => s.toggleComputerUse)

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const activeCount = [browserOpen, isBrowserRecording, computerUseRunning].filter(Boolean).length

  /**
   * 录制开关 — 停止录制不能直接改 store：
   * EmbeddedBrowserPanel 需要先汇总手动操作 + Agent 步骤、抓取 API 端点，再弹出保存对话框。
   * 因此停止走事件通知由面板收尾（与既有实现一致），仅开始录制直接调 store。
   */
  const handleToggleRecording = (): void => {
    if (isBrowserRecording) {
      window.dispatchEvent(new CustomEvent('ximo:stop-recording'))
    } else {
      toggleBrowserRecording()
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`chip flex items-center gap-1 px-2 py-1 text-caption transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] duration-fast active:scale-95 ${
          open || activeCount > 0
            ? 'border-accent/30 text-accent bg-accent/10'
            : 'text-text-secondary hover:text-text-primary'
        }`}
        title="后台工具 — 浏览器 / 录制 / 操控电脑"
      >
        <Wrench size={11} />
        工具
        {activeCount > 0 && (
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
        )}
      </button>

      {/* 工具面板 — 向上展开 */}
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-[264px] rounded-panel border border-border-subtle bg-bg-elevated shadow-glass animate-fade-scale flex flex-col overflow-hidden">
          <div className="border-b border-border-subtle px-3 py-1.5 text-caption text-text-muted">
            后台工具 — Agent 可随时调用
          </div>

          <div className="p-1.5">
            {/* 内嵌浏览器 */}
            <button
              onClick={toggleBrowser}
              className="flex w-full items-center gap-2 rounded-card px-3 py-2 text-left transition-colors hover:bg-bg-hover active:scale-[0.97]"
            >
              <Globe size={13} className={browserOpen ? 'text-accent' : 'text-text-muted'} />
              <span className="flex-1 text-xs text-text-secondary">内嵌浏览器</span>
              <Switch on={browserOpen} tone="accent" />
            </button>

            {/* 录制技能 — 依赖浏览器 */}
            <button aria-label={browserOpen ? undefined : '需先开启内嵌浏览器'}
              onClick={handleToggleRecording}
              disabled={!browserOpen}
              className="flex w-full items-center gap-2 rounded-card px-3 py-2 text-left transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              title={browserOpen ? undefined : '需先开启内嵌浏览器'}
            >
              <CircleDot size={13} className={isBrowserRecording ? 'text-red-400' : 'text-text-muted'} />
              <span className="flex-1 text-xs text-text-secondary">
                {isBrowserRecording ? '录制中 — 点击停止' : '录制技能'}
              </span>
              <Switch on={isBrowserRecording} tone="red" />
            </button>

            {/* 操控电脑 */}
            <button
              onClick={() => void toggleComputerUse()}
              className="flex w-full items-center gap-2 rounded-card px-3 py-2 text-left transition-colors hover:bg-bg-hover active:scale-[0.97]"
            >
              <Cpu size={13} className={computerUseRunning ? 'text-green-400' : 'text-text-muted'} />
              <span className="flex-1 text-xs text-text-secondary">操控电脑</span>
              <Switch on={computerUseRunning} tone="green" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
