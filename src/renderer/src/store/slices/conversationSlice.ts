import type { StateCreator } from 'zustand'
import type { Conversation, Mode } from '@shared/types'
import type { StoreState } from '../types'
import { genId } from '../utils'

export type ConversationSlice = Pick<StoreState,
  | '_persist'
  | 'init'
  | 'newConversation'
  | 'selectConversation'
  | 'deleteConversation'
  | 'renameConversation'
  | 'clearAllConversations'
  | 'reloadConversations'
  | 'getCurrentConversation'
>

export const createConversationSlice: StateCreator<StoreState, [], [], ConversationSlice> = (set, get) => ({
  _persist: async () => {
    await window.api.conversations.save(get().conversations)
  },

  init: async () => {
    const [settings, conversations] = await Promise.all([
      window.api.settings.load(),
      window.api.conversations.load()
    ])
    // 为每个模式找到最近的会话作为默认选中
    const currentConversationIds: Record<Mode, string | null> = { office: null, coding: null, design: null }
    for (const mode of ['office', 'coding', 'design'] as Mode[]) {
      const latest = conversations
        .filter((c) => c.mode === mode)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0]
      if (latest) currentConversationIds[mode] = latest.id
    }
    const currentConversationId = currentConversationIds.office
    const currentConv = conversations.find((c) => c.id === currentConversationId) ?? null
    set({
      settings,
      conversations,
      currentConversationIds,
      currentConversationId,
      projectPath: currentConv?.projectPath || '',
      autoModeLevel: settings.defaultAutoModeLevel ?? 'off',
      networkSearchOn: settings.defaultNetworkSearchOn ?? false
    })
  },

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
    const remaining = get().conversations.filter((c) => c.id !== id)
    const state = get()
    const ids = { ...state.currentConversationIds }
    for (const mode of Object.keys(ids) as Mode[]) {
      if (ids[mode] === id) ids[mode] = null
    }
    const nextTodos = { ...state.agentTodosByConv }
    delete nextTodos[id]
    set({
      conversations: remaining,
      currentConversationId: state.currentConversationId === id ? null : state.currentConversationId,
      currentConversationIds: ids,
      agentTodosByConv: nextTodos
    })
    void get()._persist()
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

  getCurrentConversation: () => {
    const { conversations, currentConversationId } = get()
    return conversations.find((c) => c.id === currentConversationId) ?? null
  },
})
