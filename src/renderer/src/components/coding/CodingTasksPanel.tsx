// ── CodingTasksPanel — 右侧「任务」标签页 ─────────────────────────────
// 当前任务规划（todo_write 驱动），从输入框上方移入右侧面板（标签页 3）

import { useMemo } from 'react'
import { ListTodo, Loader2, Users } from 'lucide-react'
import { useStore, type AgentTodo } from '@renderer/store/useStore'
import { TodoListView } from '@renderer/components/panels/TaskListPanel'
import { SubAgentTreeSection, TaskIntentSection } from './SubAgentSections'

const EMPTY_TODOS: AgentTodo[] = []
const EMPTY_MESSAGES: import('@shared/types').ChatMessage[] = []

/** 右侧「任务」标签页 — 任务规划 + 子 Agent 调用链 + 任务意图分析 */
export function CodingTasksPanel(): React.ReactElement {
  const todos = useStore((s) => s.agentTodosByConv[s.currentConversationId ?? ''] ?? EMPTY_TODOS)
  const conversation = useStore((s) => s.conversations.find((c) => c.id === s.currentConversationId) ?? null)
  const messages = conversation?.messages ?? EMPTY_MESSAGES

  const { done, total, inProgress, hasAssignee, progress } = useMemo(() => {
    let d = 0, ip = 0, ha = false
    for (const t of todos) {
      if (t.status === 'completed') d++
      if (t.status === 'in_progress') ip++
      if (t.assignee) ha = true
    }
    return {
      done: d,
      total: todos.length,
      inProgress: ip,
      hasAssignee: ha,
      progress: todos.length > 0 ? Math.round((d / todos.length) * 100) : 0,
    }
  }, [todos])

  return (
    <div className="flex h-full w-full flex-col">
      {/* 头部 — 进度统计 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-2.5">
        <ListTodo size={13} className="shrink-0 text-accent" />
        <span className="text-xs font-medium text-text-secondary">任务规划</span>
        <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-border">
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-accent/60 to-accent transition-all duration-500 ease-out-quart"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[11px] text-text-muted tabular-nums">
          {total > 0 ? `${done}/${total}` : '—'}
        </span>
        {inProgress > 0 && <Loader2 size={11} className="shrink-0 animate-spin text-accent" />}
        {hasAssignee && (
          <span className="ml-auto flex shrink-0 items-center gap-0.5 text-[10px] text-accent/70">
            <Users size={10} />
            子Agent
          </span>
        )}
      </div>

      {/* 任务列表 + 子 Agent 调用链 + 任务意图分析 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 pb-4">
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <ListTodo size={22} className="text-text-muted/40" />
            <p className="text-[11px] text-text-muted">暂无任务规划</p>
            <p className="max-w-[180px] text-[10px] leading-relaxed text-text-muted/60">
              长任务进行中，Agent 会通过 todo_write 规划阶段与子步骤，并在此实时展示进度
            </p>
          </div>
        ) : (
          <TodoListView todos={todos} />
        )}

        {/* 子 Agent 调用链 — 当前调用的子 Agent 与嵌套孙 Agent 结构化卡片 */}
        <SubAgentTreeSection messages={messages} />

        {/* 任务意图分析 — 默认折叠的完整分析链路 */}
        <TaskIntentSection messages={messages} />
      </div>
    </div>
  )
}
