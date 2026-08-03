import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SingleCallResult } from '../../src/main/deepseek/types'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk, ToolContext } from '../../src/shared/types'
import type { Tool } from '../../src/main/tools/Tool'

// ---- Mock 依赖 Electron / fetch 的模块 ----

vi.mock('../../src/main/deepseek/api', () => ({
  callDeepSeekStream: vi.fn(),
  toApiEffort: (effort: string) => (effort === 'ultra' ? 'max' : effort)
}))

vi.mock('../../src/main/SkillStore', () => ({
  isRecording: vi.fn(() => false),
  appendStep: vi.fn(),
  getRecordingSession: vi.fn(() => null),
  getRrwebEventCount: vi.fn(() => 0)
}))

vi.mock('../../src/main/deepseek/supervisor', () => ({
  runSupervisionCheck: vi.fn(() => Promise.resolve(null)),
  needsCorrection: vi.fn(() => false),
  buildCorrectionMessage: vi.fn(() => '')
}))

// ---- 导入被测模块（vi.mock 已 hoisted，mock 在导入前生效）----

import { agentLoop } from '../../src/main/deepseek/agent-loop'
import { callDeepSeekStream } from '../../src/main/deepseek/api'
import { toolRegistry } from '../../src/main/tools'
import { configureAgentLoop } from '../../src/main/deepseek/context'

const mockCallDeepSeek = callDeepSeekStream as ReturnType<typeof vi.fn>

// ---- 辅助函数 ----

function makeHandlers(): {
  onChunk: ReturnType<typeof vi.fn>
  signal: undefined
  yoloMode: boolean
  autoModeLevel: 'off' | 'safe' | 'yolo'
  requestConfirmation?: (toolName: string, msg: string) => Promise<boolean>
} {
  return {
    onChunk: vi.fn(),
    signal: undefined,
    yoloMode: false,
    autoModeLevel: 'off'
  }
}

function makeRequest(tools?: ToolDefinition[]) {
  return {
    mode: 'coding' as const,
    messages: [
      { role: 'system' as const, content: 'You are a helpful assistant.' },
      { role: 'user' as const, content: 'Hello' }
    ],
    model: 'deepseek-v4-pro' as const,
    thinkingMode: false,
    reasoningEffort: 'off' as const,
    temperature: 0.7,
    maxTokens: 4096,
    tools: tools || []
  }
}

function makeStopResult(content = 'Done!'): SingleCallResult {
  return {
    finishReason: 'stop',
    content,
    reasoningContent: '',
    toolCalls: [],
    emitted: true
  }
}

function makeToolCallResult(name: string, args: Record<string, unknown> = {}): SingleCallResult {
  return {
    finishReason: 'tool_calls',
    content: '',
    reasoningContent: '',
    toolCalls: [{ id: 'tc_1', name, arguments: args }],
    emitted: true
  }
}

function makeMockTool(name: string, result: ToolResult): Tool {
  return {
    definition: {
      name,
      description: 'mock tool',
      parameters: { type: 'object' as const, properties: {} }
    },
    async execute(_tc: ToolCall): Promise<ToolResult> {
      return result
    }
  }
}

// ---- 测试 ----

