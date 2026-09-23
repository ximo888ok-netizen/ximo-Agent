import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ApiMessage, Conversation } from '@shared/types'
import { buildApiMessages } from '@renderer/store/buildApiMessages'

/**
 * A2' reasoning_content 回传 —— DeepSeek 思考模式硬约束
 *
 * 官方规格（api-docs.deepseek.com/guides/thinking_mode）：
 * 请求携带 tools 参数时，历史里**所有** assistant 轮的 reasoning_content 都必须
 * 原样回传 —— 包括没有发生工具调用的轮次。回传不正确直接 400：
 * 「The reasoning_content in the thinking mode must be passed back to the API」
 *
 * 修复前的行为：纯文本 assistant 轮完全不回传（主要触发点）；
 *             工具调用轮回传空串（等于思维链丢失）。
 */

/** buildApiMessages 会读这两个 IPC 口子，node 环境下给最小替身 */
function stubWindow(): void {
  ;(globalThis as unknown as { window: unknown }).window = {
    api: {
      importedSkills: { load: async (): Promise<unknown[]> => [] },
      memory: { load: async (): Promise<string> => '' }
    }
  }
}

function makeConversation(messages: Conversation['messages']): Conversation {
  return {
    id: 'conv-1',
    title: 't',
    mode: 'office',
    messages,
    createdAt: 0,
    updatedAt: 0
  }
}

/** 与 runStream.ts 的调用顺序一致：第 11 个参数是 reasoningEffort，第 13 个是 thinkingMode */
function build(
  messages: Conversation['messages'],
  thinkingMode: boolean,
  reasoningEffort: 'off' | 'high' | 'max' | 'ultra' = 'high'
): Promise<ApiMessage[]> {
  return buildApiMessages(
    makeConversation(messages),
    undefined, undefined, undefined,
    undefined, undefined, undefined,
    undefined, undefined,
    undefined,
    reasoningEffort, false, thinkingMode
  )
}

const assistants = (msgs: ApiMessage[]): ApiMessage[] => msgs.filter((m) => m.role === 'assistant')

describe('buildApiMessages — reasoning_content 回传', () => {
  beforeEach(() => {
    stubWindow()
  })

  it('思考模式：纯文本 assistant 轮必须回传真实思维链', async () => {
    const msgs = await build([
      { id: 'u1', role: 'user', content: 'q1', timestamp: 1 },
      { id: 'a1', role: 'assistant', content: 'a1', reasoningContent: '我先想了 A 再想了 B', timestamp: 2 },
      { id: 'u2', role: 'user', content: 'q2', timestamp: 3 }
    ], true)

    const a = assistants(msgs)[0]!
    expect(a).toBeDefined()
    expect(a.reasoning_content).toBe('我先想了 A 再想了 B')
  })

  it('思考模式：工具调用轮回传真实思维链而不是空串', async () => {
    const msgs = await build([
      { id: 'u1', role: 'user', content: 'q1', timestamp: 1 },
      {
        id: 'a1', role: 'assistant', content: '', reasoningContent: '先读文件再改',
        toolCalls: [{ id: 'tc1', name: 'file_read', arguments: { filePath: '/a.txt' } }],
        toolResults: [{ toolCallId: 'tc1', toolName: 'file_read', content: 'body', success: true }],
        timestamp: 2
      }
    ], true)

    const a = assistants(msgs)[0]!
    expect(a.reasoning_content).toBe('先读文件再改')
    expect(a.tool_calls).toHaveLength(1)
    // tool 配对不能断
    expect(msgs.some((m) => m.role === 'tool' && m.tool_call_id === 'tc1')).toBe(true)
  })

  it('思考模式：历史消息没有存思维链时，字段仍须存在（补空串）', async () => {
    const msgs = await build([
      { id: 'u1', role: 'user', content: 'q1', timestamp: 1 },
      // 思考模式关闭时期产生的历史消息
      { id: 'a1', role: 'assistant', content: 'a1', timestamp: 2 }
    ], true)

    const a = assistants(msgs)[0]!
    expect('reasoning_content' in a).toBe(true)
    expect(a.reasoning_content).toBe('')
  })

  it('非思考模式：不往请求体里注入无意义的空字段', async () => {
    const msgs = await build([
      { id: 'u1', role: 'user', content: 'q1', timestamp: 1 },
      { id: 'a1', role: 'assistant', content: 'a1', timestamp: 2 }
    ], false, 'off')

    const a = assistants(msgs)[0]!
    expect('reasoning_content' in a).toBe(false)
  })

  it('非思考模式但历史存有思维链：仍须回传（用户中途关掉思考，旧思维链不能丢）', async () => {
    const msgs = await build([
      { id: 'u1', role: 'user', content: 'q1', timestamp: 1 },
      { id: 'a1', role: 'assistant', content: 'a1', reasoningContent: '旧的思考', timestamp: 2 }
    ], false, 'off')

    const a = assistants(msgs)[0]!
    expect(a.reasoning_content).toBe('旧的思考')
  })

  it('工具配对不完整时降级为文本说明，且不留孤儿 tool_calls', async () => {
    const msgs = await build([
      { id: 'u1', role: 'user', content: 'q1', timestamp: 1 },
      {
        id: 'a1', role: 'assistant', content: '', reasoningContent: '想了',
        toolCalls: [{ id: 'tc1', name: 'file_read', arguments: {} }],
        // 故意不给 toolResults → 配对不完整
        timestamp: 2
      }
    ], true)

    const a = assistants(msgs)[0]!
    expect(a.tool_calls).toBeUndefined()
    expect(a.content).toContain('file_read')
  })

  it('system / user 轮不受影响', async () => {
    const msgs = await build([
      { id: 'u1', role: 'user', content: 'q1', timestamp: 1 }
    ], true)

    const user = msgs.find((m) => m.role === 'user')!
    expect(user.content).toBe('q1')
    expect('reasoning_content' in user).toBe(false)
    expect(msgs[0]!.role).toBe('system')
  })
})

// 避免 vitest 因为未使用的导入报错（vi 在其它用例中按需使用）
void vi
