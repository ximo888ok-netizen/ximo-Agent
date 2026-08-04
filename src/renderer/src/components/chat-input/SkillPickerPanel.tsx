import type { RefObject } from 'react'
import { Play } from 'lucide-react'
import type { Skill } from '@shared/types'
import type { StoreState } from '../../store/types'

interface SkillPickerPanelProps {
  skills: Skill[]
  showSkillPicker: boolean
  setShowSkillPicker: (v: boolean) => void
  sendMessage: StoreState['sendMessage']
  skillPickerRef: RefObject<HTMLDivElement>
}

/** 技能选择器：切换按钮 + 向上展开的技能列表弹出面板 */
export function SkillPickerPanel({
  skills,
  showSkillPicker,
  setShowSkillPicker,
  sendMessage,
  skillPickerRef
}: SkillPickerPanelProps): React.ReactElement {
  return (
    <div className="relative" ref={skillPickerRef}>
      <button
        onClick={() => setShowSkillPicker(!showSkillPicker)}
        className={`chip flex items-center gap-1 px-2 py-0.5 text-[11px] transition-all duration-200 active:scale-95 ${
          showSkillPicker ? 'border-accent/40 text-accent bg-accent/8' : 'text-text-muted hover:text-accent hover:border-accent/30'
        }`}
        title="调用已录制的技能"
      >
        <Play size={10} />
        技能
        {skills.length > 0 && <span className="text-[9px] opacity-60">({skills.length})</span>}
      </button>

      {/* 技能列表弹出面板 */}
      {showSkillPicker && (
        <div className="absolute bottom-full left-0 mb-2 w-[320px] max-h-[320px] rounded-xl border border-border-subtle bg-bg-elevated shadow-glass animate-fade-scale flex flex-col overflow-hidden z-50">
          <div className="px-3 py-1.5 text-[10px] text-text-muted border-b border-border-subtle">
            已录制技能 — 点击调用
          </div>
          <div className="flex-1 overflow-y-auto">
            {skills.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-text-muted">
                暂无已录制技能
                <br />
                <span className="text-[10px]">打开浏览器后点击"录制"按钮开始录制</span>
              </div>
            ) : (
              skills.map((skill) => (
                <button
                  key={skill.id}
                  onClick={() => {
                    sendMessage(`请使用 skill_invoke(skill_name="${skill.name}") 调用技能 "${skill.name}"。`, { skipNetworkHint: true })
                    setShowSkillPicker(false)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-bg-hover"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
                    <Play size={9} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-text-primary">{skill.name}</p>
                    <p className="truncate text-[10px] text-text-muted">{skill.description || `${skill.steps.length} 步操作`}</p>
                  </div>
                  <span className="shrink-0 text-[9px] text-text-muted">{skill.invokeCount}次</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