describe('agentLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 重置 agentConfig 为合理默认值
    configureAgentLoop({ maxToolRounds: 30 })
  })

  it('API Key 为空时返回错误', async () => {
    const handlers = makeHandlers()
    await agentLoop('', 'https://api.deepseek.com/v1', makeRequest(), handlers as any)

    const chunks = handlers.onChunk.mock.calls.map(c => c[0] as StreamChunk)
    const lastChunk = chunks[chunks.length - 1]
    expect(lastChunk.done).toBe(true)
    expect(lastChunk.error).toContain('API Key')
    // 不应调用 API
    expect(mockCallDeepSeek).not.toHaveBeenCalled()
  })

  it('LLM 直接返回 stop 时正常结束', async () => {
    mockCallDeepSeek.mockResolvedValue(makeStopResult('Hello world!'))
    const handlers = makeHandlers()

    await agentLoop('sk-test', 'https://api.deepseek.com/v1', makeRequest(), handlers as any)

    const chunks = handlers.onChunk.mock.calls.map(c => c[0] as StreamChunk)
    const doneChunk = chunks.find(c => c.done)
    expect(doneChunk).toBeDefined()
    // API 应被调用一次
    expect(mockCallDeepSeek).toHaveBeenCalledTimes(1)
  })

  it('LLM 请求工具调用 → 工具成功 → 下一轮 stop', async () => {
    const toolResult: ToolResult = {
      toolCallId: 'tc_1',
      toolName: 'file_read',
      content: 'file content here',
      success: true
    }
    const mockTool = makeMockTool('file_read', toolResult)
    toolRegistry.register(mockTool)

    // 第一次返回 tool_calls，第二次返回 stop
    mockCallDeepSeek
      .mockResolvedValueOnce(makeToolCallResult('file_read', { filePath: '/test.txt' }))
      .mockResolvedValueOnce(makeStopResult('Here is the file content: file content here'))

    const handlers = makeHandlers()
    await agentLoop('sk-test', 'https://api.deepseek.com/v1', makeRequest(), handlers as any)

    // API 应被调用 2 次（工具调用 + 总结）
    expect(mockCallDeepSeek).toHaveBeenCalledTimes(2)
    // 应有 toolStatus calling 和 done 事件
    const chunks = handlers.onChunk.mock.calls.map(c => c[0] as StreamChunk)
    expect(chunks.some(c => c.toolStatus === 'calling' && c.toolName === 'file_read')).toBe(true)
    expect(chunks.some(c => c.toolStatus === 'done' && c.toolName === 'file_read')).toBe(true)
    // 应有 toolResult
    expect(chunks.some(c => c.toolResult?.success === true)).toBe(true)
  })

  it('权限拒绝时返回拒绝消息作为工具结果', async () => {
    const mockTool = makeMockTool('act_ui', {
      toolCallId: 'tc_1',
      toolName: 'act_ui',
      content: 'ok',
      success: true
    })
    toolRegistry.register(mockTool)

    // coding 模式 deny act_ui
    mockCallDeepSeek.mockResolvedValueOnce(makeToolCallResult('act_ui'))
    mockCallDeepSeek.mockResolvedValueOnce(makeStopResult('OK'))

    const handlers = makeHandlers()
    const request = makeRequest()
    await agentLoop('sk-test', 'https://api.deepseek.com/v1', request, handlers as any)

    const chunks = handlers.onChunk.mock.calls.map(c => c[0] as StreamChunk)
    // 应有拒绝结果的 toolResult
    const denied = chunks.find(c => c.toolResult?.success === false)
    expect(denied).toBeDefined()
    expect(denied!.toolResult!.error).toContain('权限拒绝')
  })

  it('工具执行失败时错误信息传给 LLM', async () => {
    const failingTool: Tool = {
      definition: {
        name: 'file_read',
        description: 'mock',
        parameters: { type: 'object', properties: {} }
      },
      async execute(_tc: ToolCall): Promise<ToolResult> {
        return {
          toolCallId: _tc.id,
          toolName: 'file_read',
          content: '',
          success: false,
          error: 'File not found'
        }
      }
    }
    toolRegistry.register(failingTool)

    mockCallDeepSeek
      .mockResolvedValueOnce(makeToolCallResult('file_read', { filePath: '/missing.txt' }))
      .mockResolvedValueOnce(makeStopResult('File not found, sorry.'))

    const handlers = makeHandlers()
    await agentLoop('sk-test', 'https://api.deepseek.com/v1', makeRequest(), handlers as any)

    const chunks = handlers.onChunk.mock.calls.map(c => c[0] as StreamChunk)
    const failedResult = chunks.find(c => c.toolResult?.success === false)
    expect(failedResult).toBeDefined()
    expect(failedResult!.toolResult!.error).toContain('File not found')
  })

  it('达到 maxToolRounds 时强制总结', async () => {
    // 设置 maxToolRounds = 1
    configureAgentLoop({ maxToolRounds: 1 })

    // 每次都返回 tool_calls（无限循环）
    const mockTool = makeMockTool('file_read', {
      toolCallId: 'tc_1',
      toolName: 'file_read',
      content: 'content',
      success: true
    })
    toolRegistry.register(mockTool)

    mockCallDeepSeek.mockResolvedValue(makeToolCallResult('file_read'))

    const handlers = makeHandlers()
    await agentLoop('sk-test', 'https://api.deepseek.com/v1', makeRequest(), handlers as any)

    // 应调用 2 次：1 次工具调用 + 1 次强制总结
    expect(mockCallDeepSeek).toHaveBeenCalledTimes(2)
    // 最后一次调用不应传 tools
    const lastCall = mockCallDeepSeek.mock.calls[mockCallDeepSeek.mock.calls.length - 1]
    const lastCallTools = lastCall[4] // tools 参数是第 5 个参数
    expect(lastCallTools).toBeUndefined()
    // 应有 done
    const chunks = handlers.onChunk.mock.calls.map(c => c[0] as StreamChunk)
    expect(chunks.some(c => c.done)).toBe(true)
  })

  it('abort signal 中断时立即退出', async () => {
    const controller = new AbortController()
    mockCallDeepSeek.mockResolvedValue(makeStopResult('Hello'))

    const handlers = {
      ...makeHandlers(),
      signal: controller.signal
    }

    // 在调用前 abort
    controller.abort()

    await agentLoop('sk-test', 'https://api.deepseek.com/v1', makeRequest(), handlers as any)

    const chunks = handlers.onChunk.mock.calls.map(c => c[0] as StreamChunk)
    // 应有 done（abort 后直接结束）
    expect(chunks.some(c => c.done)).toBe(true)
  })

  it('LLM 返回 error finishReason 时上报错误', async () => {
    mockCallDeepSeek.mockResolvedValue({
      finishReason: 'error',
      content: '',
      reasoningContent: '',
      toolCalls: [],
      error: 'API rate limit exceeded',
      emitted: false
    })

    const handlers = makeHandlers()
    await agentLoop('sk-test', 'https://api.deepseek.com/v1', makeRequest(), handlers as any)

    const chunks = handlers.onChunk.mock.calls.map(c => c[0] as StreamChunk)
    const errorChunk = chunks.find(c => c.error)
    expect(errorChunk).toBeDefined()
    expect(errorChunk!.error).toContain('rate limit')
  })

  it('todo_write 标记全部完成 → 剥离工具 → 下一轮强制 stop', async () => {
    const todoResult: ToolResult = {
      toolCallId: 'tc_1',
      toolName: 'todo_write',
      content: '任务列表已更新',
      success: true,
      metadata: { todos: [], total: 2, done: 2, active: 0, pending: 0 }
    }
    toolRegistry.register(makeMockTool('todo_write', todoResult))

    const toolDef: ToolDefinition = {
      name: 'todo_write',
      description: 'test todo tool',
      parameters: { type: 'object' as const, properties: {} }
    }

    // 第一次返回 todo_write 工具调用，第二次应被强制 stop（tools 已剥离）
    mockCallDeepSeek
      .mockResolvedValueOnce(makeToolCallResult('todo_write', { todos: [] }))
      .mockResolvedValueOnce(makeStopResult('所有任务已完成'))

    const handlers = makeHandlers()
    await agentLoop('sk-test', 'https://api.deepseek.com/v1', makeRequest([toolDef]), handlers as any)

    // API 应被调用 2 次：工具调用 + 强制总结
    expect(mockCallDeepSeek).toHaveBeenCalledTimes(2)
    // 第二次调用不应传 tools（第 5 个参数）
    const secondCall = mockCallDeepSeek.mock.calls[1]
    const secondCallTools = secondCall[4]
    expect(secondCallTools).toBeUndefined()
    // 应有 done
    const chunks = handlers.onChunk.mock.calls.map(c => c[0] as StreamChunk)
    expect(chunks.some(c => c.done)).toBe(true)
  })

  it('todo_write 还有 pending 项 → 循环继续不剥离工具', async () => {
    const todoResult: ToolResult = {
      toolCallId: 'tc_1',
      toolName: 'todo_write',
      content: '任务列表已更新',
      success: true,
      metadata: { todos: [], total: 3, done: 1, active: 1, pending: 1 }
    }
    toolRegistry.register(makeMockTool('todo_write', todoResult))

    const toolDef: ToolDefinition = {
      name: 'todo_write',
      description: 'test todo tool',
      parameters: { type: 'object' as const, properties: {} }
    }

    mockCallDeepSeek
      .mockResolvedValueOnce(makeToolCallResult('todo_write', { todos: [] }))
      .mockResolvedValueOnce(makeStopResult('继续工作'))

    const handlers = makeHandlers()
    await agentLoop('sk-test', 'https://api.deepseek.com/v1', makeRequest([toolDef]), handlers as any)

    expect(mockCallDeepSeek).toHaveBeenCalledTimes(2)
    // 第二次调用应仍传 tools（第 5 个参数不为 undefined）
    const secondCall = mockCallDeepSeek.mock.calls[1]
    const secondCallTools = secondCall[4]
    expect(secondCallTools).toBeDefined()
  })

  it('用户确认拒绝时工具结果为取消', async () => {
    const mockTool = makeMockTool('terminal_exec', {
      toolCallId: 'tc_1',
      toolName: 'terminal_exec',
      content: 'ok',
      success: true
    })
    toolRegistry.register(mockTool)

    // coding 模式 ask terminal_exec
    mockCallDeepSeek
      .mockResolvedValueOnce(makeToolCallResult('terminal_exec', { command: 'rm -rf /' }))
      .mockResolvedValueOnce(makeStopResult('Cancelled.'))

    const handlers = {
      ...makeHandlers(),
      requestConfirmation: vi.fn().mockResolvedValue(false)
    }

    await agentLoop('sk-test', 'https://api.deepseek.com/v1', makeRequest(), handlers as any)

    const chunks = handlers.onChunk.mock.calls.map(c => c[0] as StreamChunk)
    const cancelled = chunks.find(c => c.toolResult?.success === false && c.toolResult?.error?.includes('取消'))
    expect(cancelled).toBeDefined()
  })
})
