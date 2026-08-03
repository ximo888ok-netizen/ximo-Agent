import { join } from 'path'
import { mkdir, readFile, writeFile } from 'fs/promises'
import type { AppSettings, Conversation, Mode } from '@shared/types'
import { DEFAULT_SETTINGS } from './constants'
import { settingsFile, conversationsFile, memoryDir } from './paths'
import { ensureDir, ensureDirPath } from './ensureDir'

// ---------- 设置 ----------

export async function loadSettings(): Promise<AppSettings> {
  try {
    await ensureDir()
    const raw = await readFile(settingsFile, 'utf-8')
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch (e) {
    console.error('加载设置失败：', e)
  }
  return { ...DEFAULT_SETTINGS }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    await ensureDir()
    await writeFile(settingsFile, JSON.stringify(settings, null, 2), 'utf-8')
  } catch (e) {
    console.error('保存设置失败：', e)
  }
}

// ---------- 会话 ----------

let saveConvTimer: ReturnType<typeof setTimeout> | null = null
let pendingConversations: Conversation[] | null = null

export async function loadConversations(): Promise<Conversation[]> {
  try {
    await ensureDir()
    const raw = await readFile(conversationsFile, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    console.error('加载会话失败：', e)
  }
  return []
}

export async function saveConversations(conversations: Conversation[]): Promise<void> {
  // 防抖：500ms 内多次调用合并为一次磁盘写入
  pendingConversations = conversations
  if (saveConvTimer !== null) clearTimeout(saveConvTimer)
  return new Promise((resolve) => {
    saveConvTimer = setTimeout(async () => {
      saveConvTimer = null
      const data = pendingConversations
      pendingConversations = null
      if (data) {
        try {
          await ensureDir()
          await writeFile(conversationsFile, JSON.stringify(data, null, 2), 'utf-8')
        } catch (e) {
          console.error('保存会话失败：', e)
        }
      }
      resolve()
    }, 500)
  })
}

/** 立即刷新待写入的会话数据（应用退出前调用） */
export async function flushSaveConversations(): Promise<void> {
  if (saveConvTimer !== null) {
    clearTimeout(saveConvTimer)
    saveConvTimer = null
    const data = pendingConversations
    pendingConversations = null
    if (data) {
      try {
        await ensureDir()
        await writeFile(conversationsFile, JSON.stringify(data, null, 2), 'utf-8')
      } catch (e) {
        console.error('保存会话失败：', e)
      }
    }
  }
}

// ---------- 模式记忆 ----------

/** 加载指定模式的记忆内容（Markdown 纯文本） */
export async function loadMemory(mode: Mode): Promise<string> {
  try {
    await ensureDirPath(memoryDir)
    return await readFile(join(memoryDir, `${mode}.md`), 'utf-8')
  } catch {
    // 文件不存在时返回空字符串
    return ''
  }
}

/** 保存指定模式的记忆内容 */
export async function saveMemory(mode: Mode, content: string): Promise<void> {
  try {
    await ensureDirPath(memoryDir)
    await writeFile(join(memoryDir, `${mode}.md`), content, 'utf-8')
  } catch (e) {
    console.error('保存记忆失败：', e)
  }
}
