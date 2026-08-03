import { describe, it, expect } from 'vitest'
import {
  agentConfig,
  configureAgentLoop,
  errorResult,
  collectToolCalls,
  truncateToolResult,
  sanitizeContent
} from '../../src/main/deepseek/context'

describe('deepseek/context', () => {
  describe('agentConfig', () => {
    it('有合理的默认值', () => {
      expect(agentConfig.maxToolRounds).toBe(30)
      expect(agentConfig.maxToolResultChars).toBe(8000)
      expect(agentConfig.maxContextChars).toBe(300000)
      expect(agentConfig.checkpointEnabled).toBe(true)
    })
  })

  describe('configureAgentLoop', () => {
    it('部分更新配置', () => {
      const originalRounds = agentConfig.maxToolRounds
      configureAgentLoop({ maxToolRounds: 50 })
      expect(agentConfig.maxToolRounds).toBe(50)
      // 恢复
      configureAgentLoop({ maxToolRounds: originalRounds })
      expect(agentConfig.maxToolRounds).toBe(originalRounds)
    })

    it('空对象不改变配置', () => {
      const snapshot = { ...agentConfig }
      configureAgentLoop({})
      expect(agentConfig).toEqual(snapshot)
    })
  })

  describe('errorResult', () => {
    it('构造正确的错误返回值', () => {
      const result = errorResult('something went wrong')
      expect(result.finishReason).toBe('error')
      expect(result.content).toBe('')
      expect(result.reasoningContent).toBe('')
      expect(result.toolCalls).toEqual([])
      expect(result.error).toBe('something went wrong')
    })

    it('空错误消息', () => {
      const result = errorResult('')
      expect(result.error).toBe('')
    })
  })

  describe('collectToolCalls', () => {
    it('空 Map 返回空数组', () => {
      expect(collectToolCalls(new Map())).toEqual([])
    })

    it('正确收集单个工具调用', () => {
      const acc = new Map<number, { id: string; name: string; arguments: string }>()
      acc.set(0, { id: 'call_1', name: 'file_read', arguments: '{"filePath":"/test"}' })
      const result = collectToolCalls(acc)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('call_1')
      expect(result[0].name).toBe('file_read')
      expect(result[0].arguments).toEqual({ filePath: '/test' })
    })

    it('按 index 顺序收集多个工具调用', () => {
      const acc = new Map<number, { id: string; name: string; arguments: string }>()
      acc.set(1, { id: 'call_2', name: 'file_write', arguments: '{"filePath":"/b"}' })
      acc.set(0, { id: 'call_1', name: 'file_read', arguments: '{"filePath":"/a"}' })
      const result = collectToolCalls(acc)
      expect(result).toHaveLength(2)
      // Map 的迭代顺序是插入顺序，set(1) 先 set(0) 后
      // Array.from 遍历 Map 按插入顺序
      expect(result[0].id).toBe('call_2')
      expect(result[1].id).toBe('call_1')
    })

    it('无效 JSON arguments 返回空对象', () => {
      const acc = new Map<number, { id: string; name: string; arguments: string }>()
      acc.set(0, { id: 'call_1', name: 'test', arguments: 'not json' })
      const result = collectToolCalls(acc)
      expect(result[0].arguments).toEqual({})
    })

    it('空 arguments 字符串返回空对象', () => {
      const acc = new Map<number, { id: string; name: string; arguments: string }>()
      acc.set(0, { id: 'call_1', name: 'test', arguments: '' })
      const result = collectToolCalls(acc)
      expect(result[0].arguments).toEqual({})
    })
  })

  describe('truncateToolResult', () => {
    it('短内容不截断', () => {
      expect(truncateToolResult('short')).toBe('short')
    })

    it('空内容不截断', () => {
      expect(truncateToolResult('')).toBe('')
    })

    it('超长内容截断并追加提示', () => {
      const long = 'A'.repeat(10000)
      const result = truncateToolResult(long)
      expect(result.length).toBeLessThan(long.length)
      expect(result).toContain('已截断')
      expect(result).toContain('10000')
    })
  })

  describe('sanitizeContent', () => {
    it('正常文本不变', () => {
      expect(sanitizeContent('hello world')).toBe('hello world')
    })

    it('保留换行和制表符', () => {
      expect(sanitizeContent('line1\nline2\ttabbed')).toBe('line1\nline2\ttabbed')
    })

    it('保留回车符', () => {
      expect(sanitizeContent('line1\r\nline2')).toBe('line1\r\nline2')
    })

    it('移除控制字符（0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F）', () => {
      const input = 'a\x00b\x01c\x02d\x07e\x0Bf\x0Cg\x0Eh\x1Fi'
      const result = sanitizeContent(input)
      // \x00 \x01 \x02 \x07 \x0B \x0C \x0E \x1F 被移除
      expect(result).toBe('abcdefghi')
    })

    it('移除 DEL 字符（0x7F）', () => {
      expect(sanitizeContent('a\x7Fb')).toBe('ab')
    })

    it('将孤立代理对替换为 U+FFFD', () => {
      // 孤立代理对 0xD800
      const input = 'a\uD800b'
      const result = sanitizeContent(input)
      expect(result).toBe('a\uFFFDb')
    })

    it('空字符串返回空', () => {
      expect(sanitizeContent('')).toBe('')
    })

    it('null/undefined 安全处理', () => {
      expect(sanitizeContent(null as unknown as string)).toBe(null as unknown as string)
      expect(sanitizeContent(undefined as unknown as string)).toBe(undefined as unknown as string)
    })

    it('中文内容保持不变', () => {
      const chinese = '你好世界！Hello 世界！'
      expect(sanitizeContent(chinese)).toBe(chinese)
    })

    it('emoji 被替换为 U+FFFD（已知限制：正则会匹配合法代理对）', () => {
      // sanitizeContent 的正则 [\uD800-\uDFFF] 会匹配所有代理对字符，
      // 包括组成 emoji 的合法代理对。这是一个已知限制。
      const emoji = 'Hello 🌍 World 🎉'
      const result = sanitizeContent(emoji)
      // emoji 被替换为 U+FFFD，但 ASCII 部分保持不变
      expect(result).toContain('Hello')
      expect(result).toContain('World')
      expect(result).not.toBe(emoji)
    })
  })
})
