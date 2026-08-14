import { join } from 'path'
import { mkdir, readFile, writeFile } from 'fs/promises'
import type { AppSettings, Conversation, Mode } from '@shared/types'
import { DEFAULT_SETTINGS } from './constants'
import { settingsFile, conversationsFile, memoryDir } from './paths'
import { ensureDir, ensureDirPath } from './ensureDir'
import { loadEncryptedFields, saveEncryptedFields } from './secure-storage'

// ---------- 设置 ----------

export async function loadSettings(): Promise<AppSettings> {
  try {
    await ensureDir()
    const raw = await readFile(settingsFile, 'utf-8')
    const parsed = JSON.parse(raw)
    // 合并加密字段（覆盖明文，优先级更高）
    const encrypted = loadEncryptedFields()
    return { ...DEFAULT_SETTINGS, ...parsed, ...encrypted }
  } catch (e) {
    console.error('加载设置失败：', e)
  }
  return { ...DEFAULT_SETTINGS }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    await ensureDir()
    // 加密敏感字段并写入 secure.enc
    saveEncryptedFields(settings as Record<string, unknown>)
    // settings.json 仍然保存完整数据（含明文），保持向后兼容
    // 安全提升：safeStorage 可用时从 settings.json 中擦除敏感字段
    const safeStorage = await import('electron')
    const isEncAvailable = safeStorage.safeStorage?.isEncryptionAvailable?.()
    if (isEncAvailable) {
      const redacted = { ...settings }
      // 敏感字段已加密到 secure.enc，settings.json 中置空
      if (redacted.apiKey) redacted.apiKey = ''
      if (redacted.visionApiKey) redacted.visionApiKey = ''
      if (redacted.sttApiKey) redacted.sttApiKey = ''
      await writeFile(settingsFile, JSON.stringify(redacted, null, 2), 'utf-8')
    } else {
      await writeFile(settingsFile, JSON.stringify(settings, null, 2), 'utf-8')
    }
  } catch (e) {
    console.error('保存设置失败：', e)
  }
}

// ---------- 会话 ----------

let saveConvTimer: ReturnType<typeof setTimeout> | null = null
let saveConvMaxTimer: ReturnType<typeof setTimeout> | null = null
let pendingConversations: Conversation[] | null = null
// 跟踪上一次未决的 resolve — 新调用取代旧调用时立即 resolve 旧的，避免 Promise 泄漏
let pendingResolve: (() => void) | null = null

// 防抖窗口：500ms 内多次调用合并为一次磁盘写入
const SAVE_DEBOUNCE_MS = 500
// maxWait 兜底：高频连续调用（流式每 chunk 触发）时，最多 5s 必须落盘一次，
// 避免 Promise 被无限推迟 resolve（崩溃/断电时丢失最近数据）
const SAVE_MAX_WAIT_MS = 5000

/** 实际执行磁盘写入 — 提取为独立函数避免三处调用重复 */
async function doWriteConversations(): Promise<void> {
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

/** 清除所有待处理的定时器 */
function clearConvTimers(): void {
  if (saveConvTimer !== null) { clearTimeout(saveConvTimer); saveConvTimer = null }
  if (saveConvMaxTimer !== null) { clearTimeout(saveConvMaxTimer); saveConvMaxTimer = null }
}

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
  pendingConversations = conversations
  // 清除已有的防抖定时器（保留 maxWait 定时器）
  if (saveConvTimer !== null) clearTimeout(saveConvTimer)
  // 新调用取代旧调用时，立即 resolve 上一次未决的 Promise，避免泄漏
  if (pendingResolve) { const prev = pendingResolve; pendingResolve = null; prev() }
  // 首次调用时启动 maxWait 兜底定时器 — 高频场景下确保最多 5s 落盘一次
  if (saveConvMaxTimer === null) {
    saveConvMaxTimer = setTimeout(() => {
      saveConvMaxTimer = null
      if (saveConvTimer !== null) { clearTimeout(saveConvTimer); saveConvTimer = null }
      if (pendingResolve) { const r = pendingResolve; pendingResolve = null; r() }
      void doWriteConversations()
    }, SAVE_MAX_WAIT_MS)
  }
  return new Promise((resolve) => {
    pendingResolve = resolve
    saveConvTimer = setTimeout(async () => {
      saveConvTimer = null
      if (saveConvMaxTimer !== null) { clearTimeout(saveConvMaxTimer); saveConvMaxTimer = null }
      if (pendingResolve) { const r = pendingResolve; pendingResolve = null; r() }
      await doWriteConversations()
      resolve()
    }, SAVE_DEBOUNCE_MS)
  })
}

/** 立即刷新待写入的会话数据（应用退出前调用） */
export async function flushSaveConversations(): Promise<void> {
  clearConvTimers()
  if (pendingResolve) { const r = pendingResolve; pendingResolve = null; r() }
  await doWriteConversations()
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
