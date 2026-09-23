/**
 * transcriptAdapter 顺序测试
 *
 * 核心断言：流式渲染必须**按真实发生顺序交错**输出推理与工具，
 * 而不是「先把推理拼成一大段，再把所有工具框堆在最后」。
 *
 * 这个 bug 的现象是：一轮里模型「推理 → 调工具 → 再推理 → 再调工具」，
 * 界面上却显示成「推理、推理、工具、工具」—— 工具像被固定在底部。
 *
 * 依据是 StreamingSegment.events（有序事件流），它按实际发生顺序记录。
 */
import { describe, it, expect } from 'vitest'
import { adaptMessages } from '../../src/renderer/src/lib/transcriptAdapter'
import type { ChatMessage, StreamingSegment } from '../../src/shared/types'

const mkAssistant = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'a1',
  role: 'assistant',
  content: '',
  reasoningContent: '',
  timestamp: 1,
  ...over,
})

const reasoningEvent = (text: string): NonNullable<StreamingSegment['events']>[number] =>
  ({ type: 'reasoning', text })

const toolEvent = (
  name: string,
  toolCallId: string,
  args: string,
  status: 'calling' | 'done' = 'done',
): NonNullable<StreamingSegment['events']>[number] =>
  ({ type: 'tool', toolName: name, toolCallId, args, result: 'ok', status })

/**
 * 只取「过程项」—— 带推理的 assistant 与工具。
 * 流式时还会有一个空的正文挂载项（id === streamingAssistantId，无推理无正文），
 * 它不属于过程顺序，断言里排除掉。
 */
const processItems = (items: ReturnType<typeof adaptMessages>) =>
  items.filter((i) => i.kind === 'tool' || (i.kind === 'assistant' && Boolean(i.reasoning)))

const processKinds = (items: ReturnType<typeof adaptMessages>): string[] =>
  processItems(items).map((i) => i.kind)
const reasoningOf = (items: ReturnType<typeof adaptMessages>): string[] =>
  processItems(items).flatMap((i) => (i.kind === 'assistant' ? [i.reasoning] : []))
const toolNames = (items: ReturnType<typeof adaptMessages>): string[] =>
  processItems(items).flatMap((i) => (i.kind === 'tool' ? [i.name] : []))

