import { create } from 'zustand'
import type { Mode } from '@shared/types'
import type {
  StoreState, AgentTodo, CanvasItem, StreamingToolCall, ComponentMeta,
} from './types'
import { createDesignSlice } from './slices/designSlice'
import { createBrowserSlice } from './slices/browserSlice'
import { createSkillsSlice } from './slices/skillsSlice'
import { createAgentSlice } from './slices/agentSlice'
import { createConversationSlice } from './slices/conversationSlice'
import { createProjectSlice } from './slices/projectSlice'
import { createChatSlice } from './slices/chatSlice'

// StoreState 统一由 ./types 定义，此处 re-export 保持向后兼容
export type { StoreState, AgentTodo, CanvasItem, StreamingToolCall, ComponentMeta, ChatMessage } from './types'

export const useStore = create<StoreState>()((...args) => {
  const [set, get] = args
  return {
  // ---- Slices ----
  ...createConversationSlice(...args),
  ...createProjectSlice(...args),
  ...createChatSlice(...args),
  ...createDesignSlice(...args),
  ...createBrowserSlice(...args),
  ...createSkillsSlice(...args),
  ...createAgentSlice(...args),

  // ---- 核心状态 ----
  settings: null,
  currentMode: 'office',
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
  attachedFiles: [],
  pastedImagePaths: [],

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

    // 启动恢复 — 从 settings 中恢复上次使用的模式与会话
    const lastMode = (settings.lastMode && ['office', 'coding', 'design'].includes(settings.lastMode))
      ? settings.lastMode as Mode
      : 'office'
    const restoreConvId = settings.lastConversationId
      && conversations.find((c) => c.id === settings.lastConversationId)
      ? settings.lastConversationId
      : currentConversationIds[lastMode]

    const currentConversationId = restoreConvId ?? currentConversationIds.office
    const currentConv = conversations.find((c) => c.id === currentConversationId) ?? null
    set({
      settings,
      conversations,
      currentMode: lastMode,
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
    // 流式传输中切换模式 — 先取消当前流，避免 isStreaming=true 卡住新模式
    if (get().isStreaming) void get().cancelStream()
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
    // 持久化模式切换 — 下次启动恢复
    void get().updateSettings({ lastMode: mode, lastConversationId: convId ?? undefined })
  },

  setNetworkSearchOn: (on) => set({ networkSearchOn: on }),

  setLongTask: (flag) => {
    const convId = get().currentConversationId
    if (!convId) return
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === convId ? { ...c, longTask: flag, updatedAt: Date.now() } : c
      ),
      // 长任务开启时自动展开任务列表面板，实时展示阶段进度
      taskListCollapsedByConv: flag
        ? { ...s.taskListCollapsedByConv, [convId]: false }
        : s.taskListCollapsedByConv
    }))
    void get()._persist()
  },

  setAutoModeLevel: (level) => {
    set({ autoModeLevel: level })
    const settings = get().settings
    if (settings && settings.defaultAutoModeLevel !== level) {
      void get().updateSettings({ defaultAutoModeLevel: level, yoloMode: level === 'yolo' })
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
  }
})
