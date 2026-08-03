import type { StateCreator } from 'zustand'
import type { StoreState, AgentTodo } from '@renderer/store/types'

export type AgentSlice = Pick<StoreState,
  | 'showAgentPanel'
  | 'showMemoryPanel'
  | 'showKnowledgePanel'
  | 'activeExperts'
  | 'agentTodosByConv'
  | 'taskListCollapsedByConv'
  | 'showTokenStats'
  | 'pendingDraft'
  | 'setShowAgentPanel'
  | 'setShowMemoryPanel'
  | 'setShowKnowledgePanel'
  | 'toggleExpert'
  | 'toggleTaskListCollapsed'
  | 'restoreAgentTodos'
  | 'markTodosComplete'
  | 'editMessage'
  | 'clearDraft'
  | 'setShowTokenStats'
>

export const createAgentSlice: StateCreator<StoreState, [], [], AgentSlice> = (set, get) => ({
  showAgentPanel: false,
  showMemoryPanel: false,
  showKnowledgePanel: false,
  activeExperts: [],
  agentTodosByConv: {},
  taskListCollapsedByConv: {},
  showTokenStats: false,
  pendingDraft: null,

  setShowAgentPanel: (show) => set({ showAgentPanel: show }),

  setShowMemoryPanel: (show) => set({ showMemoryPanel: show }),

  setShowKnowledgePanel: (show) => set({ showKnowledgePanel: show }),

  toggleExpert: (expertId) => set((s) => ({
    activeExperts: s.activeExperts.includes(expertId)
      ? s.activeExperts.filter(id => id !== expertId)
      : [...s.activeExperts, expertId]
  })),

  toggleTaskListCollapsed: () => {
    const convId = get().currentConversationId
    if (!convId) return
    set((s) => ({
      taskListCollapsedByConv: {
        ...s.taskListCollapsedByConv,
        [convId]: !s.taskListCollapsedByConv[convId]
      }
    }))
  },

  restoreAgentTodos: () => {
    const conv = get().getCurrentConversation()
    const convId = get().currentConversationId
    if (!conv || !convId) return
    // 从最新到最旧扫描 assistant 消息的 toolResults，找到最后一次 todo_write 的结果
    for (let i = conv.messages.length - 1; i >= 0; i--) {
      const msg = conv.messages[i]
      if (msg.role !== 'assistant' || !msg.toolResults) continue
      for (let j = msg.toolResults.length - 1; j >= 0; j--) {
        const result = msg.toolResults[j]
        const todos = result.metadata?.todos
        if (result.toolName === 'todo_write' && todos) {
          set((s) => ({ agentTodosByConv: { ...s.agentTodosByConv, [convId]: todos as AgentTodo[] } }))
          return
        }
      }
    }
    // 没找到 — 清除该会话的旧任务，避免残留其他会话的数据
    set((s) => {
      if (!(convId in s.agentTodosByConv)) return {}
      const next = { ...s.agentTodosByConv }
      delete next[convId]
      return { agentTodosByConv: next }
    })
  },

  markTodosComplete: () => {
    const convId = get().currentConversationId
    if (!convId) return
    const todos = get().agentTodosByConv[convId]
    if (!todos || todos.length === 0) return
    // 只在有未完成项时才更新，避免无意义的 setState
    if (todos.every((t) => t.status === 'completed')) return
    set((s) => ({
      agentTodosByConv: {
        ...s.agentTodosByConv,
        [convId]: s.agentTodosByConv[convId].map((t) =>
          t.status === 'completed' ? t : { ...t, status: 'completed' as const }
        )
      }
    }))
  },

  editMessage: (messageId) => {
    const state = get()
    const conv = state.getCurrentConversation()
    if (!conv) return
    const msgIndex = conv.messages.findIndex((m) => m.id === messageId)
    if (msgIndex === -1) return
    const msg = conv.messages[msgIndex]
    if (msg.role !== 'user') return
    const remaining = conv.messages.slice(0, msgIndex)
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conv.id
          ? { ...c, messages: remaining, updatedAt: Date.now() }
          : c
      ),
      pendingDraft: { text: msg.content, slashCommand: msg.slashCommand }
    }))
    get().restoreAgentTodos()
    void get()._persist()
  },

  clearDraft: () => set({ pendingDraft: null }),

  setShowTokenStats: (show) => set({ showTokenStats: show }),
})
