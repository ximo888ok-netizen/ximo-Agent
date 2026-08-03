import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CheckpointStore, getCheckpointStore, removeCheckpointStore } from '../../src/main/CheckpointStore'
import { existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { rm, mkdir, writeFile } from 'fs/promises'

const TEST_SESSION_ID = 'test-checkpoint-session-' + Date.now()
const TEST_DIR = join(tmpdir(), 'ximo-agent-checkpoints', TEST_SESSION_ID)

describe('CheckpointStore', () => {
  let store: CheckpointStore

  beforeEach(async () => {
    // 确保测试目录干净
    await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {})
    store = new CheckpointStore(TEST_SESSION_ID)
  })

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {})
  })

  describe('begin & nextTurn', () => {
    it('初始 nextTurn 返回 0', () => {
      expect(store.nextTurn()).toBe(0)
    })

    it('begin 后 nextTurn 递增', () => {
      store.begin(0, 'first prompt', 0)
      expect(store.nextTurn()).toBe(1)
      store.begin(1, 'second prompt', 2)
      expect(store.nextTurn()).toBe(2)
    })

    it('begin 记录 prompt 和 msgIndex', () => {
      store.begin(0, 'test prompt', 5)
      const list = store.list()
      expect(list).toHaveLength(1)
      expect(list[0].prompt).toBe('test prompt')
    })
  })

  describe('snapshot', () => {
    it('记录已存在文件的原始内容', async () => {
      const testFile = join(TEST_DIR, 'test-file.txt')
      await mkdir(TEST_DIR, { recursive: true })
      await writeFile(testFile, 'original content', 'utf-8')

      store.begin(0, 'prompt', 0)
      await store.snapshot(testFile)

      const list = store.list()
      expect(list[0].paths).toContain(testFile)
    })

    it('不存在的文件记录为 null content', async () => {
      const fakePath = join(TEST_DIR, 'nonexistent.txt')
      store.begin(0, 'prompt', 0)
      await store.snapshot(fakePath)

      const list = store.list()
      expect(list[0].paths).toContain(fakePath)
    })

    it('同一轮次同一文件只快照一次', async () => {
      const testFile = join(TEST_DIR, 'dedup.txt')
      await mkdir(TEST_DIR, { recursive: true })
      await writeFile(testFile, 'v1', 'utf-8')

      store.begin(0, 'prompt', 0)
      await store.snapshot(testFile)
      // 修改文件
      await writeFile(testFile, 'v2', 'utf-8')
      await store.snapshot(testFile)

      const list = store.list()
      expect(list[0].paths).toHaveLength(1)
    })
  })

  describe('list', () => {
    it('空 store 返回空列表', () => {
      expect(store.list()).toEqual([])
    })

    it('按 turn 排序', async () => {
      store.begin(2, 'third', 4)
      store.begin(0, 'first', 0)
      store.begin(1, 'second', 2)

      const list = store.list()
      expect(list.map(c => c.turn)).toEqual([0, 1, 2])
    })
  })

  describe('restoreCode', () => {
    it('恢复文件到快照时的内容', async () => {
      const testFile = join(TEST_DIR, 'restore.txt')
      await mkdir(TEST_DIR, { recursive: true })
      await writeFile(testFile, 'original', 'utf-8')

      store.begin(0, 'prompt', 0)
      await store.snapshot(testFile)

      // 修改文件
      await writeFile(testFile, 'modified', 'utf-8')

      // 恢复
      const result = await store.restoreCode(0)
      expect(result.written).toContain(testFile)
      expect(result.deleted).toEqual([])
      expect(result.errors).toEqual([])
    })

    it('原本不存在的文件恢复时被删除', async () => {
      const testFile = join(TEST_DIR, 'new-file.txt')
      // 不创建文件，直接 begin + snapshot
      store.begin(0, 'prompt', 0)
      await store.snapshot(testFile)

      // 模拟 Agent 创建了文件
      await writeFile(testFile, 'created by agent', 'utf-8')

      // 恢复
      const result = await store.restoreCode(0)
      expect(result.deleted).toContain(testFile)
      expect(existsSync(testFile)).toBe(false)
    })

    it('恢复后检查点列表被截断', async () => {
      store.begin(0, 'first', 0)
      store.begin(1, 'second', 2)
      store.begin(2, 'third', 4)

      await store.restoreCode(1)
      const list = store.list()
      // 只保留 turn < 1 的
      expect(list.map(c => c.turn)).toEqual([0])
    })

    it('空检查点恢复返回空结果', async () => {
      const result = await store.restoreCode(0)
      expect(result.written).toEqual([])
      expect(result.deleted).toEqual([])
      expect(result.errors).toEqual([])
    })
  })

  describe('bounds', () => {
    it('返回 turn → msgIndex 映射', () => {
      store.begin(0, 'first', 0)
      store.begin(1, 'second', 2)
      store.begin(2, 'third', 4)

      const bounds = store.bounds()
      expect(bounds.get(0)).toBe(0)
      expect(bounds.get(1)).toBe(2)
      expect(bounds.get(2)).toBe(4)
    })

    it('空 store 返回空 Map', () => {
      expect(store.bounds().size).toBe(0)
    })
  })

  describe('clear', () => {
    it('清除所有检查点', async () => {
      store.begin(0, 'first', 0)
      store.begin(1, 'second', 2)
      await store.clear()
      expect(store.list()).toEqual([])
      expect(store.nextTurn()).toBe(0)
    })

    it('清除磁盘文件', async () => {
      store.begin(0, 'first', 0)
      // 等待 fire-and-forget persist 完成，避免与 clear 的 rm 竞态
      await new Promise(resolve => setTimeout(resolve, 50))
      await store.clear()
      expect(existsSync(TEST_DIR)).toBe(false)
    })
  })

  describe('磁盘持久化', () => {
    it('begin 后持久化到磁盘', async () => {
      store.begin(0, 'persisted prompt', 0)
      // persist 是 fire-and-forget 异步写入，等待一个微任务
      await new Promise(resolve => setTimeout(resolve, 50))
      const cpFile = join(TEST_DIR, 'turn-0.json')
      expect(existsSync(cpFile)).toBe(true)
    })

    it('从磁盘加载已有检查点', async () => {
      // 写入一个检查点文件
      await mkdir(TEST_DIR, { recursive: true })
      const cpData = {
        turn: 0,
        time: Date.now(),
        prompt: 'loaded from disk',
        msgIndex: 0,
        files: []
      }
      await writeFile(join(TEST_DIR, 'turn-0.json'), JSON.stringify(cpData), 'utf-8')

      // 创建新 store（模拟重启）
      const newStore = new CheckpointStore(TEST_SESSION_ID)
      const list = newStore.list()
      expect(list).toHaveLength(1)
      expect(list[0].prompt).toBe('loaded from disk')
    })
  })
})

describe('getCheckpointStore & removeCheckpointStore', () => {
  const SESSION = 'global-test-' + Date.now()

  afterEach(async () => {
    await removeCheckpointStore(SESSION)
  })

  it('getCheckpointStore 返回同一会话的同一实例', () => {
    const s1 = getCheckpointStore(SESSION)
    const s2 = getCheckpointStore(SESSION)
    expect(s1).toBe(s2)
  })

  it('不同会话返回不同实例', () => {
    const s1 = getCheckpointStore(SESSION)
    const s2 = getCheckpointStore(SESSION + '-other')
    expect(s1).not.toBe(s2)
  })

  it('removeCheckpointStore 清除实例', async () => {
    getCheckpointStore(SESSION)
    await removeCheckpointStore(SESSION)
    // 再次获取应该是新实例
    const newStore = getCheckpointStore(SESSION)
    expect(newStore.list()).toEqual([])
  })
})
