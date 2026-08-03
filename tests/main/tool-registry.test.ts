import { describe, it, expect, beforeEach } from 'vitest'
import { ToolRegistry, toolRegistry } from '../../src/main/tools/ToolRegistry'
import type { Tool } from '../../src/main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk, ToolContext } from '../../src/shared/types'

function makeTool(name: string, description = 'test tool'): Tool {
  return {
    definition: {
      name,
      description,
      parameters: { type: 'object', properties: {} }
    },
    async execute(_tc: ToolCall, _onChunk?: (c: StreamChunk) => void, _signal?: AbortSignal, _ctx?: ToolContext): Promise<ToolResult> {
      return { toolCallId: _tc.id, toolName: name, content: 'ok', success: true }
    }
  }
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry

  beforeEach(() => {
    registry = new ToolRegistry()
  })

  describe('register & get', () => {
    it('注册后可按名获取', () => {
      const tool = makeTool('test_tool')
      registry.register(tool)
      expect(registry.get('test_tool')).toBe(tool)
    })

    it('未注册的工具返回 undefined', () => {
      expect(registry.get('nonexistent')).toBeUndefined()
    })

    it('重复注册覆盖旧工具', () => {
      const tool1 = makeTool('dup', 'first')
      const tool2 = makeTool('dup', 'second')
      registry.register(tool1)
      registry.register(tool2)
      expect(registry.get('dup')).toBe(tool2)
    })
  })

  describe('getByNames', () => {
    it('按名列表获取多个工具', () => {
      registry.register(makeTool('a'))
      registry.register(makeTool('b'))
      registry.register(makeTool('c'))
      const tools = registry.getByNames(['a', 'c'])
      expect(tools).toHaveLength(2)
      expect(tools.map(t => t.definition.name)).toEqual(['a', 'c'])
    })

    it('包含未注册名称时跳过', () => {
      registry.register(makeTool('a'))
      const tools = registry.getByNames(['a', 'nonexistent'])
      expect(tools).toHaveLength(1)
      expect(tools[0].definition.name).toBe('a')
    })

    it('空列表返回空数组', () => {
      expect(registry.getByNames([])).toEqual([])
    })

    it('全部未注册返回空数组', () => {
      expect(registry.getByNames(['x', 'y', 'z'])).toEqual([])
    })
  })

  describe('has', () => {
    it('已注册返回 true', () => {
      registry.register(makeTool('exists'))
      expect(registry.has('exists')).toBe(true)
    })

    it('未注册返回 false', () => {
      expect(registry.has('not_exists')).toBe(false)
    })
  })

  describe('toolRegistry 全局单例', () => {
    it('是 ToolRegistry 实例', () => {
      expect(toolRegistry).toBeInstanceOf(ToolRegistry)
    })

    it('注册和获取功能正常', () => {
      const tool = makeTool('singleton_test')
      toolRegistry.register(tool)
      expect(toolRegistry.has('singleton_test')).toBe(true)
      expect(toolRegistry.get('singleton_test')).toBe(tool)
    })
  })
})
