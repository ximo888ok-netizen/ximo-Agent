interface SaveSkillDialogProps {
  show: boolean
  skillName: string
  skillDesc: string
  stepCount: number
  endpointCount: number
  onSkillNameChange: (value: string) => void
  onSkillDescChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}

export function SaveSkillDialog({
  show,
  skillName,
  skillDesc,
  stepCount,
  endpointCount,
  onSkillNameChange,
  onSkillDescChange,
  onSave,
  onCancel,
}: SaveSkillDialogProps): React.ReactElement | null {
  if (!show) return null

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="ios-card w-72 p-4 animate-fade-scale">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">保存技能</h3>
        <div className="space-y-2">
          <input
            type="text"
            value={skillName}
            onChange={(e) => onSkillNameChange(e.target.value)}
            className="w-full rounded-lg border border-border-subtle bg-bg-input px-3 py-1.5 text-xs text-text-primary focus:border-accent/40 focus:outline-none"
            placeholder="技能名称"
          />
          <textarea
            value={skillDesc}
            onChange={(e) => onSkillDescChange(e.target.value)}
            className="w-full rounded-lg border border-border-subtle bg-bg-input px-3 py-1.5 text-xs text-text-primary focus:border-accent/40 focus:outline-none resize-none"
            placeholder="技能描述"
            rows={2}
          />
          <div className="text-[10px] text-text-muted">
            {stepCount} 步操作 ·{' '}{endpointCount} 个 API 端点
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost rounded-lg px-3 py-1 text-xs">取消</button>
          <button onClick={onSave} className="btn-primary rounded-lg px-3 py-1 text-xs">保存</button>
        </div>
      </div>
    </div>
  )
}
