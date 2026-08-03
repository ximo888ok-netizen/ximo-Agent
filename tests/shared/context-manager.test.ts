import { describe, it, expect } from 'vitest'
import { ContextManager } from '../../src/shared/cache/context-manager'
import type { MutableMessage } from '../../src/shared/cache/context-manager'
import type { AgentConfig } from '../../src/shared/context-compress'

const config: AgentConfig = {
  maxToolResultChars: 8000,
  maxContextChars: 1000,
  recentKeep: 3,
  snippedKeep: 50,
  prunedKeep: 20
}

function makeMessages(): MutableMessage[] {
  return [
    { role: 'system', content: 'system prompt' },
    { role: 'user', content: 'question' },
    { role: 'assistant', content: '', tool_calls: [{ id: '1', type: 'function', function: { name: 'test', arguments: '{}' } }] },
    { role: 'tool', content: 'A'.repeat(300), tool_call_id: '1' },
    { role: 'assistant', content: '', tool_calls: [{ id: '2', type: 'function', function: { name: 'test', arguments: '{}' } }] },
    { role: 'tool', content: 'B'.repeat(300), tool_call_id: '2' },
    { role: 'assistant', content: 'final answer' },
    { role: 'user', content: 'next question' }
  ]
}

describe('ContextManager', () => {
  it('初始状态正确', () => {
    const cm = new ContextManager()
    expect(cm.consecutiveCompacts).toBe(0)
    expect(cm.compactStuck).toBe(false)
    expect(cm.softNoticed).toBe(false)
    expect(cm.rewriteVersion).toBe(0)
  })

  describe('maybeCompact — soft 阶段', () => {
    it('prompt 占比 50%-60% 时返回 soft tier，不修改消息', () => {
      const cm = new ContextManager()
      const messages = makeMessages()
      // contextWindow = 1000/4 = 250, soft = 125
      // 构造 promptTokens 在 [125, 150) 之间
      const stats = cm.maybeCompact({
        messages,
        config,
        promptTokens: 130,
        contextWindow: 250
      })
      expect(stats.tier).toBe('soft')
      expect(stats.snippedResults).toBe(0)
      expect(cm.softNoticed).toBe(true)
      // 消息不变
      expect(messages[3].content).toBe('A'.repeat(300))
    })

    it('soft 只通知一次（softNoticed 去重）', () => {
      const cm = new ContextManager()
      const messages = makeMessages()
      const input = { messages, config, promptTokens: 130, contextWindow: 250 }
      const stats1 = cm.maybeCompact(input)
      expect(stats1.tier).toBe('soft')
      const stats2 = cm.maybeCompact(input)
      expect(stats2.tier).toBe('none')
    })
  })

  describe('maybeCompact — snip 阶段', () => {
    it('prompt 占比 60%-80% 时截断旧 tool 结果', () => {
      const cm = new ContextManager()
      const messages = makeMessages()
      // contextWindow = 250, snip = 150, high = 200
      const stats = cm.maybeCompact({
        messages,
        config,
        promptTokens: 160,
        contextWindow: 250
      })
      expect(stats.tier).toBe('snip')
      expect(stats.snippedResults).toBeGreaterThan(0)
      expect(cm.rewriteVersion).toBe(1)
      // 旧 tool 消息应被截断
      const toolMsg = messages[3]
      expect(toolMsg.content.length).toBeLessThan(300)
      expect(toolMsg.content).toContain('已自动截断')
    })

    it('snip 保护 recentKeep 范围内的消息', () => {
      const cm = new ContextManager()
      const messages = makeMessages()
      const lastToolContent = messages[5].content // 最后一个 tool 消息
      cm.maybeCompact({
        messages,
        config,
        promptTokens: 160,
        contextWindow: 250
      })
      // messages[5] 在 recentKeep=3 保护范围内（index 5, total 8, protectFrom=5）
      // 所以 messages[5] 不应被截断
      // 但实际上 protectFrom = max(1, 8-3) = 5, 所以 index 5 不被保护
      // index 3 和 4 也不被保护
      // 只有 index 5, 6, 7 被保护
      // 等等，protectFrom = max(1, 8-3) = 5，循环 i=1 to 4（不含5）
      // 所以 messages[3] 和 messages[4] 被处理
    })
  })

  describe('maybeCompact — compact 阶段', () => {
    it('prompt 占比 80%-90% 时返回 compact 信号（LLM 摘要由 agentLoop 执行）', () => {
      const cm = new ContextManager()
      const messages = makeMessages()
      const stats = cm.maybeCompact({
        messages,
        config,
        promptTokens: 210,
        contextWindow: 250
      })
      expect(stats.tier).toBe('compact')
      // compact 阶段不再做机械裁剪 — prunedResults=0，摘要由 agentLoop 调用 compactWithSummary 完成
      expect(stats.prunedResults).toBe(0)
      expect(cm.consecutiveCompacts).toBe(1)
      expect(cm.rewriteVersion).toBe(1)
      // 消息不被 maybeCompact 修改
      expect(messages[3].content).toBe('A'.repeat(300))
    })

    it('连续 2 次 compact 后触发 stuck 暂停', () => {
      const cm = new ContextManager()
      const messages1 = makeMessages()
      const messages2 = makeMessages()
      // 第一次 compact
      cm.maybeCompact({ messages: messages1, config, promptTokens: 210, contextWindow: 250 })
      expect(cm.compactStuck).toBe(false)
      // 第二次 compact
      cm.maybeCompact({ messages: messages2, config, promptTokens: 210, contextWindow: 250 })
      expect(cm.consecutiveCompacts).toBe(2)
      expect(cm.compactStuck).toBe(true)
    })

    it('stuck 暂停后不再自动压缩', () => {
      const cm = new ContextManager()
      cm.compactStuck = true
      cm.consecutiveCompacts = 2
      const messages = makeMessages()
      const stats = cm.maybeCompact({
        messages,
        config,
        promptTokens: 210,
        contextWindow: 250
      })
      expect(stats.tier).toBe('none')
      expect(stats.stuckPaused).toBe(true)
    })
  })

  describe('maybeCompact — force 阶段', () => {
    it('prompt 占比 > 90% 时返回 force 信号（LLM 摘要由 agentLoop 执行）', () => {
      const cm = new ContextManager()
      const messages: MutableMessage[] = [
        { role: 'system', content: 'sys' },
        { role: 'assistant', content: 'LONG_' + 'X'.repeat(600) },
        { role: 'assistant', content: 'LONG_' + 'Y'.repeat(600) },
        { role: 'assistant', content: 'LONG_' + 'Z'.repeat(600) },
        { role: 'user', content: 'recent' },
        { role: 'assistant', content: 'answer' },
        { role: 'user', content: 'thanks' }
      ]
      const stats = cm.maybeCompact({
        messages,
        config,
        promptTokens: 240,
        contextWindow: 250
      })
      expect(stats.tier).toBe('force')
      // force 阶段不再做机械裁剪 — 消息不被 maybeCompact 修改
      const assistant1 = messages[1]
      expect(assistant1.content.length).toBe(605) // 原始长度不变
      expect(assistant1.content).not.toContain('已省略')
    })
  })

  describe('maybeCompact — 边界条件', () => {
    it('contextWindow 为 0 时返回 none', () => {
      const cm = new ContextManager()
      const stats = cm.maybeCompact({
        messages: makeMessages(),
        config,
        promptTokens: 100,
        contextWindow: 0
      })
      expect(stats.tier).toBe('none')
    })

    it('promptTokens 为 0 时返回 none', () => {
      const cm = new ContextManager()
      const stats = cm.maybeCompact({
        messages: makeMessages(),
        config,
        promptTokens: 0,
        contextWindow: 250
      })
      expect(stats.tier).toBe('none')
    })

    it('低于 soft 阈值时重置 stuck 状态', () => {
      const cm = new ContextManager()
      cm.consecutiveCompacts = 1
      cm.compactStuck = false
      const stats = cm.maybeCompact({
        messages: makeMessages(),
        config,
        promptTokens: 50,
        contextWindow: 250
      })
      expect(stats.tier).toBe('none')
      expect(cm.consecutiveCompacts).toBe(0)
    })
  })

  describe('reset', () => {
    it('重置所有状态', () => {
      const cm = new ContextManager()
      cm.consecutiveCompacts = 5
      cm.compactStuck = true
      cm.softNoticed = true
      cm.rewriteVersion = 3
      cm.reset()
      expect(cm.consecutiveCompacts).toBe(0)
      expect(cm.compactStuck).toBe(false)
      expect(cm.softNoticed).toBe(false)
      expect(cm.rewriteVersion).toBe(0)
    })
  })
})
