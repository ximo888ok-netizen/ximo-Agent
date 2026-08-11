import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { rm } from 'fs/promises'
import { existsSync } from 'fs'

// ---- Mock electron（store.ts 模块加载时即调用 app.getPath）----
// vi.mock 被 hoisted，不能引用外部变量；用 vi.hoisted 在 mock 工厂内计算路径

const { mockUserData } = vi.hoisted(() => {
  const os = require('os') as typeof import('os')
  const path = require('path') as typeof import('path')
  return { mockUserData: path.join(os.tmpdir(), 'ximo-agent-test-store') }
})

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => mockUserData),
    isReady: vi.fn(() => true)
  }
}))

// ---- 导入被测模块（vi.mock 已 hoisted，mock 在导入前生效）----

import {
  loadSettings,
  saveSettings,
  loadConversations,
  saveConversations,
  flushSaveConversations,
  loadMemory,
  saveMemory
} from '../../src/main/store'
import { DEFAULT_SETTINGS } from '../../src/shared/defaults'
import type { AppSettings, Conversation, Mode } from '../../src/shared/types'

const dataDir = join(mockUserData, 'ximo-agent')

describe('持久化存储 store.ts', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await rm(mockUserData, { recursive: true, force: true }).catch(() => {})
  })

  afterEach(async () => {
    await rm(mockUserData, { recursive: true, force: true }).catch(() => {})
  })

  // ==================== Settings ====================
  describe('loadSettings / saveSettings', () => {
    it('文件不存在时返回默认设置', async () => {
      const settings = await loadSettings()
      expect(settings).toEqual(DEFAULT_SETTINGS)
    })

    it('保存后读取返回保存的值', async () => {
      const custom: Partial<AppSettings> = {
        apiKey: 'sk-test-key-123',
        model: 'deepseek-v4-pro',
        temperature: 0.5,
        maxTokens: 8192
      }
      await saveSettings(custom as AppSettings)

      const loaded = await loadSettings()
      expect(loaded.apiKey).toBe('sk-test-key-123')
      expect(loaded.model).toBe('deepseek-v4-pro')
      expect(loaded.temperature).toBe(0.5)
      expect(loaded.maxTokens).toBe(8192)
    })

    it('与默认设置合并（缺失字段用默认值）', async () => {
      // 只保存部分字段
      await saveSettings({ apiKey: 'sk-merge' } as AppSettings)

      const loaded = await loadSettings()
      expect(loaded.apiKey).toBe('sk-merge')
      // 其他字段应为默认值
      expect(loaded.thinkingMode).toBe(DEFAULT_SETTINGS.thinkingMode)
      expect(loaded.autoModeLevel).toBe(DEFAULT_SETTINGS.autoModeLevel)
    })

    it('settings.json 文件确实被创建', async () => {
      await saveSettings({ apiKey: 'sk-file' } as AppSettings)
      const filePath = join(dataDir, 'settings.json')
      expect(existsSync(filePath)).toBe(true)
    })
  })

  // ==================== Conversations ====================
  describe('loadConversations / saveConversations', () => {
    it('文件不存在时返回空数组', async () => {
      const convs = await loadConversations()
      expect(convs).toEqual([])
    })

    it('保存后读取返回保存的会话列表', async () => {
      const conversations: Conversation[] = [
        {
          id: 'conv-1',
          title: 'Test Conversation',
          mode: 'coding' as Mode,
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ]
      await saveConversations(conversations)

      // 等待防抖定时器执行
      await new Promise(r => setTimeout(r, 600))
      const loaded = await loadConversations()
      expect(loaded).toHaveLength(1)
      expect(loaded[0].id).toBe('conv-1')
      expect(loaded[0].title).toBe('Test Conversation')
    })

    it('防抖合并 500ms 内多次调用', async () => {
      const conv1: Conversation[] = [
        { id: 'c1', title: 'V1', mode: 'coding', messages: [], createdAt: 1, updatedAt: 1 }
      ]
      const conv2: Conversation[] = [
        { id: 'c2', title: 'V2', mode: 'coding', messages: [], createdAt: 2, updatedAt: 2 }
      ]

      // 连续调用（在 500ms 防抖窗口内）
      await saveConversations(conv1)
      await saveConversations(conv2)

      // 防抖延迟后只有一个文件写入
      await new Promise(r => setTimeout(r, 600))
      const loaded = await loadConversations()
      expect(loaded).toHaveLength(1)
      expect(loaded[0].id).toBe('c2') // 最后一次保存的值
    })

    it('flushSaveConversations 立即写入', async () => {
      const conv: Conversation[] = [
        { id: 'flush-test', title: 'Flush', mode: 'chat', messages: [], createdAt: 1, updatedAt: 1 }
      ]
      await saveConversations(conv)

      // 不等待防抖，直接 flush
      await flushSaveConversations()

      const loaded = await loadConversations()
      expect(loaded).toHaveLength(1)
      expect(loaded[0].id).toBe('flush-test')
    })

    it('保存空数组不报错', async () => {
      await saveConversations([])
      await new Promise(r => setTimeout(r, 600))
      const loaded = await loadConversations()
      expect(loaded).toEqual([])
    })

    it('maxWait 兜底：高频连续调用最终落盘（无需等防抖窗口）', async () => {
      // 模拟流式场景：500ms 内持续高频调用 saveConversations
      // （每次调用都重启防抖定时器，若无 maxWait 则永不落盘）
      // 用 vi.useFakeTimers 加速 maxWait（5s）触发，避免真实等待
      vi.useFakeTimers()
      try {
        for (let i = 0; i < 30; i++) {
          void saveConversations([
            { id: `c-${i}`, title: `V${i}`, mode: 'coding', messages: [], createdAt: i, updatedAt: i }
          ])
          vi.advanceTimersByTime(50) // 每次间隔 50ms < 500ms 防抖窗口
        }
        // maxWait 5s 兜底 — 推进到 5s 后应已落盘
        vi.advanceTimersByTime(5000)
        // 让微任务/IO 完成
        await vi.advanceTimersByTimeAsync(0)
      } finally {
        vi.useRealTimers()
      }
      await new Promise(r => setTimeout(r, 50))
      const loaded = await loadConversations()
      expect(loaded.length).toBeGreaterThan(0)
      expect(loaded[0].id).toBe('c-29') // 最后一次的值
    })
  })

  // ==================== Memory ====================
  describe('loadMemory / saveMemory', () => {
    it('文件不存在时返回空字符串', async () => {
      const content = await loadMemory('coding' as Mode)
      expect(content).toBe('')
    })

    it('保存后读取返回保存的内容', async () => {
      const text = '# Coding 模式记忆\n- 项目用 TypeScript\n- 测试框架 Vitest'
      await saveMemory('coding' as Mode, text)

      const loaded = await loadMemory('coding' as Mode)
      expect(loaded).toBe(text)
    })

    it('不同模式的记忆互不影响', async () => {
      await saveMemory('coding' as Mode, 'coding memory')
      await saveMemory('chat' as Mode, 'chat memory')

      const coding = await loadMemory('coding' as Mode)
      const chat = await loadMemory('chat' as Mode)
      expect(coding).toBe('coding memory')
      expect(chat).toBe('chat memory')
    })

    it('覆盖已有记忆', async () => {
      await saveMemory('coding' as Mode, 'old memory')
      await saveMemory('coding' as Mode, 'new memory')

      const loaded = await loadMemory('coding' as Mode)
      expect(loaded).toBe('new memory')
    })
  })
})
