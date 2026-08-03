import { memo, useMemo } from 'react'
import { ChevronDown, Check, Loader2, Circle, Users } from 'lucide-react'
import { useStore, type AgentTodo } from '@renderer/store/useStore'

/** 稳定的空数组引用 — 避免 Zustand 选择器每次返回新 [] 导致无限重渲染 */
const EMPTY_TODOS: AgentTodo[] = []

/**
 * TaskListPanel — Agent 任务列表面板
 * 可折叠，显示在输入框上方。
 * 由 todo_write 工具结果驱动，每个会话独立维护任务列表。
 */
export const TaskListPanel = memo(function TaskListPanel(): React.ReactElement | null {
  // 精确选择当前会话的 todos — 仅在对应会话的 todos 变化时重渲染
  const todos = useStore((s) => s.agentTodosByConv[s.currentConversationId ?? ''] ?? EMPTY_TODOS)
  const collapsed = useStore((s) => s.taskListCollapsedByConv[s.currentConversationId ?? ''] ?? false)
  const toggleCollapsed = useStore((s) => s.toggleTaskListCollapsed)

  const { done, total, inProgress, hasAssignee, inProgressTodo } = useMemo(() => {
    let d = 0, ip = 0, ha = false
    let active: AgentTodo | null = null
    for (const t of todos) {
      if (t.status === 'completed') d++
      if (t.status === 'in_progress') { ip++; active = t }
      if (t.assignee) ha = true
    }
    return { done: d, total: todos.length, inProgress: ip, hasAssignee: ha, inProgressTodo: active }
  }, [todos])

  if (total === 0) return null

  const progress = total > 0 ? Math.round((done / total) * 100) : 0
  const activeText = inProgressTodo?.activeForm || inProgressTodo?.content || ''

  return (
    <div className="mx-auto max-w-4xl px-4">
      <div className="mb-1.5 overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated/60 backdrop-blur-md transition-all duration-300 ease-out-quart animate-fade-scale">
        {/* 折叠头部条 */}
        <button
          onClick={toggleCollapsed}
          className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-bg-hover/30"
        >
          <ChevronDown
            size={14}
            className={`shrink-0 text-text-muted transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
          />
          <span className="text-xs font-medium text-text-secondary">任务规划</span>
          {/* 进度条 */}
          <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-border">
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-accent/60 to-accent transition-all duration-500 ease-out-quart"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[11px] text-text-muted tabular-nums">
            {done}/{total}
          </span>
          {inProgress > 0 && (
            <Loader2 size={11} className="shrink-0 animate-spin text-accent" />
          )}
          {hasAssignee && (
            <span className="flex items-center gap-0.5 text-[10px] text-accent/70">
              <Users size={10} />
              子Agent
            </span>
          )}
          {/* 展开时显示当前进行中的任务 */}
          {!collapsed && activeText && (
            <span className="ml-auto truncate text-[11px] text-accent">
              {activeText}
            </span>
          )}
          {collapsed && (
            <span className="ml-auto truncate text-[11px] text-text-muted">
              {activeText || (progress === 100 ? '全部完成' : `${progress}%`)}
            </span>
          )}
        </button>

        {/* 展开内容 */}
        {!collapsed && (
          <div className="border-t border-border-subtle/50 px-3 py-2 space-y-0.5 animate-fade-in">
            <TodoListView todos={todos} />
          </div>
        )}
      </div>
    </div>
  )
})

/** 递归渲染 todo 列表 — 支持两级嵌套 */
const TodoListView = memo(function TodoListView({ todos }: { todos: AgentTodo[] }): React.ReactElement {
  // 一次遍历分离平铺项和阶段+子步骤
  const { flat, phases } = useMemo(() => {
    const flat: AgentTodo[] = []
    const phases: Array<{ phase: AgentTodo; subSteps: AgentTodo[] }> = []
    let currentPhase: { phase: AgentTodo; subSteps: AgentTodo[] } | null = null

    for (const t of todos) {
      if (t.level === 0) {
        currentPhase = { phase: t, subSteps: [] }
        phases.push(currentPhase)
      } else if (t.level === 1 && currentPhase) {
        currentPhase.subSteps.push(t)
      } else {
        // 无 level 的平铺项
        flat.push(t)
        currentPhase = null
      }
    }
    return { flat, phases }
  }, [todos])

  return (
    <>
      {/* 平铺任务 */}
      {flat.map((todo, i) => (
        <TodoRow key={`flat-${i}`} todo={todo} />
      ))}

      {/* 分阶段任务 */}
      {phases.map((p, phaseIdx) => (
        <div key={`phase-${phaseIdx}`} className="py-0.5">
          <TodoRow todo={p.phase} isPhase />
          {p.subSteps.length > 0 && (
            <div className="ml-3 border-l border-border-subtle/40 pl-2 space-y-0.5">
              {p.subSteps.map((sub, i) => (
                <TodoRow key={`sub-${phaseIdx}-${i}`} todo={sub} />
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  )
})

/** 单个任务行 */
const TodoRow = memo(function TodoRow({ todo, isPhase = false }: { todo: AgentTodo; isPhase?: boolean }): React.ReactElement {
  const icon = todo.status === 'completed'
    ? <Check size={12} className="text-green-400" />
    : todo.status === 'in_progress'
      ? <Loader2 size={12} className="animate-spin text-accent" />
      : <Circle size={10} className="text-text-muted/50" />

  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors ${
        todo.status === 'in_progress' ? 'bg-accent/5' : ''
      } ${isPhase ? 'mt-1' : ''}`}
    >
      <span className="shrink-0">{icon}</span>
      <span
        className={`text-xs ${
          todo.status === 'completed'
            ? 'text-text-muted line-through'
            : todo.status === 'in_progress'
              ? 'text-text-primary font-medium'
              : 'text-text-secondary'
        } ${isPhase ? 'font-semibold' : ''}`}
      >
        {todo.status === 'in_progress' && todo.activeForm
          ? todo.activeForm
          : todo.content}
      </span>
      {todo.assignee && (
        <span className="ml-auto flex shrink-0 items-center gap-0.5 rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent/80">
          <Users size={9} />
          {todo.assignee}
        </span>
      )}
    </div>
  )
})
