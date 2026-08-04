import { getSlashCommands } from './constants'
import type { Mode } from '@shared/types'

interface SlashCommandMenuProps {
  currentMode: Mode
  onSlashCommand: (cmd: string, systemHint: string) => void
}

/** 斜杠命令弹出菜单 */
export function SlashCommandMenu({ currentMode, onSlashCommand }: SlashCommandMenuProps): React.ReactElement {
  return (
    <div className="glass-strong mt-2 rounded-2xl border border-border p-1.5 shadow-glass animate-scale-in">
      {getSlashCommands(currentMode).map(({ cmd, label, systemHint }) => (
        <button
          key={cmd}
          onClick={() => onSlashCommand(cmd, systemHint)}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
        >
          <span className="font-mono text-accent">{cmd}</span>
          <span className="text-text-muted">{label}</span>
        </button>
      ))}
    </div>
  )
}
