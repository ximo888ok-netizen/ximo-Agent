import type { StateCreator } from 'zustand'
import type { Conversation, Mode } from '@shared/types'
import type { StoreState } from '@renderer/store/types'
import { genId, makeTitle } from '../store-utils'

export type ConversationSlice = Pick<StoreState,
  | 'conversations'
  | 'currentConversationId'
  | 'currentConversationIds'
  | 'newConversation'
  | 'selectConversation'
  | 'deleteConversation'
  | 'renameConversation'
  | 'clearAllConversations'
  | 'getCurrentConversation'
  | 'reloadConversations'
>

export const createConversationSlice: StateCreator<StoreState, [], [], ConversationSlice> = (set, get) => ({
  conversations: [],
  currentConversationId: null,
  currentConversationIds: { office: null, coding: null, design: null },

  newConversation: (mode) => {
    const useMode = mode ?? get().currentMode
    const id = genId()
    const currentProjectPath = get().projectPath
    const conversation: Conversation = {
      id,
      title: '新对话',
      mode: useMode,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      projectPath: (useMode === 'coding' || useMode === 'design') && currentProjectPath ? currentProjectPath : undefined
    }
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      currentConversationId: id,
      currentConversationIds: { ...state.currentConversationIds, [useMode]: id },
      currentMode: useMode,
      error: null
    }))
    void get()._persist()
    return id
  },

  selectConversation: (id) => {
    // 流式传输中切换到不同会话 — 先取消当前流，避免 isStreaming=true 卡住新会话
    if (get().isStreaming && get().currentConversationId !== id) void get().cancelStream()
    const conv = get().conversations.find((c) => c.id === id)
    if (conv) {
      set({
        currentConversationId: id,
        currentConversationIds: { ...get().currentConversationIds, [conv.mode]: id },
        currentMode: conv.mode,
        projectPath: conv.projectPath || '',
        error: null
      })
      get().restoreAgentTodos()
    }
  },

  deleteConversation: (id) => {
    const state = get()
    const remaining = state.conversations.filter((c) => c.id !== id)
    const ids = { ...state.currentConversationIds }
    const deletedConv = state.conversations.find((c) => c.id === id)
    let nextConvId = state.currentConversationId
    let nextProjectPath = state.projectPath

    for (const mode of Object.keys(ids) as Mode[]) {
      if (ids[mode] === id) {
        // 删除的是当前模式的活跃会话 — 找同模式最近的会话回退
        const fallback = remaining
          .filter((c) => c.mode === mode)
          .sort((a, b) => b.updatedAt - a.updatedAt)[0]
        ids[mode] = fallback?.id ?? null
        // 如果删除的是当前选中的会话，切换到回退会话
        if (state.currentConversationId === id) {
          nextConvId = fallback?.id ?? null
          nextProjectPath = fallback?.projectPath || ''
        }
      }
    }

    const nextTodos = { ...state.agentTodosByConv }
    delete nextTodos[id]
    set({
      conversations: remaining,
      currentConversationId: nextConvId,
      currentConversationIds: ids,
      projectPath: nextProjectPath,
      agentTodosByConv: nextTodos
    })
    void get()._persist()
    // 持久化回退的会话 ID — 下次启动恢复
    if (deletedConv) {
      void get().updateSettings({ lastConversationId: nextConvId ?? undefined })
    }
  },

  renameConversation: (id, title) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, title, updatedAt: Date.now() } : c
      )
    }))
    void get()._persist()
  },

  clearAllConversations: () => {
    set({
      conversations: [],
      currentConversationId: null,
      currentConversationIds: { office: null, coding: null, design: null }
    })
    void get()._persist()
  },

  getCurrentConversation: () => {
    const { conversations, currentConversationId } = get()
    return conversations.find((c) => c.id === currentConversationId) ?? null
  },

  reloadConversations: async () => {
    const conversations = await window.api.conversations.load()
    const oldIds = get().currentConversationIds
    const currentConversationIds: Record<Mode, string | null> = {
      office: oldIds.office && conversations.find((c) => c.id === oldIds.office) ? oldIds.office : null,
      coding: oldIds.coding && conversations.find((c) => c.id === oldIds.coding) ? oldIds.coding : null,
      design: oldIds.design && conversations.find((c) => c.id === oldIds.design) ? oldIds.design : null
    }
    const convId = get().currentConversationId
    const currentConv = conversations.find((c) => c.id === convId)
    set({
      conversations,
      currentConversationIds,
      currentConversationId: currentConv ? convId : null,
      projectPath: currentConv?.projectPath || ''
    })
  },
})
