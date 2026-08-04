import { ipcMain } from 'electron'
import type { Skill, McpServerConfig, ImportedSkill } from '@shared/types'
import { loadSkills, saveSkills, startRecording, stopRecording, isRecording, getRecordingSession, getRrwebEventCount } from '../SkillStore'
import { loadMcpServers, saveMcpServers, parseMcpConfig } from '../McpStore'
import { loadImportedSkills, saveImportedSkills, parseSkillMarkdown } from '../ImportedSkillStore'

/** 注册技能、MCP、导入技能相关 IPC handler */
export function registerSkillHandlers(): void {
  // 技能读写
  ipcMain.handle('skills:load', () => loadSkills())
  ipcMain.handle('skills:save', async (_event, skills: Skill[]) => {
    await saveSkills(skills)
    return true
  })
  ipcMain.handle('skills:recordingStatus', () => ({
    isRecording: isRecording(),
    session: getRecordingSession(),
    rrwebEventCount: getRrwebEventCount()
  }))
  ipcMain.handle('skills:startRecording', (_event, url?: string) => startRecording(url))
  ipcMain.handle('skills:stopRecording', () => stopRecording())

  // MCP 服务器配置读写
  ipcMain.handle('mcp:load', () => loadMcpServers())
  ipcMain.handle('mcp:save', async (_event, servers: McpServerConfig[]) => {
    await saveMcpServers(servers)
    return true
  })
  ipcMain.handle('mcp:parseConfig', (_event, raw: string) => parseMcpConfig(raw))

  // 导入技能（SKILL.md 格式）读写
  ipcMain.handle('imported-skills:load', () => loadImportedSkills())
  ipcMain.handle('imported-skills:save', async (_event, skills: ImportedSkill[]) => {
    await saveImportedSkills(skills)
    return true
  })
  ipcMain.handle('imported-skills:parseMarkdown', (_event, raw: string) => parseSkillMarkdown(raw))

  // 技能录制保存（内嵌浏览器模式）
  ipcMain.handle('skill-recording:save', async (_event, data: {
    name: string
    description: string
    steps: Array<{ tool: string; arguments: Record<string, unknown>; timestamp: number; description?: string }>
    apiEndpoints: string[]
    startUrl?: string
  }) => {
    const skill: Skill = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name: data.name,
      description: data.description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      invokeCount: 0,
      steps: data.steps,
      apiEndpoints: data.apiEndpoints,
      tags: [],
      source: 'recorded',
      startUrl: data.startUrl
    }

    const skills = await loadSkills()
    skills.unshift(skill)
    await saveSkills(skills)

    return { success: true, skill }
  })
}
