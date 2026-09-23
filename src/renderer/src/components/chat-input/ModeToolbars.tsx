import type React from 'react'
import { FolderOpen, X } from 'lucide-react'
import { OfficeToolbar } from './OfficeToolbar'
import { getSlashCommands } from './constants'

interface ModeToolbarsProps {
  currentMode: string
  projectPath: string
  onOpenProject: () => void
  onClearProject: () => void
  onSlashCommand: (cmd: string, systemHint?: string) => void
}

/** 模式专属工具栏 — office/coding/design 各自的快捷操作栏 */
export function ModeToolbars({
  currentMode, projectPath, onOpenProject, onClearProject, onSlashCommand,
}: ModeToolbarsProps): React.ReactElement | null {
  if (currentMode === 'office') {
    return <OfficeToolbar />
  }

  if (currentMode === 'coding') {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        <button
          onClick={onOpenProject}
          className="chip flex items-center gap-1 px-2 py-0.5 text-caption border-accent/25 text-accent hover:bg-accent/10 transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] duration-fast active:scale-95"
        >
          <FolderOpen size={11} />
          {projectPath ? projectPath.split(/[/\\]/).pop() : '打开项目'}
        </button>
        {projectPath && (
          <button aria-label="解除项目绑定" onClick={onClearProject} className="text-caption text-text-muted hover:text-red-400 transition-colors active:scale-[0.97]" title="解除项目绑定">
            <X size={11} />
          </button>
        )}
        <span className="mx-1 text-text-quaternary">|</span>
        {getSlashCommands(currentMode).map(({ cmd, systemHint }) => (
          <button
            key={cmd}
            onClick={() => onSlashCommand(cmd, systemHint)}
            className="chip px-2 py-0.5 text-caption text-text-muted hover:text-accent hover:border-accent/30 hover:bg-accent/5 transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] duration-fast active:scale-95"
          >
            {cmd}
          </button>
        ))}
      </div>
    )
  }

  // design 模式不再显示「试试：…」建议清单 —— 一句欢迎语已经说明模式用途，
  // 再叠一行建议 prompt 等于把快捷指令换个形式堆回来。

  return null
}
