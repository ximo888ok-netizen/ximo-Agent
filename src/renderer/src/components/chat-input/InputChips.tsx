import { Paperclip, X, Image, Palette, Box } from 'lucide-react'
import { getAgentById } from '../../agents'
import type { Mode } from '@shared/types'

interface InputChipsProps {
  attachedFiles: string[]
  removeAttachedFile: (f: string) => void
  activeExperts: string[]
  toggleExpert: (id: string) => void
  activeStyle: { id: string; name: string } | null
  setActiveStyleId: (id: string | null) => void
  selectedComponents: Array<{ id: string; nameCn: string }>
  toggleComponent: (id: string) => void
  clearSelectedComponents: () => void
  activeSlashCmd: { cmd: string; systemHint: string } | null
  setActiveSlashCmd: (v: { cmd: string; systemHint: string } | null) => void
  currentMode: Mode
}

/** 输入框上方的芯片显示区域：附加文件、AI专家、设计风格、UI组件、斜杠命令 */
export function InputChips({
  attachedFiles, removeAttachedFile,
  activeExperts, toggleExpert,
  activeStyle, setActiveStyleId,
  selectedComponents, toggleComponent, clearSelectedComponents,
  activeSlashCmd, setActiveSlashCmd,
  currentMode
}: InputChipsProps): React.ReactElement | null {
  return (
    <>
      {/* 附加文件标签 */}
      {attachedFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {attachedFiles.map((f) => {
            const name = f.split(/[/\\]/).pop() || f
            const ext = f.toLowerCase().match(/\.[^.]+$/)?.[0] || ''
            const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(ext)
            return (
              <span key={f} className="chip px-2 py-0.5 text-[11px] text-accent animate-scale-in">
                {isImage ? <Image size={10} /> : <Paperclip size={10} />}
                {name}
                <button onClick={() => removeAttachedFile(f)} className="ml-0.5 hover:text-red-400 transition-colors">
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
                <button onClick={() => toggleExpert(id)} className="ml-0.5 hover:text-red-400 transition-colors">
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
            <button onClick={() => setActiveStyleId(null)} className="ml-0.5 hover:text-red-400 transition-colors" title="解除风格绑定">
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
              <button onClick={() => toggleComponent(c.id)} className="ml-0.5 hover:text-red-400 transition-colors" title="移除组件">
                <X size={10} />
              </button>
            </span>
          ))}
          <button onClick={clearSelectedComponents} className="text-[10px] text-text-muted hover:text-red-400 transition-colors px-1">
            清空
          </button>
        </div>
      )}

      {/* 斜杠命令胶囊 — 激活后显示小胶囊，hover 显示提示词摘要 */}
      {activeSlashCmd && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          <span
            className="chip flex items-center gap-1 px-2 py-0.5 text-[11px] text-accent border-accent/30 bg-accent/10 animate-scale-in cursor-default"
            title={activeSlashCmd.systemHint}
          >
            {activeSlashCmd.cmd.replace(/^\//, '')}
            <button
              onClick={() => setActiveSlashCmd(null)}
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
