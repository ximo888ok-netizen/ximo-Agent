import { describe, it, expect } from 'vitest'
import { normalizeToolSchemas } from '../../src/shared/cache/tool-normalize'
import type { ToolDefinition } from '../../src/shared/types'

function makeTool(name: string, description = 'desc', params?: Record<string, unknown>): ToolDefinition {
  return {
    name,
    description,
    parameters: params ?? { type: 'object', properties: {} }
  }
}

describe('normalizeToolSchemas', () => {
  it('空数组返回空数组', () => {
    expect(normalizeToolSchemas([])).toEqual([])
  })

  it('单个工具原样返回', () => {
    const tool = makeTool('alpha')
    const result = normalizeToolSchemas([tool])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('alpha')
  })

  it('按工具名字典序排序', () => {
    const tools = [
      makeTool('zebra'),
      makeTool('alpha'),
      makeTool('middle')
    ]
    const result = normalizeToolSchemas(tools)
    expect(result.map(t => t.name)).toEqual(['alpha', 'middle', 'zebra'])
  })

  it('同名工具按 description 字典序排序', () => {
    const tools = [
      makeTool('same', 'zeta description'),
      makeTool('same', 'alpha description'),
      makeTool('same', 'middle description')
    ]
    const result = normalizeToolSchemas(tools)
    expect(result.map(t => t.description)).toEqual([
      'alpha description',
      'middle description',
      'zeta description'
    ])
  })

  it('不修改原数组（返回新数组）', () => {
    const tools = [makeTool('b'), makeTool('a')]
    const original = [...tools]
    normalizeToolSchemas(tools)
    expect(tools).toEqual(original)
  })

  it('相同工具集不同输入顺序产生相同输出', () => {
    const setA = [makeTool('c'), makeTool('a'), makeTool('b')]
    const setB = [makeTool('b'), makeTool('c'), makeTool('a')]
    const resultA = normalizeToolSchemas(setA)
    const resultB = normalizeToolSchemas(setB)
    expect(resultA).toEqual(resultB)
  })

  it('名称和描述都相同时按 parameters JSON 字典序排序', () => {
    const tool1 = makeTool('same', 'desc', { type: 'object', properties: { z: { type: 'string' } } })
    const tool2 = makeTool('same', 'desc', { type: 'object', properties: { a: { type: 'string' } } })
    const result = normalizeToolSchemas([tool1, tool2])
    // tool2 的 parameters JSON（{"type":"object","properties":{"a"...）字典序在 tool1（{"type":"object","properties":{"z"...）之前
    expect(result[0].parameters.properties).toHaveProperty('a')
    expect(result[1].parameters.properties).toHaveProperty('z')
  })

  it('大量工具排序正确', () => {
    const names = Array.from({ length: 50 }, (_, i) => `tool_${i.toString().padStart(2, '0')}`)
    const shuffled = [...names].reverse()
    const tools = shuffled.map(n => makeTool(n))
    const result = normalizeToolSchemas(tools)
    expect(result.map(t => t.name)).toEqual(names)
  })
})
