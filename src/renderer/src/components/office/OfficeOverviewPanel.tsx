import { useEffect, useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronDown, Brain, CheckCircle2, Circle, FileText, ListTodo, Loader2, Package } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { ARTIFACT_TOOL_LABELS, collectArtifacts, countMemoryWrites } from '@renderer/lib/session-artifacts'

/**
 * OfficeOverviewPanel — 办公模式右栏默认页
 *
 * 三层：任务待办 / 任务产物（本次会话）/ 意识更新（短期 + 长期记忆）。
 * 三层数据全部来自真实来源，无模拟数据：
 * - 待办 ← agentTodosByConv（Agent 的 todo_write 结果）
 * - 产物 ← 本会话 toolResults 中写盘类工具的实际参数（lib/session-artifacts）
 * - 短期记忆 ← 本会话 memory_update 的成功写入记录；长期记忆 ← 已落盘的模式记忆全文
 */
export function OfficeOverviewPanel(): React.ReactElement {
  const conversation = useStore((s) => s.conversations.find((c) => c.id === s.currentConversationId) ?? null)
  const todos = useStore((s) => s.agentTodosByConv[s.currentConversationId ?? ''] ?? EMPTY_TODOS)
  const setShowMemoryPanel = useStore((s) => s.setShowMemoryPanel)

  const artifacts = useMemo(() => collectArtifacts(conversation?.messages ?? []), [conversation?.messages])
  const memoryWrites = useMemo(() => countMemoryWrites(conversation?.messages ?? []), [conversation?.messages])

  // 长期记忆：读取已落盘的模式记忆全文（真实数据）
  const [longTermLines, setLongTermLines] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    void window.api.memory
      .load('office')
      .then((text) => { if (!cancelled) setLongTermLines(text.trim() ? text.trim().split('\n').length : 0) })
      .catch(() => { if (!cancelled) setLongTermLines(null) })
    return () => { cancelled = true }
  }, [conversation?.id])

  const doneCount = todos.filter((t) => t.status === 'completed').length

  return (
    <div className="flex h-full flex-col overflow-y-auto px-3 py-3">
      {/* ── 任务待办 ── */}
      <Section icon={ListTodo} title="任务待办" count={todos.length > 0 ? `${doneCount}/${todos.length}` : undefined}>
        {todos.length === 0 ? (
          <Hint text="本轮还没有待办" />
        ) : (
          <div className="space-y-0.5">
            {todos.map((todo, i) => (
              <div key={`${i}-${todo.content}`} className="flex items-start gap-2 rounded-card px-2 py-1.5">
                <StatusDot status={todo.status} />
                <span
                  className={`flex-1 text-xs leading-relaxed ${
                    todo.status === 'completed' ? 'text-text-muted line-through' : 'text-text-secondary'
                  }`}
                  style={todo.level ? { paddingLeft: `${Math.min(todo.level, 3) * 8}px` } : undefined}
                >
                  {todo.status === 'in_progress' && todo.activeForm ? todo.activeForm : todo.content}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── 任务产物 ── */}
      <Section icon={Package} title="任务产物" count={artifacts.length > 0 ? String(artifacts.length) : undefined}>
        {artifacts.length === 0 ? (
          <Hint text="本次会话还没有产出文件" />
        ) : (
          <div className="space-y-0.5">
            {artifacts.map((a) => (
              <div key={a.path} className="flex items-center gap-2 rounded-card px-2 py-1.5" title={a.path}>
                <FileText size={13} className="shrink-0 text-text-muted" />
                <span className="flex-1 truncate text-xs text-text-secondary">{a.path.split(/[/\\]/).pop()}</span>
                <span className="shrink-0 rounded-control px-1 py-0.5 text-caption text-text-muted bg-bg-hover">
                  {ARTIFACT_TOOL_LABELS[a.tool] ?? a.tool}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── 意识更新 ── */}
      <Section icon={Brain} title="意识更新">
        <div className="space-y-1.5">
          <Row
            label="短期记忆"
            value={memoryWrites > 0 ? `本次会话更新 ${memoryWrites} 次` : '本次会话未更新'}
            dim={memoryWrites === 0}
          />
          <button
            onClick={() => setShowMemoryPanel(true)}
            className="flex w-full items-center gap-2 rounded-card px-2 py-1.5 text-left transition-colors hover:bg-bg-hover active:scale-[0.97]"
            title="打开记忆面板查看与编辑"
          >
            <span className="flex-1 text-xs text-text-secondary">长期记忆</span>
            <span className="text-xs text-text-muted">
              {longTermLines === null ? '读取失败' : longTermLines > 0 ? `${longTermLines} 行` : '为空'}
            </span>
          </button>
        </div>
      </Section>
    </div>
  )
}

const EMPTY_TODOS: never[] = []

function StatusDot({ status }: { status: 'pending' | 'in_progress' | 'completed' }): React.ReactElement {
  if (status === 'completed') return <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-green-500/80" />
  if (status === 'in_progress') return <Loader2 size={13} className="mt-0.5 shrink-0 animate-spin text-accent" />
  return <Circle size={13} className="mt-0.5 shrink-0 text-text-tertiary" />
}

function Hint({ text }: { text: string }): React.ReactElement {
  return <p className="px-2 py-1.5 text-caption text-text-muted">{text}</p>
}

function Row({ label, value, dim }: { label: string; value: string; dim?: boolean }): React.ReactElement {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <span className="flex-1 text-xs text-text-secondary">{label}</span>
      <span className={`text-xs ${dim ? 'text-text-tertiary' : 'text-text-muted'}`}>{value}</span>
    </div>
  )
}

/** 可折叠分层区块 */
function Section({
  icon: Icon, title, count, children,
}: {
  icon: LucideIcon
  title: string
  count?: string
  children: React.ReactNode
}): React.ReactElement {
  const [open, setOpen] = useState(true)
  return (
    <div className="mb-1.5 rounded-panel border border-border-subtle bg-bg-surface-soft">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-panel px-3 py-2 text-left transition-colors hover:bg-bg-hover active:scale-[0.97]"
      >
        <Icon size={13} className="shrink-0 text-text-muted" />
        <span className="flex-1 text-xs font-medium text-text-secondary">{title}</span>
        {count && <span className="text-caption text-text-muted">{count}</span>}
        <ChevronDown size={13} className={`shrink-0 text-text-muted transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="px-1.5 pb-2">{children}</div>}
    </div>
  )
}
