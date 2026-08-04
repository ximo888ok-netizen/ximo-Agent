import type { StateCreator } from 'zustand'
import type { Conversation, Mode } from '@shared/types'
import type { StoreState } from '../types'
import { genId } from '../utils'

export type ProjectSlice = Pick<StoreState,
  | 'openProject'
  | 'setProjectPath'
  | 'newConversationForProject'
  | 'removeProject'
  | 'toggleProjectCollapsed'
>

export const createProjectSlice: StateCreator<StoreState, [], [], ProjectSlice> = (set, get) => ({
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

  openProject: async () => {
    const folder = await window.api.dialog.openFolder()
    if (!folder) return

    const folderName = folder.split(/[/\\]/).pop() || folder
    const state = get()
    const mode: Mode = state.currentMode === 'design' ? 'design' : 'coding'

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
})
