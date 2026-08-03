import { Paperclip, AtSign, X, Image as ImageIcon, Palette, Box } from 'lucide-react'
import { getAgentById } from '@renderer/agents'
import type { Mode } from '@shared/types'
import { STYLE_CATALOG, COMPONENT_CATALOG } from './constants'

interface ChatChipsProps {
  attachedFiles: string[]
  onRemoveFile: (f: string) => void
  currentMode: Mode
  activeExperts: string[]
  onToggleExpert: (id: string) => void
  activeStyleId: string | null
  onClearStyle: () => void
  selectedComponentIds: string[]
  onToggleComponent: (id: string) => void
  onClearComponents: () => void
  activeSlashCmd: { cmd: string; systemHint: string } | null
  onClearSlashCmd: () => void
}

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']

/** 输入框上方的芯片区域：附加文件、专家、风格、组件、斜杠命令 */
export function ChatChips({
  attachedFiles, onRemoveFile,
  currentMode, activeExperts, onToggleExpert,
  activeStyleId, onClearStyle,
  selectedComponentIds, onToggleComponent, onClearComponents,
  activeSlashCmd, onClearSlashCmd
}: ChatChipsProps): React.ReactElement | null {
  const activeStyle = STYLE_CATALOG.find((s) => s.id === activeStyleId) ?? null
  const selectedComponents = COMPONENT_CATALOG.filter((c) => selectedComponentIds.includes(c.id))
  const hasChips = attachedFiles.length > 0 ||
    (currentMode !== 'design' && activeExperts.length > 0) ||
    (currentMode === 'design' && activeStyle) ||
    (currentMode === 'design' && selectedComponents.length > 0) ||
    activeSlashCmd

  if (!hasChips) return null

  return (
    <>
      {/* 附加文件标签 */}
      {attachedFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {attachedFiles.map((f) => {
            const name = f.split(/[/\\]/).pop() || f
            const ext = f.toLowerCase().match(/\.[^.]+$/)?.[0] || ''
            const isImage = IMAGE_EXTS.includes(ext)
            return (
              <span key={f} className="chip px-2 py-0.5 text-[11px] text-accent animate-scale-in">
                {isImage ? <ImageIcon size={10} /> : <Paperclip size={10} />}
                {name}
                <button onClick={() => onRemoveFile(f)} className="ml-0.5 hover:text-red-400 transition-colors">
                  <X size={10} />
                </button>
              </span>
            )
          })}
        </div>
      )}

      {/* 已激活的 AI 专家标签（非设计模式） */}
      {currentMode !== 'design' && activeExperts.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {activeExperts.map((id) => {
            const agent = getAgentById(id)
            if (!agent) return null
            return (
              <span key={id} className="chip flex items-center gap-1 px-2 py-0.5 text-[11px] text-accent border-accent/30 bg-accent/10 animate-scale-in">
                {agent.emoji} {agent.name}
                <button onClick={() => onToggleExpert(id)} className="ml-0.5 hover:text-red-400 transition-colors">
                  <X size={10} />
                </button>
              </span>
            )
          })}
        </div>
      )}

      {/* 已绑定的设计风格标签（设计模式） */}
      {currentMode === 'design' && activeStyle && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          <span className="chip flex items-center gap-1 px-2 py-0.5 text-[11px] text-accent border-accent/30 bg-accent/10 animate-scale-in">
            <Palette size={10} />
            {activeStyle.name}
            <button onClick={onClearStyle} className="ml-0.5 hover:text-red-400 transition-colors" title="解除风格绑定">
              <X size={10} />
            </button>
          </span>
        </div>
      )}

      {/* 已选择的 UI 组件标签（设计模式） */}
      {currentMode === 'design' && selectedComponents.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedComponents.map((c) => (
            <span key={c.id} className="chip flex items-center gap-1 px-2 py-0.5 text-[11px] text-accent border-accent/30 bg-accent/10 animate-scale-in">
              <Box size={10} />
              {c.nameCn}
              <button onClick={() => onToggleComponent(c.id)} className="ml-0.5 hover:text-red-400 transition-colors" title="移除组件">
                <X size={10} />
              </button>
            </span>
          ))}
          <button onClick={onClearComponents} className="text-[10px] text-text-muted hover:text-red-400 transition-colors px-1">
            清空
          </button>
        </div>
      )}

      {/* 斜杠命令胶囊 */}
      {activeSlashCmd && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          <span
            className="chip flex items-center gap-1 px-2 py-0.5 text-[11px] text-accent border-accent/30 bg-accent/10 animate-scale-in cursor-default"
            title={activeSlashCmd.systemHint}
          >
            {activeSlashCmd.cmd.replace(/^\//, '')}
            <button
              onClick={onClearSlashCmd}
              className="ml-0.5 hover:text-red-400 transition-colors"
              title="移除"
            >
              <X size={10} />
            </button>
          </span>
        </div>
      )}
    </>
  )
}
