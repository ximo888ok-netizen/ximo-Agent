/**
 * 数据相关 IPC 处理器 — 设置、会话、技能、MCP、导入技能、记忆、知识库、主题包、剪贴板、对话框
 */

import { ipcMain, dialog, clipboard } from 'electron'
import { join } from 'path'
import type { AppSettings, Conversation, Skill, McpServerConfig, ImportedSkill, Mode } from '@shared/types'
import { loadSettings, saveSettings, loadConversations, saveConversations, loadMemory, saveMemory } from '@main/store'
import { loadSkills, saveSkills, isRecording, getRecordingSession, getRrwebEventCount, startRecording, stopRecording, appendRrwebEvent } from '@main/SkillStore'
import { loadMcpServers, saveMcpServers, parseMcpConfig } from '@main/McpStore'
import { loadImportedSkills, saveImportedSkills, parseSkillMarkdown } from '@main/ImportedSkillStore'
import { invalidateMcpSession } from './chat-handler'
import { addKnowledge, searchKnowledge, listKnowledge, updateKnowledge, deleteKnowledge } from '@main/KnowledgeStore'
import { listThemePacks, importThemePack, deleteThemePack } from '@main/ThemePackStore'
import { importBackground, deleteBackground, listBackgrounds } from '@main/BackgroundStore'
import { pastedImagesDir } from '@main/paths'
import { ensureDirPath } from '@main/ensureDir'

export function registerDataHandlers(): void {
  // ---------- 设置读写 ----------
  ipcMain.handle('settings:load', () => loadSettings())
  ipcMain.handle('settings:save', async (_event, settings: AppSettings) => {
    await saveSettings(settings)
    return true
  })

  // ---------- 对话框 ----------
  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0] ?? null
  })
  ipcMain.handle('dialog:openFile', async (_event, filters?: { name: string; extensions: string[] }[]) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: filters || [{ name: 'All Files', extensions: ['*'] }]
    })
    return result.canceled ? [] : result.filePaths
  })

  // ---------- 剪贴板图片 ----------
  // 保存到 userData/pasted-images — 避免 Windows 8.3 短路径导致工具无法读取
  ipcMain.handle('clipboard:saveImage', async () => {
    const { writeFile } = await import('fs/promises')
    const image = clipboard.readImage()
    if (image.isEmpty()) return null
    await ensureDirPath(pastedImagesDir)
    const filePath = join(pastedImagesDir, `clip_${Date.now()}.png`)
    await writeFile(filePath, image.toPNG())
    return filePath
  })
  // 删除粘贴的临时图片 — 任务结束后用户选择清理时调用
  ipcMain.handle('clipboard:deleteImages', async (_event, paths: string[]) => {
    const { unlink } = await import('fs/promises')
    await Promise.allSettled(paths.map((p: string) => unlink(p)))
    return { success: true }
  })

  // ---------- 会话读写 ----------
  ipcMain.handle('conversations:load', () => loadConversations())
  ipcMain.handle('conversations:save', async (_event, conversations: Conversation[]) => {
    await saveConversations(conversations)
    return true
  })

  // ---------- 技能读写 ----------
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

  // rrweb 事件转发 — 内嵌浏览器 webview 中的 rrweb 事件通过 console.log 回传
  ipcMain.on('skill:append-rrweb-event', (_event, data: Record<string, unknown>) => {
    appendRrwebEvent(data)
  })

  // ---------- 技能录制保存（内嵌浏览器模式） ----------
  ipcMain.handle('skill-recording:save', async (_event, data: {
    name: string
    description: string
    steps: Array<{ tool: string; arguments: Record<string, unknown>; timestamp: number; description?: string }>
    apiEndpoints: string[]
    startUrl?: string
    rrwebEvents?: Record<string, unknown>[]
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
      rrwebEvents: data.rrwebEvents,
      tags: [],
      source: 'recorded',
      startUrl: data.startUrl
    }
    const skills = await loadSkills()
    skills.unshift(skill)
    await saveSkills(skills)
    return { success: true, skill }
  })

  // ---------- MCP 服务器配置读写 ----------
  ipcMain.handle('mcp:load', () => loadMcpServers())
  ipcMain.handle('mcp:save', async (_event, servers: McpServerConfig[]) => {
    await saveMcpServers(servers)
    invalidateMcpSession()
    return true
  })
  ipcMain.handle('mcp:parseConfig', (_event, raw: string) => parseMcpConfig(raw))

  // ---------- 导入技能（SKILL.md 格式）读写 ----------
  ipcMain.handle('imported-skills:load', () => loadImportedSkills())
  ipcMain.handle('imported-skills:save', async (_event, skills: ImportedSkill[]) => {
    await saveImportedSkills(skills)
    return true
  })
  ipcMain.handle('imported-skills:parseMarkdown', (_event, raw: string) => parseSkillMarkdown(raw))

  // ---------- 模式记忆读写 ----------
  ipcMain.handle('memory:load', async (_event, mode: Mode) => loadMemory(mode))
  ipcMain.handle('memory:save', async (_event, mode: Mode, content: string) => {
    await saveMemory(mode, content)
    return true
  })

  // ---------- 知识库（Orama BM25） ----------
  ipcMain.handle('knowledge:list', async (_event, mode: Mode, page: number, pageSize: number) => {
    return listKnowledge(mode, page, pageSize)
  })
  ipcMain.handle('knowledge:search', async (_event, mode: Mode, query: string, page: number, pageSize: number) => {
    return searchKnowledge(mode, query, page, pageSize)
  })
  ipcMain.handle('knowledge:add', async (_event, mode: Mode, data: { title: string; content: string; tags?: string[]; source?: string }) => {
    return addKnowledge(mode, data)
  })
  ipcMain.handle('knowledge:update', async (_event, mode: Mode, id: string, updates: { title?: string; content?: string; tags?: string[]; source?: string }) => {
    return updateKnowledge(mode, id, updates)
  })
  ipcMain.handle('knowledge:delete', async (_event, mode: Mode, id: string) => {
    return deleteKnowledge(mode, id)
  })

  // ---------- 主题包（自定义 UI 主题） ----------
  ipcMain.handle('theme-pack:list', async () => listThemePacks())
  ipcMain.handle('theme-pack:import', async (_event, jsonStr: string) => importThemePack(jsonStr))
  ipcMain.handle('theme-pack:delete', async (_event, id: string) => deleteThemePack(id))

  // ---------- 背景图 ----------
  ipcMain.handle('background:import', async (_event, srcPath: string) => importBackground(srcPath))
  ipcMain.handle('background:delete', async (_event, filePath: string) => deleteBackground(filePath))
  ipcMain.handle('background:list', async () => listBackgrounds())
  ipcMain.handle('background:select', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择背景图',
      properties: ['openFile'],
      filters: [
        { name: '图片和视频', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'mp4', 'webm', 'mov', 'avi', 'mkv'] },
        { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'] },
        { name: '视频', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    })
    if (result.canceled || !result.filePaths.length) return null
    return importBackground(result.filePaths[0])
  })
}
