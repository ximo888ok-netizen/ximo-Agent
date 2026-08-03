import { ChevronDown, ChevronRight, FileText, Power, Trash2, Tag } from 'lucide-react'
import type { ImportedSkill } from '@shared/types'

interface SkillCardProps {
  skill: ImportedSkill
  expanded: boolean
  onToggleExpand: () => void
  onToggleEnabled: () => void
  onDelete: () => void
}

export function SkillCard({ skill, expanded, onToggleExpand, onToggleEnabled, onDelete }: SkillCardProps): React.ReactElement {
  return (
    <div
      className={`group rounded-lg border transition-all ${
        skill.enabled
          ? 'border-border-subtle bg-bg-hover/30'
          : 'border-border-subtle/50 bg-bg-elevated/30 opacity-60'
      }`}
    >
      <div className="flex items-center gap-2 px-2.5 py-2">
        {/* 展开/折叠 */}
        <button
          onClick={onToggleExpand}
          className="text-text-muted hover:text-text-primary transition-colors"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
          <FileText size={10} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-text-primary truncate">{skill.name}</p>
          <p className="text-[10px] text-text-muted truncate">
            {skill.description || '无描述'}
          </p>
        </div>

        {/* 启用/禁用 */}
        <button
          onClick={onToggleEnabled}
          className={`icon-btn rounded-md p-1 transition-all ${
            skill.enabled
              ? 'text-green-400 hover:bg-green-400/10'
              : 'text-text-muted hover:bg-bg-hover'
          }`}
          title={skill.enabled ? '已启用 — 点击禁用' : '已禁用 — 点击启用'}
        >
          <Power size={11} />
        </button>

        {/* 删除 */}
        <button
          onClick={onDelete}
          className="icon-btn rounded-md p-1 text-text-muted opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
          title="删除"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* 展开详情 */}
      {expanded && (
        <div className="border-t border-border-subtle px-2.5 py-2">
          {/* 触发词 */}
          {skill.triggers.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center gap-1 mb-1">
                <Tag size={9} className="text-text-muted" />
                <span className="text-[9px] font-medium text-text-muted uppercase tracking-wider">触发词</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {skill.triggers.map((t, i) => (
                  <span
                    key={i}
                    className="rounded bg-accent/10 px-1.5 py-0.5 text-[9px] text-accent"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 正文预览 */}
          <div>
            <span className="text-[9px] font-medium text-text-muted uppercase tracking-wider mb-1 block">正文</span>
            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-bg-elevated/50 p-2 text-[10px] leading-relaxed text-text-secondary">
              {skill.body.slice(0, 500)}{skill.body.length > 500 ? '\n...' : ''}
            </pre>
          </div>

          {/* 元信息 */}
          <div className="mt-2 flex items-center gap-2 text-[9px] text-text-muted">
            <span>来源：{skill.source === 'file' ? skill.fileName || '文件' : '粘贴'}</span>
            <span>·</span>
            <span>{new Date(skill.importedAt).toLocaleDateString()}</span>
          </div>
        </div>
      )}
    </div>
  )
}
