import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { Upload, FileText, Search, X, ArrowDownWideNarrow, CircleDot } from 'lucide-react'
import { useSkillManager } from './useSkillManager'
import { SkillCard } from './SkillCard'
import { SkillImportDialog } from './SkillImportDialog'

/** 技能来自两套存储：importedSkills=SKILL.md 导入；skills=浏览器录制生成 */
type SortKey = 'recent' | 'name'

const SORT_LABEL: Record<SortKey, string> = {
  recent: '按导入时间排序（新→旧）',
  name: '按名称排序',
}

/**
 * SkillListPanel — 技能列表面板（导入技能）
 *
 * 支持导入 SKILL.md 格式的技能（兼容 Claude / CatPaw / Open Design 等），
 * 可搜索、排序、启用/禁用、展开查看正文与触发词、删除。
 *
 * 注意：录制生成的技能存在另一套存储（`window.api.skills`），由输入区的「技能」
 * 选择器调用；本面板只列导入技能，并在头部提示录制技能的数量，避免用户以为丢了。
 */
export function SkillListPanel(): React.ReactElement {
  const [showImport, setShowImport] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('recent')
  const [recordedCount, setRecordedCount] = useState(0)

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

  // 录制技能来自另一套存储，这里只取数量做提示
  useEffect(() => {
    void window.api.skills
      .load()
      .then((list: unknown[]) => setRecordedCount(list.length))
      .catch(() => setRecordedCount(0))
  }, [skills.length])

  const enabledCount = useMemo(() => skills.filter((s) => s.enabled).length, [skills])
  const triggerCount = useMemo(() => skills.reduce((sum, s) => sum + (s.triggers?.length ?? 0), 0), [skills])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? skills.filter((s) =>
          s.name.toLowerCase().includes(q) ||
          (s.description ?? '').toLowerCase().includes(q) ||
          (s.triggers ?? []).some((t) => t.toLowerCase().includes(q))
        )
      : skills
    return [...filtered].sort((a, b) =>
      sortKey === 'recent' ? b.importedAt - a.importedAt : a.name.localeCompare(b.name)
    )
  }, [skills, query, sortKey])

  return (
    <div className="flex h-full flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-3 py-2 shrink-0">
        <div className="flex min-w-0 items-center gap-2">
          <FileText size={13} className="shrink-0 text-accent" />
          <span className="shrink-0 text-xs font-semibold text-text-primary">导入技能</span>
          {skills.length > 0 && (
            <span
              className="truncate text-caption text-text-muted"
              title={`已启用 ${enabledCount} / 共 ${skills.length} · 触发词 ${triggerCount} 条`}
            >
              已启用 {enabledCount}/{skills.length} · 触发词 {triggerCount}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="flex shrink-0 items-center gap-1 rounded-card bg-accent/10 px-2 py-1 text-caption font-medium text-accent transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] hover:bg-accent/20 active:scale-[0.97]"
        >
          <Upload size={11} />
          导入
        </button>
      </div>

      {/* 录制技能提示 — 两套存储的分工说明，避免用户以为录制技能丢了 */}
      {recordedCount > 0 && (
        <div className="flex items-center gap-1.5 border-b border-border-subtle px-3 py-1.5 shrink-0">
          <CircleDot size={11} className="shrink-0 text-text-muted" />
          <span className="text-caption text-text-muted">
            另有 {recordedCount} 个录制技能，在输入区的「技能」里调用
          </span>
        </div>
      )}

      {/* 工具条 — 有内容时才出现，空态不占地方 */}
      {skills.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 shrink-0">
          <div className="flex flex-1 items-center gap-1.5 rounded-card border border-border bg-bg-input px-2 py-1">
            <Search size={11} className="shrink-0 text-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索名称、描述或触发词…"
              className="min-w-0 flex-1 bg-transparent text-caption text-text-primary placeholder:text-text-muted focus-ring"
            />
            {query && (
              <button onClick={() => setQuery('')} className="icon-btn rounded-control p-0.5" title="清空搜索">
                <X size={11} />
              </button>
            )}
          </div>
          <button
            onClick={() => setSortKey(sortKey === 'recent' ? 'name' : 'recent')}
            className="icon-btn shrink-0 rounded-control p-1"
            title={SORT_LABEL[sortKey]}
          >
            <ArrowDownWideNarrow size={13} />
          </button>
        </div>
      )}

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-panel bg-bg-elevated text-text-muted">
              <FileText size={16} />
            </div>
            <p className="text-xs text-text-muted">还没有技能</p>
            <p className="mt-1 text-caption leading-relaxed text-text-muted">
              导入 SKILL.md（兼容 Claude / CatPaw）
              <br />
              或在办公模式「工具」里开启浏览器后录制操作
            </p>
            <button
              onClick={() => setShowImport(true)}
              className="mt-3 flex items-center gap-1.5 rounded-card border border-dashed border-border px-3 py-1.5 text-caption text-text-secondary transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] hover:border-accent/40 hover:text-accent active:scale-[0.97]"
            >
              <Upload size={11} />
              导入技能
            </button>
          </div>
        ) : visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-caption text-text-muted">
            没有匹配「{query}」的技能
          </p>
        ) : (
          <div className="space-y-1.5">
            {visible.map((skill) => (
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
