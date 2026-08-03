import { describe, it, expect } from 'vitest'
import { truncateToolResult, trimContext, totalChars } from '../../src/shared/context-compress'
import type { AgentConfig } from '../../src/shared/context-compress'

const config: AgentConfig = {
  maxToolResultChars: 100,
  maxContextChars: 1000,
  recentKeep: 3,
  snippedKeep: 50,
  prunedKeep: 20
}

describe('context-compress', () => {
  describe('totalChars', () => {
    it('空数组返回 0', () => {
      expect(totalChars([])).toBe(0)
    })

    it('正确计算多条消息总字符数', () => {
      const msgs = [
        { content: 'hello' },
        { content: 'world' },
        { content: '你好世界' }
      ]
      // hello(5) + world(5) + 你好世界(4) = 14
      expect(totalChars(msgs)).toBe(14)
    })

    it('content 为 undefined 时不计入', () => {
      const msgs = [{ content: 'abc' }, { content: undefined as unknown as string }]
      expect(totalChars(msgs)).toBe(3)
    })
  })

  describe('truncateToolResult', () => {
    it('短内容不截断', () => {
      const short = 'hello'
      expect(truncateToolResult(short, config)).toBe(short)
    })

    it('空内容不截断', () => {
      expect(truncateToolResult('', config)).toBe('')
    })

    it('超长内容截断到 maxToolResultChars 并追加提示', () => {
      const long = 'A'.repeat(200)
      const result = truncateToolResult(long, config)
      expect(result.length).toBeLessThan(long.length)
      expect(result).toContain('已截断')
      expect(result).toContain('200')
      expect(result.startsWith('A'.repeat(100))).toBe(true)
    })

    it('恰好等于阈值的内容不截断', () => {
      const exact = 'A'.repeat(100)
      expect(truncateToolResult(exact, config)).toBe(exact)
    })
  })

  describe('trimContext', () => {
    it('总量低于 snip 阈值时不做任何操作', () => {
      const messages = [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' }
      ]
      const original = messages.map(m => ({ ...m }))
      trimContext(messages, config)
      // 内容不变
      expect(messages).toEqual(original)
    })

    it('超过 snip 阈值时截断旧 tool 结果', () => {
      // maxContextChars=1000, snip 阈值 = 600
      // 构造：system + 多条 tool 消息使总量 > 600
      const messages: Array<{ role: string; content: string; tool_calls?: unknown; tool_call_id?: string }> = [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'question' },
        { role: 'assistant', content: '', tool_calls: [{ id: '1', type: 'function', function: { name: 'test', arguments: '{}' } }] },
        { role: 'tool', content: 'X'.repeat(300), tool_call_id: '1' },
        { role: 'assistant', content: '', tool_calls: [{ id: '2', type: 'function', function: { name: 'test', arguments: '{}' } }] },
        { role: 'tool', content: 'Y'.repeat(300), tool_call_id: '2' },
        { role: 'assistant', content: 'final answer' }
      ]
      // recentKeep=3，保护最后 3 条
      // 总量 = 13 + 8 + 0 + 300 + 0 + 300 + 13 = 634 > 600
      trimContext(messages, config)

      // 前面非保护区的 tool 消息应被截断
      const toolMsg1 = messages.find(m => m.tool_call_id === '1')
      const toolMsg2 = messages.find(m => m.tool_call_id === '2')
      // 第一条 tool 在保护范围外（index 3，protectFrom = 7-3=4），应被截断
      expect(toolMsg1!.content.length).toBeLessThanOrEqual(config.snippedKeep + 100)
      expect(toolMsg1!.content).toContain('已自动截断')
    })

    it('recentKeep 保护最近的消息不被截断', () => {
      const recentContent = 'KEEP_ME_' + 'Z'.repeat(200)
      const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: 'sys' },
        { role: 'tool', content: 'OLD_' + 'A'.repeat(400) },
        { role: 'tool', content: 'OLD_' + 'B'.repeat(400) },
        // 最近 3 条受保护
        { role: 'tool', content: recentContent },
        { role: 'assistant', content: 'answer' },
        { role: 'user', content: 'thanks' }
      ]
      // total = 3 + 404 + 404 + 208 + 6 + 6 = 1031 > 1000
      trimContext(messages, config)
      // recentContent 应保持不变（在 recentKeep 保护范围内）
      const recent = messages.find(m => m.content === recentContent)
      expect(recent).toBeDefined()
    })
  })
})
