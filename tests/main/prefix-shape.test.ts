import { describe, it, expect } from 'vitest'
import { captureShape, compareShape } from '../../src/main/cache/prefix-shape'
import type { ToolDefinition } from '../../src/shared/types'
import type { PrefixShape, NormalizedUsage } from '../../src/shared/cache/types'

function makeTool(name: string, description = 'desc'): ToolDefinition {
  return {
    name,
    description,
    parameters: { type: 'object', properties: {} }
  }
}

describe('prefix-shape', () => {
  describe('captureShape', () => {
    it('返回包含所有必填字段', () => {
      const shape = captureShape('system prompt', [makeTool('tool_a')], 0)
      expect(shape).toHaveProperty('systemHash')
      expect(shape).toHaveProperty('toolsHash')
      expect(shape).toHaveProperty('prefixHash')
      expect(shape).toHaveProperty('logRewriteVersion')
      expect(shape).toHaveProperty('toolSchemaTokens')
    })

    it('相同输入产生相同 systemHash', () => {
      const shape1 = captureShape('same prompt', [], 0)
      const shape2 = captureShape('same prompt', [], 0)
      expect(shape1.systemHash).toBe(shape2.systemHash)
    })

    it('不同 system prompt 产生不同 systemHash', () => {
      const shape1 = captureShape('prompt A', [], 0)
      const shape2 = captureShape('prompt B', [], 0)
      expect(shape1.systemHash).not.toBe(shape2.systemHash)
    })

    it('相同工具集产生相同 toolsHash', () => {
      const tools = [makeTool('a'), makeTool('b')]
      const shape1 = captureShape('sys', tools, 0)
      const shape2 = captureShape('sys', [...tools].reverse(), 0)
      // normalizeToolSchemas 排序后相同
      expect(shape1.toolsHash).toBe(shape2.toolsHash)
    })

    it('不同工具集产生不同 toolsHash', () => {
      const shape1 = captureShape('sys', [makeTool('a')], 0)
      const shape2 = captureShape('sys', [makeTool('b')], 0)
      expect(shape1.toolsHash).not.toBe(shape2.toolsHash)
    })

    it('prefixHash 是 system + tools 的组合哈希', () => {
      const shape = captureShape('sys', [makeTool('a')], 0)
      // prefixHash 应该与 systemHash + toolsHash 的组合相关
      expect(shape.prefixHash).toBeDefined()
      expect(shape.prefixHash).toHaveLength(8)
    })

    it('logRewriteVersion 正确传递', () => {
      expect(captureShape('sys', [], 0).logRewriteVersion).toBe(0)
      expect(captureShape('sys', [], 5).logRewriteVersion).toBe(5)
      expect(captureShape('sys', [], 10).logRewriteVersion).toBe(10)
    })

    it('toolSchemaTokens 为正数（当有工具时）', () => {
      const shape = captureShape('sys', [makeTool('a', 'a long description')], 0)
      expect(shape.toolSchemaTokens).toBeGreaterThan(0)
    })

    it('无工具时 toolSchemaTokens 为 0 或较小值', () => {
      const shape = captureShape('sys', [], 0)
      expect(shape.toolSchemaTokens).toBeLessThanOrEqual(1)
    })

    it('哈希值为 8 字符十六进制字符串', () => {
      const shape = captureShape('sys', [makeTool('a')], 0)
      expect(shape.systemHash).toMatch(/^[0-9a-f]{8}$/)
      expect(shape.toolsHash).toMatch(/^[0-9a-f]{8}$/)
      expect(shape.prefixHash).toMatch(/^[0-9a-f]{8}$/)
    })
  })

  describe('compareShape', () => {
    it('完全相同的前缀不报告变化', () => {
      const shape = captureShape('sys', [makeTool('a')], 0)
      const diag = compareShape(shape, shape)
      expect(diag.prefixChanged).toBe(false)
      expect(diag.prefixChangeReasons).toEqual([])
    })

    it('system prompt 变化报告 system 原因', () => {
      const prev = captureShape('prompt A', [makeTool('a')], 0)
      const cur = captureShape('prompt B', [makeTool('a')], 0)
      const diag = compareShape(prev, cur)
      expect(diag.prefixChanged).toBe(true)
      expect(diag.prefixChangeReasons).toContain('system')
    })

    it('工具集变化报告 tools 原因', () => {
      const prev = captureShape('sys', [makeTool('a')], 0)
      const cur = captureShape('sys', [makeTool('b')], 0)
      const diag = compareShape(prev, cur)
      expect(diag.prefixChanged).toBe(true)
      expect(diag.prefixChangeReasons).toContain('tools')
    })

    it('rewriteVersion 变化报告 log_rewrite 原因', () => {
      const prev = captureShape('sys', [makeTool('a')], 0)
      const cur = captureShape('sys', [makeTool('a')], 1)
      const diag = compareShape(prev, cur)
      expect(diag.prefixChanged).toBe(true)
      expect(diag.prefixChangeReasons).toContain('log_rewrite')
    })

    it('同时变化报告多个原因', () => {
      const prev = captureShape('prompt A', [makeTool('a')], 0)
      const cur = captureShape('prompt B', [makeTool('b')], 1)
      const diag = compareShape(prev, cur)
      expect(diag.prefixChanged).toBe(true)
      expect(diag.prefixChangeReasons).toContain('system')
      expect(diag.prefixChangeReasons).toContain('tools')
      expect(diag.prefixChangeReasons).toContain('log_rewrite')
    })

    it('usage 为 null 时 cache tokens 为 0', () => {
      const shape = captureShape('sys', [], 0)
      const diag = compareShape(shape, shape, null)
      expect(diag.cacheHitTokens).toBe(0)
      expect(diag.cacheMissTokens).toBe(0)
    })

    it('usage 提供时正确传递 cache tokens', () => {
      const shape = captureShape('sys', [], 0)
      const usage: NormalizedUsage = {
        promptTokens: 1000,
        completionTokens: 200,
        totalTokens: 1200,
        cacheHitTokens: 800,
        cacheMissTokens: 200,
        reasoningTokens: 0,
        finishReason: 'stop'
      }
      const diag = compareShape(shape, shape, usage)
      expect(diag.cacheHitTokens).toBe(800)
      expect(diag.cacheMissTokens).toBe(200)
    })

    it('前一个 shape 的 systemHash 为空时不报告 system 变化', () => {
      const prev: PrefixShape = {
        systemHash: '',
        toolsHash: 'abc',
        prefixHash: 'def',
        logRewriteVersion: 0,
        toolSchemaTokens: 0
      }
      const cur = captureShape('new sys', [makeTool('a')], 0)
      const diag = compareShape(prev, cur)
      // systemHash 为空时不触发 system 变化检测
      expect(diag.prefixChangeReasons).not.toContain('system')
    })

    it('前一个 shape 的 toolsHash 为空时不报告 tools 变化', () => {
      const prev: PrefixShape = {
        systemHash: 'abc',
        toolsHash: '',
        prefixHash: 'def',
        logRewriteVersion: 0,
        toolSchemaTokens: 0
      }
      const cur = captureShape('same', [makeTool('a')], 0)
      const diag = compareShape(prev, cur)
      expect(diag.prefixChangeReasons).not.toContain('tools')
    })
  })
})
