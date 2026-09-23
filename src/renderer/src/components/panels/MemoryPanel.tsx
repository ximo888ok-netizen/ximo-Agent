import { useCallback, useEffect, useMemo, useState } from 'react'
import { Brain, Check, ChevronDown, Save, Sparkles, Trash2, X } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { MODE_CONFIGS } from '@renderer/modes'
import { Icon } from '@renderer/components/Icon'
import { countMemoryWrites } from '@renderer/lib/session-artifacts'
import { SpinnerBlock } from '@renderer/components/shared/Spinner'
import {
  EMPTY_PARSED,
  EMPTY_SECTIONS,
  LINE_BUDGET,
  MEMORY_SECTIONS,
  buildMemory,
  countContentLines,
  parseMemory,
  type ParsedMemory,
} from '@renderer/lib/memory-format'
import type { Mode } from '@shared/types'

/**
 * MemoryPanel — 模式记忆编辑面板
 *
 * 三个模式各有独立记忆，内容在每次会话开始时注入系统提示词。
 * 支持面板内直接切换模式；落盘内容若已按「用户习惯 / 踩过的坑 / 工具语法」分节，
 * 则按三节结构化编辑，否则保持整块文本编辑并提供「转为三节结构」——不擅自重排用户内容。
 */
export function MemoryPanel(): React.ReactElement | null {
  const showMemoryPanel = useStore((s) => s.showMemoryPanel)
  const setShowMemoryPanel = useStore((s) => s.setShowMemoryPanel)
  const currentMode = useStore((s) => s.currentMode) as Mode
  const conversation = useStore((s) => s.conversations.find((c) => c.id === s.currentConversationId) ?? null)

  const [editingMode, setEditingMode] = useState<Mode>(currentMode)
  const [parsed, setParsed] = useState<ParsedMemory>(EMPTY_PARSED)
  const [baseline, setBaseline] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // 本次会话 Agent 实际写入记忆的次数
  const sessionWrites = useMemo(() => countMemoryWrites(conversation?.messages ?? []), [conversation?.messages])

  const load = useCallback(async (mode: Mode): Promise<void> => {
    setLoading(true)
    try {
      const text = await window.api.memory.load(mode)
      const next = parseMemory(text)
      setParsed(next)
      setBaseline(buildMemory(next).trim())
    } finally {
      setLoading(false)
      setSaved(false)
    }
  }, [])

  // 每次打开面板都以「当前模式」为初始编辑对象
  useEffect(() => {
    if (showMemoryPanel) setEditingMode(currentMode)
  }, [showMemoryPanel, currentMode])

  useEffect(() => {
    if (showMemoryPanel) void load(editingMode)
  }, [showMemoryPanel, editingMode, load])

  const built = useMemo(() => buildMemory(parsed), [parsed])
  const contentLines = useMemo(() => countContentLines(built), [built])
  const dirty = built.trim() !== baseline
  const overBudget = contentLines > LINE_BUDGET

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      await window.api.memory.save(editingMode, built)
      setBaseline(built.trim())
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (!showMemoryPanel) return null

  const modeConfig = MODE_CONFIGS[editingMode]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={() => setShowMemoryPanel(false)}
    >
      <div
        className="glass-panel flex h-[76vh] w-[760px] max-w-[94vw] flex-col overflow-hidden animate-fade-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="accent-tile flex h-9 w-9 items-center justify-center rounded-panel shadow-lg shadow-accent/20">
              <Brain size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">{modeConfig.name} · 记忆</h2>
              <p className="text-xs text-text-muted">
                持久化指令 · 每次对话自动注入
                {sessionWrites > 0 && ` · 本次会话 Agent 更新 ${sessionWrites} 次`}
              </p>
            </div>
          </div>
          <button onClick={() => setShowMemoryPanel(false)} className="icon-btn rounded-card p-1.5">
            <X size={16} />
          </button>
        </div>

        {/* 模式切换 — 面板内直接查看/编辑三个模式的记忆 */}
        <div className="flex items-center gap-0.5 border-b border-border-subtle px-4 py-2">
          {(['office', 'coding', 'design'] as Mode[]).map((m) => {
            const active = editingMode === m
            return (
              <button
                key={m}
                onClick={() => setEditingMode(m)}
                className={`flex items-center gap-1.5 rounded-card px-3 py-1.5 text-xs font-medium transition-colors ${
                  active ? 'bg-accent/15 text-accent' : 'text-text-muted hover:bg-bg-hover hover:text-text-secondary'
                }`}
              >
                <Icon name={MODE_CONFIGS[m].icon} size={13} />
                {MODE_CONFIGS[m].name.replace('模式', '')}
                {m === currentMode && <span className="h-1 w-1 rounded-full bg-current opacity-70" title="当前模式" />}
              </button>
            )
          })}
          <span className="ml-auto text-caption text-text-tertiary">三模式记忆相互独立</span>
        </div>

        {/* 编辑区 */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
          {loading ? (
            <SpinnerBlock className="flex-1" />
          ) : parsed.mode === 'freeform' ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-caption text-text-muted">当前为整块文本</span>
                <button
                  onClick={() => setParsed({ mode: 'structured', sections: { ...EMPTY_SECTIONS }, other: parsed.freeText.trim(), freeText: '' })}
                  className="chip flex items-center gap-1 px-2 py-0.5 text-caption text-accent border-accent/25 bg-accent/10 hover:bg-accent/15 transition-colors"
                  title="把现有内容放入「其他」，再逐条归类到三节"
                >
                  <Sparkles size={11} />
                  转为三节结构
                </button>
              </div>
              <textarea
                value={parsed.freeText}
                onChange={(e) => setParsed({ ...parsed, freeText: e.target.value })}
                placeholder={'在此写入该模式的持久记忆…\n\n建议只记录三类内容（可点上方按钮转为结构化编辑）：\n• 用户习惯 — 偏好的格式、风格、工作方式\n• 踩过的坑 — 犯过的错误及纠正方法\n• 工具语法 — 本项目工具调用的正确用法'}
                spellCheck={false}
                className="min-h-[200px] flex-1 resize-none rounded-panel border border-border bg-bg-input px-4 py-3 text-sm leading-relaxed text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus-ring focus:ring-1 focus:ring-accent/20"
              />
            </div>
          ) : (
            <div className="space-y-2">
              {MEMORY_SECTIONS.map((s) => (
                <MemorySection
                  key={s.key}
                  title={s.title}
                  hint={s.hint}
                  example={s.example}
                  value={parsed.sections[s.key]}
                  collapsed={collapsed[s.key] ?? false}
                  onToggle={() => setCollapsed((c) => ({ ...c, [s.key]: !(c[s.key] ?? false) }))}
                  onChange={(v) => setParsed({ ...parsed, sections: { ...parsed.sections, [s.key]: v } })}
                />
              ))}
              {parsed.other.trim() && (
                <MemorySection
                  title="其他"
                  hint="未归入以上三类的内容"
                  value={parsed.other}
                  collapsed={collapsed.other ?? true}
                  onToggle={() => setCollapsed((c) => ({ ...c, other: !(c.other ?? true) }))}
                  onChange={(v) => setParsed({ ...parsed, other: v })}
                />
              )}
            </div>
          )}
        </div>

        {/* 底栏：用量 + 操作 */}
        <div className="flex items-center justify-between border-t border-border-subtle px-4 py-2">
          <span className={`text-caption ${overBudget ? 'text-amber-500' : 'text-text-muted'}`}>
            {contentLines} / {LINE_BUDGET} 行 · {built.trim() ? built.trim().length : 0} 字符
            {overBudget && ' · 超出建议行数，记忆越精简越有效'}
            {!overBudget && dirty && ' · 未保存'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setParsed({ ...EMPTY_PARSED, mode: parsed.mode, sections: { ...EMPTY_SECTIONS } })}
              disabled={!built.trim()}
              className="btn-ghost flex items-center gap-1 rounded-card px-3 py-1.5 text-xs disabled:opacity-40"
              title="清空编辑区（需保存后才生效）"
            >
              <Trash2 size={13} />
              清空
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={!dirty || saving}
              className={`flex items-center gap-1.5 rounded-card px-4 py-1.5 text-xs font-semibold transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] ${
                saved ? 'bg-emerald-500/20 text-emerald-400' : dirty ? 'btn-liquid' : 'bg-bg-hover text-text-muted'
              }`}
            >
              {saved ? <Check size={13} /> : <Save size={13} />}
              {saved ? '已保存' : saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** 可折叠的分类区块 — 按内容行数自动增高 */
function MemorySection({
  title, hint, example, value, collapsed, onToggle, onChange,
}: {
  title: string
  hint: string
  example?: string
  value: string
  collapsed: boolean
  onToggle: () => void
  onChange: (v: string) => void
}): React.ReactElement {
  const lines = value.split('\n').filter((l) => l.trim()).length
  return (
    <div className="rounded-panel border border-border-subtle bg-bg-surface-soft">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-panel px-3 py-2 text-left transition-colors hover:bg-bg-hover active:scale-[0.97]"
      >
        <span className="flex-1 text-xs font-medium text-text-secondary">{title}</span>
        <span className="text-caption text-text-tertiary">{hint}</span>
        <span className="text-caption tabular-nums text-text-tertiary">{lines > 0 ? `${lines} 条` : '空'}</span>
        <ChevronDown size={13} className={`shrink-0 text-text-muted transition-transform ${collapsed ? '-rotate-90' : ''}`} />
      </button>
      {!collapsed && (
        <div className="px-2 pb-2">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={example ?? '每条一行'}
            spellCheck={false}
            rows={Math.max(2, lines)}
            className="w-full resize-none rounded-card border border-border bg-bg-input px-3 py-2 text-xs leading-relaxed text-text-primary placeholder:text-text-tertiary focus:border-accent/40 focus-ring focus:ring-1 focus:ring-accent/20"
          />
        </div>
      )}
    </div>
  )
}

export default MemoryPanel
