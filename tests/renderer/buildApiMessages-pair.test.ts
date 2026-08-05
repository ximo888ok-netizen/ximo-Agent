/**
 * buildApiMessages 工具调用配对完整性测试
 *
 * 验证：assistant.tool_calls 与 toolResults 数量不匹配（工具执行中断/部分结果丢失）时，
 * 放弃 tool_calls 结构转文本，避免产生孤儿 tool_calls 触发 DeepSeek 400。
 */
import { describe, it, expect } from 'vitest'
import { isToolPairComplete, buildInterruptedToolNote } from '../../src/shared/tool-pair'

const mkCall = (id: string) => ({ id, name: 'file_read', arguments: { filePath: '/a.txt' } })
const mkResult = (id: string) => ({ toolCallId: id, toolName: 'file_read', content: 'ok', success: true })

describe('isToolPairComplete — tool_calls ↔ tool 响应配对完整性', () => {
  it('数量相等且 ID 全部对应 → 完整', () => {
    expect(isToolPairComplete([mkCall('a'), mkCall('b')], [mkResult('a'), mkResult('b')])).toBe(true)
  })

  it('toolCalls 多于 toolResults（部分结果丢失）→ 不完整', () => {
    expect(isToolPairComplete([mkCall('a'), mkCall('b')], [mkResult('a')])).toBe(false)
  })

  it('toolResults 多于 toolCalls（冗余结果）→ 不完整', () => {
    expect(isToolPairComplete([mkCall('a')], [mkResult('a'), mkResult('b')])).toBe(false)
  })

  it('数量相等但 ID 不匹配（乱序/错位）→ 不完整', () => {
    expect(isToolPairComplete([mkCall('a'), mkCall('b')], [mkResult('b'), mkResult('c')])).toBe(false)
  })

  it('空 toolCalls → 视为完整（无工具调用）', () => {
    expect(isToolPairComplete([], [])).toBe(true)
  })

  it('toolResults 为 undefined → 不完整（有调用无结果）', () => {
    expect(isToolPairComplete([mkCall('a')], undefined as never)).toBe(false)
  })
})

describe('buildInterruptedToolNote — 中断说明文本', () => {
  it('列出已完成的工具结果摘要', () => {
    const note = buildInterruptedToolNote([mkCall('a'), mkCall('b')], [mkResult('a')])
    expect(note).toContain('file_read')
    expect(note).toContain('工具调用被中断')
  })

  it('无任何结果时给出通用说明', () => {
    const note = buildInterruptedToolNote([mkCall('a')], [])
    expect(note).toContain('工具调用被中断')
  })
})
