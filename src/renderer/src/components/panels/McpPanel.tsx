import { X, Server } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { McpListPanel } from '@renderer/components/office/McpListPanel'

/**
 * McpPanel — MCP 服务器管理浮层
 *
 * 从右侧栏 tab 迁出为独立浮层，与 AI 专家库 / 记忆 / 知识库 保持一致的入口形态。
 */
export function McpPanel(): React.ReactElement | null {
  const showMcpPanel = useStore((s) => s.showMcpPanel)
  const setShowMcpPanel = useStore((s) => s.setShowMcpPanel)

  if (!showMcpPanel) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={() => setShowMcpPanel(false)}
    >
      <div
        className="glass-panel flex h-[76vh] w-[760px] max-w-[95vw] flex-col overflow-hidden animate-fade-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="accent-tile flex h-9 w-9 items-center justify-center rounded-panel shadow-lg shadow-accent/20">
              <Server size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">MCP 服务器</h2>
              <p className="text-xs text-text-muted">导入 mcpServers JSON · 兼容 Cursor / Claude Code / Cline</p>
            </div>
          </div>
          <button onClick={() => setShowMcpPanel(false)} className="icon-btn rounded-card p-1.5">
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <McpListPanel />
        </div>
      </div>
    </div>
  )
}
