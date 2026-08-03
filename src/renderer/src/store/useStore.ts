import { create } from 'zustand'
import type {
  AppSettings,
  ChatMessage,
  Conversation,
  Mode,
  Skill,
  RecordingSession,
  ReasoningEffort,
  CapturedRequest,
  StreamingSegment,
} from '@shared/types'
import { runStream, cancelStream } from './runStream'
import { buildUserMessage } from './buildUserMessage'
import { genId, makeTitle } from './store-utils'
import { createDesignSlice } from './slices/designSlice'
import { createBrowserSlice } from './slices/browserSlice'
import { createSkillsSlice } from './slices/skillsSlice'
import { createAgentSlice } from './slices/agentSlice'

// StoreState 统一由 ./types 定义，此处 re-export 保持向后兼容
export type { StoreState, AgentTodo, CanvasItem, StreamingToolCall, ComponentMeta } from './types'
import type { StoreState } from './types'

export const useStore = create<StoreState>()((...args) => {
  const [set, get] = args
  return {
  // ---- Slices ----
  ...createDesignSlice(...args),
  ...createBrowserSlice(...args),
  ...createSkillsSlice(...args),
  ...createAgentSlice(...args),

  // ---- 核心状态 ----
  settings: null,
  conversations: [],
  currentMode: 'office',
  currentConversationId: null,
  currentConversationIds: { office: null, coding: null, design: null },
  isStreaming: false,
  streamingContent: '',
  streamingReasoning: '',
  streamingSegments: [],
  streamingConversationId: null,
  streamingTokens: null,
  streamingCacheHitTokens: null,
  streamingCacheMissTokens: null,
  streamingPromptTokens: null,
  streamingContextTokens: null,
  streamingToolCalls: [],
  streamingAssistantId: null,
  showSettings: false,
  error: null,
  networkSearchOn: false,
  autoModeLevel: 'off',
  projectPath: '',
  attachedFiles: [],
  pastedImagePaths: [],
  collapsedProjects: {},

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

  updateSettings: async (partial) => {
    const current = get().settings
    if (!current) return
    const updated = { ...current, ...partial }
    await window.api.settings.save(updated)
    set({ settings: updated })
  },

  setShowSettings: (show) => set({ showSettings: show }),

  setMode: (mode) => {
    const ids = get().currentConversationIds
    const convId = ids[mode] ?? null
    const conv = convId ? get().conversations.find((c) => c.id === convId) : null
    set({
      currentMode: mode,
      currentConversationId: convId,
      projectPath: conv?.projectPath || '',
      error: null
    })
    get().restoreAgentTodos()
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

  sendMessage: async (text, options) => {
    const state = get()
    if (state.isStreaming) return
    if (!text.trim()) return

    // 消息构建 — 联网搜索提示、附加文件、组件选择、@file 引用
    const { text: processedText, clearAttachedFiles, clearSelectedComponents } = await buildUserMessage({
      text,
      networkSearchOn: state.networkSearchOn,
      skipNetworkHint: options?.skipNetworkHint,
      attachedFiles: state.attachedFiles,
      selectedComponentIds: state.selectedComponentIds,
      currentMode: state.currentMode,
      projectPath: state.projectPath
    })
    const trimmed = processedText
    if (!trimmed) return
    if (clearAttachedFiles) get().clearAttachedFiles()
    if (clearSelectedComponents) get().clearSelectedComponents()

    // 确保有当前会话
    let conversationId = state.currentConversationId
    let conversation = state.getCurrentConversation()
    if (!conversation) {
      conversationId = get().newConversation()
      conversation = get().conversations.find((c) => c.id === conversationId) ?? null
    }
    if (!conversation || !conversationId) {
      return
    }

    const settings = state.settings
    if (!settings) return

    // 前端预检 API Key，避免空 Key 导致请求卡死
    if (!settings.apiKey.trim()) {
      set({ error: '请先在设置中配置 API Key 后再发送消息。', isStreaming: false })
      return
    }

    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
      ...(options?.slashCommand ? { slashCommand: options.slashCommand } : {})
    }

    const isFirst = conversation.messages.length === 0
    const assistantMsgId = genId()
    const placeholderMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    }
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              title: isFirst ? makeTitle(trimmed) : c.title,
              messages: [...c.messages, userMsg, placeholderMsg],
              updatedAt: Date.now()
            }
          : c
      ),
      isStreaming: true,
      streamingContent: '',
      streamingReasoning: '',
      streamingSegments: [{ reasoning: '', content: '', toolCalls: [] }],
      streamingConversationId: conversationId,
      streamingAssistantId: assistantMsgId,
      streamingTokens: null,
      streamingCacheHitTokens: null,
      streamingCacheMissTokens: null,
      streamingPromptTokens: null,
      streamingContextTokens: null,
      error: null
    }))

    await runStream(get, set, conversationId)
  },

  regenerate: async () => {
    const state = get()
    if (state.isStreaming) return
    const conversation = state.getCurrentConversation()
    if (!conversation || conversation.messages.length === 0) return

    const msgs = [...conversation.messages]
    while (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
      msgs.pop()
    }
    if (msgs.length === 0) return

    const assistantMsgId = genId()
    const placeholderMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    }

    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversation.id ? { ...c, messages: [...msgs, placeholderMsg], updatedAt: Date.now() } : c
      ),
      isStreaming: true,
      streamingContent: '',
      streamingReasoning: '',
      streamingSegments: [{ reasoning: '', content: '', toolCalls: [] }],
      streamingConversationId: conversation.id,
      streamingAssistantId: assistantMsgId,
      streamingTokens: null,
      streamingCacheHitTokens: null,
      streamingCacheMissTokens: null,
      streamingPromptTokens: null,
      streamingContextTokens: null,
      error: null
    }))

    await runStream(get, set, conversation.id)
  },

  cancelStream: async () => { await cancelStream(get, set) },

  getCurrentConversation: () => {
    const { conversations, currentConversationId } = get()
    return conversations.find((c) => c.id === currentConversationId) ?? null
  },

  setNetworkSearchOn: (on) => set({ networkSearchOn: on }),
  setAutoModeLevel: (level) => {
    set({ autoModeLevel: level })
    const settings = get().settings
    if (settings && settings.defaultAutoModeLevel !== level) {
      void get().updateSettings({ defaultAutoModeLevel: level, yoloMode: level === 'yolo' })
    }
  },
  setProjectPath: (path) => {
    set({ projectPath: path })
    const convId = get().currentConversationId
    if (convId) {
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === convId ? { ...c, projectPath: path || undefined, updatedAt: Date.now() } : c
        )
      }))
      void get()._persist()
    }
  },
  addAttachedFile: (path) => set((s) => ({
    attachedFiles: s.attachedFiles.includes(path) ? s.attachedFiles : [...s.attachedFiles, path]
  })),
  removeAttachedFile: (path) => set((s) => ({
    attachedFiles: s.attachedFiles.filter((f) => f !== path)
  })),
  clearAttachedFiles: () => set({ attachedFiles: [] }),
  addPastedImage: (path) => set((s) => ({
    pastedImagePaths: s.pastedImagePaths.includes(path) ? s.pastedImagePaths : [...s.pastedImagePaths, path]
  })),
  clearPastedImages: () => set({ pastedImagePaths: [] }),
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

  openProject: async () => {
    const folder = await window.api.dialog.openFolder()
    if (!folder) return

    const folderName = folder.split(/[/\\]/).pop() || folder
    const state = get()
    const mode = state.currentMode === 'design' ? 'design' : 'coding'

    set({ projectPath: folder, currentMode: mode })

    const currentRecent = state.settings?.recentProjects ?? []
    const updatedRecent = [folder, ...currentRecent.filter((p) => p !== folder)].slice(0, 10)
    void get().updateSettings({ recentProjects: updatedRecent })

    const conversationId = state.currentConversationId
    const currentConv = state.getCurrentConversation()

    if (currentConv && currentConv.mode === mode && currentConv.messages.length === 0) {
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === conversationId
            ? { ...c, projectPath: folder, title: folderName, mode, updatedAt: Date.now() }
            : c
        )
      }))
    } else {
      const id = genId()
      const conversation: Conversation = {
        id,
        title: folderName,
        mode,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        projectPath: folder
      }
      set((s) => ({
        conversations: [conversation, ...s.conversations],
        currentConversationId: id,
        currentConversationIds: { ...s.currentConversationIds, [mode]: id },
        currentMode: mode,
        error: null
      }))
    }

    void get()._persist()
  },

  toggleProjectCollapsed: (projectPath) => {
    set((s) => ({
      collapsedProjects: {
        ...s.collapsedProjects,
        [projectPath]: !s.collapsedProjects[projectPath]
      }
    }))
  },

  newConversationForProject: (projectPath, mode) => {
    const useMode = mode ?? get().currentMode
    if (!projectPath) return null
    const folderName = projectPath.split(/[/\\]/).pop() || projectPath
    const id = genId()
    const conversation: Conversation = {
      id,
      title: '新对话',
      mode: useMode,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      projectPath
    }
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      currentConversationId: id,
      currentConversationIds: { ...state.currentConversationIds, [useMode]: id },
      currentMode: useMode,
      projectPath,
      error: null
    }))
    void get()._persist()
    return id
  },

  removeProject: (projectPath) => {
    const state = get()
    const remaining = state.conversations.filter((c) => c.projectPath !== projectPath)
    const removedIds = state.conversations.filter((c) => c.projectPath === projectPath).map((c) => c.id)
    const ids = { ...state.currentConversationIds }
    for (const mode of Object.keys(ids) as Mode[]) {
      if (ids[mode] && removedIds.includes(ids[mode]!)) ids[mode] = null
    }
    const currentRecent = state.settings?.recentProjects ?? []
    const updatedRecent = currentRecent.filter((p) => p !== projectPath)
    void get().updateSettings({ recentProjects: updatedRecent })
    set({
      conversations: remaining,
      currentConversationId: removedIds.includes(state.currentConversationId ?? '') ? null : state.currentConversationId,
      currentConversationIds: ids,
      projectPath: removedIds.includes(state.currentConversationId ?? '') ? '' : state.projectPath
    })
    void get()._persist()
  },
}
})
