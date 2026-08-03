import { FileText } from 'lucide-react'

interface FileMentionMenuProps {
  files: string[]
  selectedIndex: number
  onSelect: (file: string) => void
  onHover: (index: number) => void
}

/** @file 引用弹出菜单 */
export function FileMentionMenu({ files, selectedIndex, onSelect, onHover }: FileMentionMenuProps): React.ReactElement | null {
  if (files.length === 0) return null

  return (
    <div className="mx-4 mb-1 max-h-48 overflow-y-auto rounded-xl border border-border-subtle bg-bg-elevated/95 backdrop-blur-xl shadow-glass animate-scale-in">
      <div className="px-3 py-1.5 text-[10px] text-text-muted border-b border-border-subtle">
        文件引用 — ↑↓ 导航，Enter/Tab 确认，Esc 取消
      </div>
      {files.map((file, i) => {
        const fileName = file.split('/').pop() || file
        const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : ''
        return (
          <button
            key={file}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(file)
            }}
            onMouseEnter={() => onHover(i)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
              i === selectedIndex ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-bg-hover'
            }`}
          >
            <FileText size={12} className="shrink-0 opacity-60" />
            <span className="font-mono truncate">{fileName}</span>
            {dir && <span className="text-text-muted/50 text-[10px] truncate">{dir}</span>}
          </button>
        )
      })}
    </div>
  )
}
