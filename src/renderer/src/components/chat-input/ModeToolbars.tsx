import type React from 'react'
import { FolderOpen, X } from 'lucide-react'
import { OfficeToolbar } from './OfficeToolbar'
import { getSlashCommands } from './constants'

interface ModeToolbarsProps {
  currentMode: string
  projectPath: string
  onOpenProject: () => void
  onClearProject: () => void
  browserOpen: boolean
  onToggleBrowser: () => void
  isBrowserRecording: boolean
  onToggleRecording: () => void
  computerUseRunning: boolean
  onToggleComputerUse: () => void
  onSlashCommand: (cmd: string, systemHint?: string) => void
}

/** 模式专属工具栏 — office/coding/design 各自的快捷操作栏 */
export function ModeToolbars({
  currentMode, projectPath, onOpenProject, onClearProject,
  browserOpen, onToggleBrowser, isBrowserRecording, onToggleRecording,
  computerUseRunning, onToggleComputerUse, onSlashCommand,
}: ModeToolbarsProps): React.ReactElement | null {
  if (currentMode === 'office') {
    return (
      <OfficeToolbar
        projectPath={projectPath}
        onOpenProject={onOpenProject}
        onClearProject={onClearProject}
        browserOpen={browserOpen}
        onToggleBrowser={onToggleBrowser}
        isBrowserRecording={isBrowserRecording}
        onToggleRecording={onToggleRecording}
        computerUseRunning={computerUseRunning}
        onToggleComputerUse={onToggleComputerUse}
      />
    )
  }

  if (currentMode === 'coding') {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        <button
          onClick={onOpenProject}
          className="chip flex items-center gap-1 px-2 py-0.5 text-[11px] border-accent/25 text-accent hover:bg-accent/10 transition-all duration-200 active:scale-95"
        >
          <FolderOpen size={10} />
          {projectPath ? projectPath.split(/[/\\]/).pop() : '打开项目'}
        </button>
        {projectPath && (
          <button onClick={onClearProject} className="text-[11px] text-text-muted hover:text-red-400 transition-colors" title="解除项目绑定">
            <X size={9} />
          </button>
        )}
        <span className="mx-1 text-text-muted/30">|</span>
        {getSlashCommands(currentMode).map(({ cmd, systemHint }) => (
          <button
            key={cmd}
            onClick={() => onSlashCommand(cmd, systemHint)}
            className="chip px-2 py-0.5 text-[11px] text-text-muted hover:text-accent hover:border-accent/30 hover:bg-accent/5 transition-all duration-200 active:scale-95"
          >
            {cmd}
          </button>
        ))}
      </div>
    )
  }

  if (currentMode === 'design') {
    return (
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-text-muted">试试：生成一个登录页面、设计一套颜色系统、审查 UI · 点击「风格」绑定设计风格 · 点击「组件」多选 UI 组件</span>
      </div>
    )
  }

  return null
}