describe('adaptMessages — 流式过程按真实发生顺序交错', () => {
  it('推理与工具交替出现 → 保持 R,T,R,T（而不是 R,R,T,T）', () => {
    const segments: StreamingSegment[] = [{
      reasoning: 'R1\n\nR2',
      content: '',
      toolCalls: [],
      events: [
        reasoningEvent('R1'),
        toolEvent('file_read', 't1', '{"filePath":"/a.ts"}'),
        reasoningEvent('R2'),
        toolEvent('terminal_exec', 't2', '{"command":"ls"}'),
      ],
    }]

    const items = adaptMessages(
      [mkAssistant({ reasoningContent: 'R1\n\nR2' })],
      [
        { name: 'file_read', status: 'done', toolCallId: 't1' },
        { name: 'terminal_exec', status: 'done', toolCallId: 't2' },
      ],
      'a1',
      segments,
    )

    expect(processKinds(items)).toEqual(['assistant', 'tool', 'assistant', 'tool'])
    expect(reasoningOf(items)).toEqual(['R1', 'R2'])
    expect(toolNames(items)).toEqual(['file_read', 'terminal_exec'])
  })

  it('走有序事件流时不再把 streamingToolCalls 追加到末尾 → 不产生重复工具', () => {
    const segments: StreamingSegment[] = [{
      reasoning: 'R1',
      content: '',
      toolCalls: [],
      events: [reasoningEvent('R1'), toolEvent('file_read', 't1', '{"filePath":"/a.ts"}')],
    }]

    const items = adaptMessages(
      [mkAssistant({ reasoningContent: 'R1' })],
      // 同一批工具在两处都出现 —— 若末尾还追加一次，工具会变成 2 个
      [{ name: 'file_read', status: 'done', toolCallId: 't1' }],
      'a1',
      segments,
    )

    expect(toolNames(items)).toEqual(['file_read'])
    expect(processKinds(items)).toEqual(['assistant', 'tool'])
  })

  it('正文挂载项不再重复渲染整段推理（liveTextOnly）', () => {
    const segments: StreamingSegment[] = [{
      reasoning: 'R1',
      content: '',
      toolCalls: [],
      events: [reasoningEvent('R1'), toolEvent('file_read', 't1', '{"filePath":"/a.ts"}')],
    }]

    const items = adaptMessages([mkAssistant({ reasoningContent: 'R1' })], [], 'a1', segments)
    const mounts = items.filter((i) => i.kind === 'assistant' && i.id === 'a1')

    expect(mounts).toHaveLength(1)
    expect(mounts[0].kind === 'assistant' && mounts[0].liveTextOnly).toBe(true)
    // 推理只出现一次（在过程项里），挂载项自己不带推理
    expect(reasoningOf(items)).toEqual(['R1'])
  })

  it('事件流末尾仍是 reasoning → 该段标记为进行中（驱动「正在写」高亮）', () => {
    const segments: StreamingSegment[] = [{
      reasoning: 'R1\n\nR2',
      content: '',
      toolCalls: [],
      events: [
        reasoningEvent('R1'),
        toolEvent('file_read', 't1', '{"filePath":"/a.ts"}'),
        reasoningEvent('R2'),
      ],
    }]

    const items = adaptMessages([mkAssistant({ reasoningContent: 'R1\n\nR2' })], [], 'a1', segments)
    const assistants = processItems(items).filter((i) => i.kind === 'assistant')

    expect(assistants).toHaveLength(2)
    expect(assistants[0].kind === 'assistant' && assistants[0].streaming).toBe(false)
    expect(assistants[1].kind === 'assistant' && assistants[1].streaming).toBe(true)
    expect(assistants[1].kind === 'assistant' && assistants[1].reasoningComplete).toBe(false)
  })

  it('多轮 segment 之间也保持顺序', () => {
    const segments: StreamingSegment[] = [
      { reasoning: 'A', content: '', toolCalls: [], events: [reasoningEvent('A'), toolEvent('file_read', 't1', '{"filePath":"/a.ts"}')] },
      { reasoning: 'B', content: '', toolCalls: [], events: [reasoningEvent('B'), toolEvent('file_write', 't2', '{"filePath":"/b.ts"}')] },
    ]

    const items = adaptMessages([mkAssistant({ reasoningContent: 'A\n\nB' })], [], 'a1', segments)

    expect(processKinds(items)).toEqual(['assistant', 'tool', 'assistant', 'tool'])
    expect(reasoningOf(items)).toEqual(['A', 'B'])
    expect(toolNames(items)).toEqual(['file_read', 'file_write'])
  })

  it('没有 events 的老数据 → 退回原行为（推理一段 + 工具在末尾），不丢内容', () => {
    const segments: StreamingSegment[] = [{ reasoning: 'R1', content: '', toolCalls: [] }]

    const items = adaptMessages(
      [mkAssistant({ reasoningContent: 'R1' })],
      [{ name: 'file_read', status: 'done', toolCallId: 't1' }],
      'a1',
      segments,
    )

    expect(processKinds(items)).toEqual(['assistant', 'tool'])
    expect(reasoningOf(items)).toEqual(['R1'])
  })

  it('events 只有 content、没有任何过程事件 → 必须退回兜底，不能什么都不显示', () => {
    // 这是"一直正在思考、不出内容"的成因：若无条件采信有序流，
    // 产出 0 项的同时还会跳过 reasoning 兜底与工具追加
    const segments: StreamingSegment[] = [{
      reasoning: '',
      content: '最终回答',
      toolCalls: [{ name: 'file_read', status: 'done', args: '{"filePath":"/a.ts"}', toolCallId: 't1' }],
      events: [{ type: 'content', text: '最终回答' }],
    }]

    const items = adaptMessages(
      [mkAssistant({ content: '最终回答' })],
      [{ name: 'file_read', status: 'done', toolCallId: 't1' }],
      'a1',
      segments,
    )

    // 正文照常渲染 + 工具没有消失
    expect(items.some((i) => i.kind === 'assistant' && i.text === '最终回答')).toBe(true)
    expect(toolNames(items)).toEqual(['file_read'])
  })

  it('events 不完整（只记了推理、漏了工具）→ 漏掉的工具按 id 去重补在末尾，不丢', () => {
    const segments: StreamingSegment[] = [{
      reasoning: 'R1',
      content: '',
      toolCalls: [],
      events: [reasoningEvent('R1')], // 事件流里没有工具
    }]

    const items = adaptMessages(
      [mkAssistant({ reasoningContent: 'R1' })],
      [
        { name: 'file_read', status: 'done', toolCallId: 't1' },
        { name: 'file_write', status: 'done', toolCallId: 't2' },
      ],
      'a1',
      segments,
    )

    expect(reasoningOf(items)).toEqual(['R1'])
    // 顺序退化为"推理在前、工具补在后"，但一件都不少
    expect(toolNames(items)).toEqual(['file_read', 'file_write'])
  })

  it('持久化消息也走有序事件流 → 任务结束后顺序不跳回底部', () => {
    // 只修流式的话，任务一结束就切到持久化路径、工具整体跳回底部
    const segments: StreamingSegment[] = [{
      reasoning: 'R1\n\nR2',
      content: '',
      toolCalls: [],
      events: [
        reasoningEvent('R1'),
        toolEvent('file_read', 't1', '{"filePath":"/a.ts"}'),
        reasoningEvent('R2'),
        toolEvent('file_write', 't2', '{"filePath":"/b.ts"}'),
      ],
    }]
    const persisted = mkAssistant({
      reasoningContent: 'R1\n\nR2',
      segments,
      toolCalls: [
        { id: 't1', name: 'file_read', arguments: { filePath: '/a.ts' } },
        { id: 't2', name: 'file_write', arguments: { filePath: '/b.ts' } },
      ],
      toolResults: [
        { toolCallId: 't1', toolName: 'file_read', content: 'ok', success: true },
        { toolCallId: 't2', toolName: 'file_write', content: 'ok', success: true },
      ],
    })

    const items = adaptMessages([persisted], undefined, null, undefined)

    expect(processKinds(items)).toEqual(['assistant', 'tool', 'assistant', 'tool'])
    expect(reasoningOf(items)).toEqual(['R1', 'R2'])
    // toolCalls 不能再各自渲染一遍
    expect(toolNames(items)).toEqual(['file_read', 'file_write'])
  })

  it('持久化侧的错误状态从 toolResults 回填（事件流只记 result 文本，没有 success）', () => {
    const segments: StreamingSegment[] = [{
      reasoning: '',
      content: '',
      toolCalls: [],
      events: [toolEvent('terminal_exec', 't1', '{"command":"exit 1"}')],
    }]
    const persisted = mkAssistant({
      segments,
      toolCalls: [{ id: 't1', name: 'terminal_exec', arguments: { command: 'exit 1' } }],
      toolResults: [{ toolCallId: 't1', toolName: 'terminal_exec', content: 'boom', success: false, error: 'exit 1' }],
    })

    const items = adaptMessages([persisted], undefined, null, undefined)
    const tool = items.find((i) => i.kind === 'tool')

    expect(tool && tool.kind === 'tool' && tool.status).toBe('error')
    expect(tool && tool.kind === 'tool' && tool.error).toBe('exit 1')
  })

  it('事件流状态滞后时以扁平数据为准 → 已完成的工具不会永久显示"执行中"', () => {
    // 真实场景：按工具名兜底匹配时漏更新事件，事件停在 calling，
    // 但 streamingToolCalls / msg.toolCalls 已经是 done
    const segments: StreamingSegment[] = [{
      reasoning: '',
      content: '',
      toolCalls: [],
      events: [toolEvent('file_read', 't1', '{"filePath":"/a.ts"}', 'calling')],
    }]

    const items = adaptMessages(
      [mkAssistant()],
      [{ name: 'file_read', status: 'done', toolCallId: 't1', result: 'ok' }],
      'a1',
      segments,
    )
    const tool = items.find((i) => i.kind === 'tool')

    expect(tool && tool.kind === 'tool' && tool.status).toBe('done')
  })

  it('工具摘要用结构化标签，不把工具输出原文当标题', () => {
    const segments: StreamingSegment[] = [{
      reasoning: '',
      content: '',
      toolCalls: [],
      events: [
        toolEvent('project_context', 't1', '{}', 'done'),
        toolEvent('terminal_exec', 't2', '{"command":"git status"}', 'done'),
      ],
    }]
    // 让 project_context 的 result 是一段 markdown —— 旧实现会把它当摘要
    segments[0].events![0].result = '## 📁 项目上下文：`D:\\proj`'

    const items = adaptMessages([mkAssistant()], [], 'a1', segments)
    const summaries = processItems(items).flatMap((i) => (i.kind === 'tool' ? [i.summary] : []))

    expect(summaries[0]).toBe('项目上下文')
    expect(summaries[1]).toBe('$ git status')
  })
})
