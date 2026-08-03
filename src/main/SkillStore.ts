import { readFile, writeFile } from 'fs/promises'
import type { Skill, RecordingSession } from '@shared/types'
import { skillsFile } from './paths'
import { ensureDir } from './ensureDir'

// ---------- 技能持久化 ----------

export async function loadSkills(): Promise<Skill[]> {
  try {
    await ensureDir()
    const raw = await readFile(skillsFile, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    console.error('加载技能失败：', e)
  }
  return []
}

export async function saveSkills(skills: Skill[]): Promise<void> {
  try {
    await ensureDir()
    await writeFile(skillsFile, JSON.stringify(skills, null, 2), 'utf-8')
  } catch (e) {
    console.error('保存技能失败：', e)
  }
}

// ---------- 录制会话管理 ----------

/** 当前活跃的录制会话 */
let currentSession: RecordingSession | null = null

export function startRecording(startUrl?: string): RecordingSession {
  currentSession = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    isRecording: true,
    startedAt: Date.now(),
    steps: [],
    startUrl,
    rrwebEvents: [],
    rrwebEventCount: 0
  }
  return currentSession
}

export function stopRecording(): RecordingSession | null {
  if (!currentSession) return null
  currentSession.isRecording = false
  const session = { ...currentSession }
  currentSession = null
  return session
}

export function getRecordingSession(): RecordingSession | null {
  return currentSession
}

export function isRecording(): boolean {
  return currentSession !== null && currentSession.isRecording
}

/** 向当前录制会话追加一步操作 */
export function appendStep(step: { tool: string; arguments: Record<string, unknown>; description?: string }): void {
  if (!currentSession || !currentSession.isRecording) return
  currentSession.steps.push({
    tool: step.tool,
    arguments: step.arguments,
    timestamp: Date.now(),
    description: step.description
  })
}

/** 向当前录制会话追加 rrweb 事件 */
export function appendRrwebEvent(event: Record<string, unknown>): void {
  if (!currentSession || !currentSession.isRecording) return
  currentSession.rrwebEvents.push(event)
  currentSession.rrwebEventCount = currentSession.rrwebEvents.length
}

/** 获取当前录制会话的 rrweb 事件数量 */
export function getRrwebEventCount(): number {
  if (!currentSession) return 0
  return currentSession.rrwebEventCount
}
