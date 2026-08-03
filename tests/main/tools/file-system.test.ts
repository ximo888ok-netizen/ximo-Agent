import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, writeFile, readFile, rm, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { FileReadTool } from '../../../src/main/tools/FileSystem/FileReadTool'
import { FileWriteTool } from '../../../src/main/tools/FileSystem/FileWriteTool'
import { FileEditTool } from '../../../src/main/tools/FileSystem/FileEditTool'
import { FileDeleteTool } from '../../../src/main/tools/FileSystem/FileDeleteTool'
import { TodoWriteTool } from '../../../src/main/tools/FileSystem/TodoWriteTool'
import type { ToolCall } from '../../../src/shared/types'

const TEST_DIR = join(tmpdir(), 'ximo-agent-test-fs-' + Date.now())

function makeToolCall(id: string, name: string, args: Record<string, unknown>): ToolCall {
  return { id, name, arguments: args }
}

describe('FileSystem 工具执行体', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true })
  })

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {})
  })

  // ==================== FileReadTool ====================
  describe('FileReadTool', () => {
    const tool = new FileReadTool()

    it('definition 有正确名称和必填参数', () => {
      expect(tool.definition.name).toBe('file_read')
      expect(tool.definition.parameters.required).toContain('filePath')
    })

    it('成功读取文本文件', async () => {
      const filePath = join(TEST_DIR, 'test.txt')
      await writeFile(filePath, 'line1\nline2\nline3', 'utf-8')

      const result = await tool.execute(
        makeToolCall('tc1', 'file_read', { filePath }),
        undefined
      )
      expect(result.success).toBe(true)
      expect(result.content).toContain('line1')
      expect(result.content).toContain('line2')
      expect(result.content).toContain('line3')
      expect(result.content).toContain('3 行')
    })

    it('缺少 filePath 参数返回错误', async () => {
      const result = await tool.execute(
        makeToolCall('tc2', 'file_read', {}),
        undefined
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('filePath')
    })

    it('文件不存在返回错误', async () => {
      const result = await tool.execute(
        makeToolCall('tc3', 'file_read', { filePath: join(TEST_DIR, 'nonexistent.txt') }),
        undefined
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('不存在')
    })

    it('按行号显示内容', async () => {
      const filePath = join(TEST_DIR, 'numbered.txt')
      await writeFile(filePath, 'aaa\nbbb\nccc', 'utf-8')

      const result = await tool.execute(
        makeToolCall('tc4', 'file_read', { filePath, maxLines: 0 }),
        undefined
      )
      expect(result.success).toBe(true)
      // 行号前缀格式: "   1 | aaa"
      expect(result.content).toMatch(/1.*aaa/)
      expect(result.content).toMatch(/2.*bbb/)
      expect(result.content).toMatch(/3.*ccc/)
    })

    it('startLine/endLine 精准切片', async () => {
      const filePath = join(TEST_DIR, 'sliced.txt')
      await writeFile(filePath, 'L1\nL2\nL3\nL4\nL5', 'utf-8')

      const result = await tool.execute(
        makeToolCall('tc5', 'file_read', { filePath, startLine: 2, endLine: 4 }),
        undefined
      )
      expect(result.success).toBe(true)
      expect(result.content).toContain('L2')
      expect(result.content).toContain('L3')
      expect(result.content).toContain('L4')
      expect(result.content).not.toContain('L1\n')
      expect(result.content).toContain('第 2-4 行')
    })

    it('base64 编码模式', async () => {
      const filePath = join(TEST_DIR, 'binary.dat')
      await writeFile(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

      const result = await tool.execute(
        makeToolCall('tc6', 'file_read', { filePath, encoding: 'base64' }),
        undefined
      )
      expect(result.success).toBe(true)
      expect(result.content).toContain('base64')
    })

    it('onChunk 回调被调用', async () => {
      const filePath = join(TEST_DIR, 'callback.txt')
      await writeFile(filePath, 'content', 'utf-8')

      const chunks: Array<{ toolStatus?: string; toolName?: string }> = []
      const result = await tool.execute(
        makeToolCall('tc7', 'file_read', { filePath }),
        (chunk) => chunks.push(chunk as any)
      )
      expect(result.success).toBe(true)
      expect(chunks.some(c => c.toolStatus === 'calling' && c.toolName === 'file_read')).toBe(true)
    })
  })

  // ==================== FileWriteTool ====================
  describe('FileWriteTool', () => {
    const tool = new FileWriteTool()

    it('definition 有正确名称', () => {
      expect(tool.definition.name).toBe('file_write')
      expect(tool.definition.parameters.required).toEqual(['filePath', 'content'])
    })

    it('成功创建新文件', async () => {
      const filePath = join(TEST_DIR, 'new.txt')
      const result = await tool.execute(
        makeToolCall('tc1', 'file_write', { filePath, content: 'hello world' }),
        undefined
      )
      expect(result.success).toBe(true)
      expect(existsSync(filePath)).toBe(true)
      const written = await readFile(filePath, 'utf-8')
      expect(written).toBe('hello world')
    })

    it('自动创建父目录', async () => {
      const filePath = join(TEST_DIR, 'sub', 'dir', 'nested.txt')
      const result = await tool.execute(
        makeToolCall('tc2', 'file_write', { filePath, content: 'nested' }),
        undefined
      )
      expect(result.success).toBe(true)
      expect(existsSync(filePath)).toBe(true)
    })

    it('覆盖已有文件', async () => {
      const filePath = join(TEST_DIR, 'overwrite.txt')
      await writeFile(filePath, 'old content', 'utf-8')

      const result = await tool.execute(
        makeToolCall('tc3', 'file_write', { filePath, content: 'new content' }),
        undefined
      )
      expect(result.success).toBe(true)
      const written = await readFile(filePath, 'utf-8')
      expect(written).toBe('new content')
    })

    it('追加模式不覆盖原内容', async () => {
      const filePath = join(TEST_DIR, 'append.txt')
      await writeFile(filePath, 'original\n', 'utf-8')

      const result = await tool.execute(
        makeToolCall('tc4', 'file_write', { filePath, content: 'appended', mode: 'append' }),
        undefined
      )
      expect(result.success).toBe(true)
      const written = await readFile(filePath, 'utf-8')
      expect(written).toContain('original')
      expect(written).toContain('appended')
    })

    it('缺少 filePath 返回错误', async () => {
      const result = await tool.execute(
        makeToolCall('tc5', 'file_write', { content: 'data' }),
        undefined
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('filePath')
    })

    it('返回正确的元数据', async () => {
      const filePath = join(TEST_DIR, 'meta.txt')
      const result = await tool.execute(
        makeToolCall('tc6', 'file_write', { filePath, content: 'a\nb\nc' }),
        undefined
      )
      expect(result.success).toBe(true)
      expect(result.metadata).toBeDefined()
      expect(result.metadata!.lines).toBe(3)
    })
  })

  // ==================== FileEditTool ====================
  describe('FileEditTool', () => {
    const tool = new FileEditTool()

    it('精确替换文本块', async () => {
      const filePath = join(TEST_DIR, 'edit.txt')
      await writeFile(filePath, 'const x = 1\nconst y = 2\nconst z = 3', 'utf-8')

      const result = await tool.execute(
        makeToolCall('tc1', 'file_edit', {
          filePath,
          oldStr: 'const y = 2',
          newStr: 'const y = 42'
        }),
        undefined
      )
      expect(result.success).toBe(true)
      const content = await readFile(filePath, 'utf-8')
      expect(content).toContain('const y = 42')
      expect(content).not.toContain('const y = 2')
    })

    it('未找到匹配文本时返回失败', async () => {
      const filePath = join(TEST_DIR, 'nomatch.txt')
      await writeFile(filePath, 'hello world', 'utf-8')

      const result = await tool.execute(
        makeToolCall('tc2', 'file_edit', {
          filePath,
          oldStr: 'nonexistent text',
          newStr: 'replacement'
        }),
        undefined
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('未找到')
    })

    it('多处匹配时拒绝替换', async () => {
      const filePath = join(TEST_DIR, 'multi.txt')
      await writeFile(filePath, 'aaa bbb aaa ccc aaa', 'utf-8')

      const result = await tool.execute(
        makeToolCall('tc3', 'file_edit', {
          filePath,
          oldStr: 'aaa',
          newStr: 'zzz'
        }),
        undefined
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('多处匹配')
    })

    it('文件不存在返回错误', async () => {
      const result = await tool.execute(
        makeToolCall('tc4', 'file_edit', {
          filePath: join(TEST_DIR, 'nope.txt'),
          oldStr: 'a',
          newStr: 'b'
        }),
        undefined
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('不存在')
    })

    it('缺少 oldStr 参数返回错误', async () => {
      const filePath = join(TEST_DIR, 'nooldstr.txt')
      await writeFile(filePath, 'content', 'utf-8')

      const result = await tool.execute(
        makeToolCall('tc5', 'file_edit', { filePath, oldStr: '', newStr: 'x' }),
        undefined
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('oldStr')
    })

    it('替换后文件完整性保持', async () => {
      const filePath = join(TEST_DIR, 'integrity.txt')
      const original = 'line1\nline2\nline3\nline4\nline5'
      await writeFile(filePath, original, 'utf-8')

      await tool.execute(
        makeToolCall('tc6', 'file_edit', {
          filePath,
          oldStr: 'line3',
          newStr: 'LINE_THREE'
        }),
        undefined
      )
      const content = await readFile(filePath, 'utf-8')
      expect(content).toBe('line1\nline2\nLINE_THREE\nline4\nline5')
    })
  })

  // ==================== FileDeleteTool ====================
  describe('FileDeleteTool', () => {
    const tool = new FileDeleteTool()

    it('成功删除文件', async () => {
      const filePath = join(TEST_DIR, 'delete-me.txt')
      await writeFile(filePath, 'bye', 'utf-8')
      expect(existsSync(filePath)).toBe(true)

      const result = await tool.execute(
        makeToolCall('tc1', 'file_delete', { filePath }),
        undefined
      )
      expect(result.success).toBe(true)
      expect(existsSync(filePath)).toBe(false)
    })

    it('递归删除目录', async () => {
      const dirPath = join(TEST_DIR, 'dir-to-delete')
      await mkdir(join(dirPath, 'sub'), { recursive: true })
      await writeFile(join(dirPath, 'file.txt'), 'content', 'utf-8')

      const result = await tool.execute(
        makeToolCall('tc2', 'file_delete', { filePath: dirPath, recursive: true }),
        undefined
      )
      expect(result.success).toBe(true)
      expect(existsSync(dirPath)).toBe(false)
    })

    it('不递归删除目录时返回错误', async () => {
      const dirPath = join(TEST_DIR, 'non-recursive')
      await mkdir(dirPath, { recursive: true })

      const result = await tool.execute(
        makeToolCall('tc3', 'file_delete', { filePath: dirPath, recursive: false }),
        undefined
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('目录')
      expect(result.error).toContain('recursive')
    })

    it('文件不存在返回错误', async () => {
      const result = await tool.execute(
        makeToolCall('tc4', 'file_delete', { filePath: join(TEST_DIR, 'nope.txt') }),
        undefined
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('不存在')
    })

    it('返回 requiresConfirmation 标记', async () => {
      const filePath = join(TEST_DIR, 'confirm.txt')
      await writeFile(filePath, 'data', 'utf-8')

      const result = await tool.execute(
        makeToolCall('tc5', 'file_delete', { filePath }),
        undefined
      )
      expect(result.success).toBe(true)
      expect(result.requiresConfirmation).toBe(true)
    })
  })

  // ==================== TodoWriteTool ====================
  describe('TodoWriteTool', () => {
    const tool = new TodoWriteTool()

    it('成功记录任务列表', async () => {
      const result = await tool.execute(
        makeToolCall('tc1', 'todo_write', {
          todos: [
            { content: '第一步', status: 'completed' },
            { content: '第二步', status: 'in_progress' },
            { content: '第三步', status: 'pending' }
          ]
        }),
        undefined
      )
      expect(result.success).toBe(true)
      expect(result.content).toContain('3 项')
      expect(result.content).toContain('1 已完成')
      expect(result.content).toContain('1 进行中')
      expect(result.content).toContain('1 待处理')
    })

    it('空列表返回错误', async () => {
      const result = await tool.execute(
        makeToolCall('tc2', 'todo_write', { todos: [] }),
        undefined
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('不能为空')
    })

    it('多个 in_progress 返回错误', async () => {
      const result = await tool.execute(
        makeToolCall('tc3', 'todo_write', {
          todos: [
            { content: 'A', status: 'in_progress' },
            { content: 'B', status: 'in_progress' }
          ]
        }),
        undefined
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('in_progress')
    })

    it('content 为空返回错误', async () => {
      const result = await tool.execute(
        makeToolCall('tc4', 'todo_write', {
          todos: [{ content: '', status: 'pending' }]
        }),
        undefined
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('content')
    })

    it('无效 level 返回错误', async () => {
      const result = await tool.execute(
        makeToolCall('tc5', 'todo_write', {
          todos: [{ content: 'task', status: 'pending', level: 5 }]
        }),
        undefined
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('level')
    })

    it('元数据包含完整 todos', async () => {
      const todos = [
        { content: 'task A', status: 'completed' as const },
        { content: 'task B', status: 'pending' as const }
      ]
      const result = await tool.execute(
        makeToolCall('tc6', 'todo_write', { todos }),
        undefined
      )
      expect(result.success).toBe(true)
      expect(result.metadata!.todos).toEqual(todos)
      expect(result.metadata!.total).toBe(2)
      expect(result.metadata!.done).toBe(1)
    })
  })
})
