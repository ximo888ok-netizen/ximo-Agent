import { FolderOpen, X } from 'lucide-react'
import { getSlashCommands } from './constants'

interface CodingToolbarProps {
  openProject: () => void
  projectPath: string
  setProjectPath: (p: string) => void
  handleSlashCommand: (cmd: string, systemHint: string) => void
}

/** Coding 模式底部工具栏：打开项目 + 斜杠命令快捷行 */
export function CodingToolbar({
  openProject, projectPath, setProjectPath, handleSlashCommand
}: CodingToolbarProps): React.ReactElement {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <button
        onClick={openProject}
        className="chip flex items-center gap-1 px-2 py-0.5 text-caption border-accent/25 text-accent hover:bg-accent/10 transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] duration-fast active:scale-95"
      >
        <FolderOpen size={11} />
        {projectPath ? projectPath.split(/[/\\]/).pop() : '打开项目'}
      </button>
      {projectPath && (
        <button
          onClick={() => setProjectPath('')}
          className="text-caption text-text-muted hover:text-red-400 transition-colors active:scale-[0.97]"
          title="解除项目绑定"
        >
          <X size={11} />
        </button>
      )}
      <span className="mx-1 text-text-quaternary">|</span>
      {getSlashCommands('coding').map(({ cmd, label }) => (
        <button
          key={cmd}
          onClick={() => {
            const found = getSlashCommands('coding').find(c => c.cmd === cmd)
            if (found) handleSlashCommand(cmd, found.systemHint)
          }}
          className="chip px-2 py-0.5 text-caption text-text-muted hover:text-accent hover:border-accent/30 hover:bg-accent/5 transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] duration-fast active:scale-95"
        >
          {cmd}
        </button>
      ))}
    </div>
  )
}
