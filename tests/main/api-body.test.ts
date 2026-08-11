import { describe, it, expect } from 'vitest'
import { buildRequestBody } from '../../src/main/deepseek/api'
import type { ToolDefinition } from '../../src/shared/types'

const MSGS = [
  { role: 'system', content: 'sys' },
  { role: 'user', content: 'hello' }
]

const REASONING_MSGS = [
  { role: 'assistant', content: 'ans', reasoning_content: 'thinking...' },
  { role: 'user', content: 'next' }
]

const TOOL: ToolDefinition = {
  name: 'demo_tool',
  description: 'demo',
  parameters: { type: 'object', properties: {} }
}

describe('deepseek/api — buildRequestBody 能力门控', () => {
  describe('caps 缺省（内置 DeepSeek 行为不变）', () => {
    it('包含 stream_options.include_usage', () => {
      const body = buildRequestBody('m', MSGS, undefined, false, 'off', 0.7, 8192)
      expect(body.stream_options).toEqual({ include_usage: true })
    })

    it('思考模式下写入 enable_thinking + reasoning_effort，不写 temperature', () => {
      const body = buildRequestBody('m', MSGS, undefined, true, 'high', 0.7, 8192)
      expect(body.enable_thinking).toBe(true)
      expect(body.reasoning_effort).toBe('high')
      expect(body.temperature).toBeUndefined()
    })

    it('ultra 映射为 max', () => {
      const body = buildRequestBody('m', MSGS, undefined, true, 'ultra', 0.7, 8192)
      expect(body.reasoning_effort).toBe('max')
    })

    it('关闭思考时写入 temperature', () => {
      const body = buildRequestBody('m', MSGS, undefined, false, 'off', 0.7, 8192)
      expect(body.temperature).toBe(0.7)
      expect(body.enable_thinking).toBeUndefined()
    })

    it('保留消息中的 reasoning_content 字段', () => {
      const body = buildRequestBody('m', REASONING_MSGS, undefined, true, 'high', 0.7, 8192)
      const msgs = body.messages as Record<string, unknown>[]
      expect(msgs[0].reasoning_content).toBe('thinking...')
    })

    it('工具映射为 function 形态且 tool_choice=auto', () => {
      const body = buildRequestBody('m', MSGS, [TOOL], false, 'off', 0.7, 8192)
      expect(body.tool_choice).toBe('auto')
      expect(body.tools).toEqual([
        { type: 'function', function: { name: 'demo_tool', description: 'demo', parameters: TOOL.parameters } }
      ])
    })
  })

  describe('sendReasoningParams=false（非 reasoning 服务商）', () => {
    const caps = { sendReasoningParams: false, sendStreamUsage: true }

    it('即使开启思考也不写 enable_thinking / reasoning_effort，改写 temperature', () => {
      const body = buildRequestBody('m', MSGS, undefined, true, 'max', 0.5, 8192, caps)
      expect(body.enable_thinking).toBeUndefined()
      expect(body.reasoning_effort).toBeUndefined()
      expect(body.temperature).toBe(0.5)
    })

    it('剥离消息中的 reasoning_content 字段', () => {
      const body = buildRequestBody('m', REASONING_MSGS, undefined, false, 'off', 0.7, 8192, caps)
      const msgs = body.messages as Record<string, unknown>[]
      expect('reasoning_content' in msgs[0]).toBe(false)
      expect(msgs[0].content).toBe('ans')
    })
  })

  describe('sendStreamUsage=false', () => {
    it('不写 stream_options', () => {
      const body = buildRequestBody('m', MSGS, undefined, false, 'off', 0.7, 8192, {
        sendReasoningParams: true,
        sendStreamUsage: false
      })
      expect(body.stream_options).toBeUndefined()
    })
  })

  describe('基础字段', () => {
    it('model / stream / max_tokens 恒存在', () => {
      const body = buildRequestBody('my-model', MSGS, undefined, false, 'off', 0.7, 4096)
      expect(body.model).toBe('my-model')
      expect(body.stream).toBe(true)
      expect(body.max_tokens).toBe(4096)
    })
  })
})
