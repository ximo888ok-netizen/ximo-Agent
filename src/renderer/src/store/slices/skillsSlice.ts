import type { StateCreator } from 'zustand'
import type { Skill, RecordingSession } from '@shared/types'
import type { StoreState } from '@renderer/store/types'

export type SkillsSlice = Pick<StoreState,
  | 'skills'
  | 'isRecordingSkill'
  | 'recordingSession'
  | 'loadSkills'
  | 'startRecordingSkill'
  | 'stopRecordingSkill'
  | 'refreshRecordingStatus'
  | 'deleteSkill'
>

export const createSkillsSlice: StateCreator<StoreState, [], [], SkillsSlice> = (set, get) => ({
  skills: [] as Skill[],
  isRecordingSkill: false,
  recordingSession: null as RecordingSession | null,

  loadSkills: async () => {
    try {
      const loaded = await window.api.skills.load()
      set({ skills: loaded })
    } catch { /* ignore */ }
  },

  startRecordingSkill: async (url?: string) => {
    try {
      const session = await window.api.skills.startRecording(url)
      set({ isRecordingSkill: true, recordingSession: session })
    } catch { /* ignore */ }
  },

  stopRecordingSkill: async () => {
    try {
      await window.api.skills.stopRecording()
      set({ isRecordingSkill: false, recordingSession: null })
      // 停止录制后刷新技能列表
      await get().loadSkills()
    } catch { /* ignore */ }
  },

  refreshRecordingStatus: async () => {
    try {
      const status = await window.api.skills.recordingStatus()
      set({ isRecordingSkill: status.isRecording, recordingSession: status.session })
    } catch { /* ignore */ }
  },

  deleteSkill: async (id: string) => {
    const updated = get().skills.filter(s => s.id !== id)
    set({ skills: updated })
    await window.api.skills.save(updated)
  },
})
