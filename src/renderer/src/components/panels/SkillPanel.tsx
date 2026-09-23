import { X, Puzzle } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { SkillListPanel } from '@renderer/components/office/SkillListPanel'

/**
 * SkillPanel — 已录制技能管理浮层
 *
 * 从右侧栏迁出为独立浮层，与 AI 专家库 / MCP / 记忆 / 知识库 保持一致的入口形态，
 * 使左侧栏成为全局面板入口的唯一去处，右侧栏只保留需要边看边用的工作区（内嵌浏览器 / 自由画布）。
 */
export function SkillPanel(): React.ReactElement | null {
  const showSkillPanel = useStore((s) => s.showSkillPanel)
  const setShowSkillPanel = useStore((s) => s.setShowSkillPanel)

  if (!showSkillPanel) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={() => setShowSkillPanel(false)}
    >
      <div
        className="glass-panel flex h-[76vh] w-[760px] max-w-[95vw] flex-col overflow-hidden animate-fade-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="accent-tile flex h-9 w-9 items-center justify-center rounded-panel shadow-lg shadow-accent/20">
              <Puzzle size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">技能</h2>
              <p className="text-xs text-text-muted">导入 SKILL.md · 兼容 Claude / Cursor 等格式</p>
            </div>
          </div>
          <button onClick={() => setShowSkillPanel(false)} className="icon-btn rounded-card p-1.5">
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <SkillListPanel />
        </div>
      </div>
    </div>
  )
}
