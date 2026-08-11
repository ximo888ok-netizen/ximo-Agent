import { useState } from 'react'
import type { SkillStep } from '@shared/types'

interface SaveSkillDialogProps {
  initialName: string
  initialDesc: string
  stepCount: number
  endpointCount: number
  onSave: (name: string, desc: string) => void
  onCancel: () => void
}

/** 保存技能对话框 */
export function SaveSkillDialog({ initialName, initialDesc, stepCount, endpointCount, onSave, onCancel }: SaveSkillDialogProps): React.ReactElement {
  const [name, setName] = useState(initialName)
  const [desc, setDesc] = useState(initialDesc)

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="ios-card w-72 p-4 animate-fade-scale">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">保存技能</h3>
        <div className="space-y-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-border-subtle bg-bg-base px-3 py-1.5 text-xs text-text-primary focus:border-accent/40 focus:outline-none"
            placeholder="技能名称"
          />
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="w-full rounded-lg border border-border-subtle bg-bg-base px-3 py-1.5 text-xs text-text-primary focus:border-accent/40 focus:outline-none resize-none"
            placeholder="技能描述"
            rows={2}
          />
          <div className="text-[10px] text-text-muted">
            {stepCount} 步操作 · {endpointCount} 个 API 端点
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost rounded-lg px-3 py-1 text-xs">取消</button>
          <button onClick={() => onSave(name, desc)} className="btn-primary rounded-lg px-3 py-1 text-xs">保存</button>
        </div>
      </div>
    </div>
  )
}
