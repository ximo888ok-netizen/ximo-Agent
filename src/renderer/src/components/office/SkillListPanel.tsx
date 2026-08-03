import { useState } from 'react'
import type React from 'react'
import { Upload, FileText } from 'lucide-react'
import { useSkillManager } from './useSkillManager'
import { SkillCard } from './SkillCard'
import { SkillImportDialog } from './SkillImportDialog'

/**
 * SkillListPanel — 导入技能列表面板
 *
 * 支持导入 SKILL.md 格式的技能（兼容 Claude / CatPaw / Open Design 等）。
 * 导入方式：
 *   1. 从文件导入（选择 .md 文件）
 *   2. 粘贴文本导入（直接粘贴 SKILL.md 内容）
 *
 * 导入后持久化保存，可启用/禁用、可删除。
 */
export function SkillListPanel(): React.ReactElement {
  const [showImport, setShowImport] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const {
    skills,
    importError,
    importing,
    setImportError,
    handleImportFromFile,
    handleImportFromText,
    handleToggle,
    handleDelete,
  } = useSkillManager()

  return (
    <div className="flex h-full flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <FileText size={13} className="text-accent" />
          <span className="text-xs font-semibold text-text-primary">导入技能</span>
          {skills.length > 0 && (
            <span className="text-[10px] text-text-muted">{skills.length} 个</span>
          )}
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-1 rounded-lg bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent transition-all hover:bg-accent/20"
        >
          <Upload size={11} />
          导入
        </button>
      </div>

      {/* 技能列表 */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-elevated text-text-muted mb-2">
              <FileText size={18} />
            </div>
            <p className="text-xs text-text-muted">暂无导入的技能</p>
            <p className="mt-1 text-[10px] text-text-muted/70">
              支持 SKILL.md 格式（兼容 Claude / CatPaw 等）
            </p>
            <button
              onClick={() => setShowImport(true)}
              className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-[11px] text-text-secondary transition-all hover:border-accent/40 hover:text-accent"
            >
              <Upload size={11} />
              导入技能
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {skills.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                expanded={expandedId === skill.id}
                onToggleExpand={() => setExpandedId(expandedId === skill.id ? null : skill.id)}
                onToggleEnabled={() => void handleToggle(skill.id)}
                onDelete={() => void handleDelete(skill.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 导入弹窗 */}
      {showImport && (
        <SkillImportDialog
          importing={importing}
          importError={importError}
          onImportFromFile={handleImportFromFile}
          onImportFromText={handleImportFromText}
          onClose={() => { setShowImport(false); setImportError('') }}
        />
      )}
    </div>
  )
}
