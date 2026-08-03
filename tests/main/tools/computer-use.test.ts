import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock PiBridge — 必须在 import 之前
vi.mock('../../../src/main/tools/ComputerUse/PiBridge', () => ({
  piBridge: { command: vi.fn() },
  WINDOWS_HELPER_PATH: '/mocked/windows-bridge.exe'
}))

import { piBridge } from '../../../src/main/tools/ComputerUse/PiBridge'
import {
  doScreenshot, doObserve, doFindWindow,
  doClickElement, doSetText, doReadText,
  doMouseClick, doMouseMove, doMouseDrag, doMouseScroll,
  doKeyPress, doKeyType, doWait
} from '../../../src/main/tools/ComputerUse/computer-use-actions'
import { ComputerUseTool } from '../../../src/main/tools/ComputerUse/ComputerUseTool'
import { ActUiTool } from '../../../src/main/tools/ComputerUse/ActUiTool'
import { ObserveUiTool } from '../../../src/main/tools/ComputerUse/ObserveUiTool'
import type { ToolCall } from '../../../src/shared/types'

const mockedCommand = vi.mocked(piBridge.command)

function makeToolCall(id: string, name: string, args: Record<string, unknown>): ToolCall {
  return { id, name, arguments: args }
}

function lookResponse(opts: { lookId?: string; stateId?: string; outline?: unknown; image?: string } = {}) {
  return {
    lookId: opts.lookId ?? 'look_1',
    stateId: opts.stateId ?? '',
    outline: opts.outline ?? {
      ref: '@e1', role: 'Window', label: 'Test',
      children: [
        { ref: '@e2', role: 'Button', label: 'OK', capabilities: { canInvoke: true } },
        { ref: '@e3', role: 'Edit', label: 'Input', capabilities: { canSetValue: true } }
      ]
    },
    image: opts.image
  }
}

function actResponse(opts: { outcome?: string; lookId?: string } = {}) {
  return { performed: { outcome: opts.outcome ?? 'worked' }, lookId: opts.lookId ?? 'look_1' }
}

/** 从 mock 调用中提取第 N 次调用的 lookId 参数 */
function lookIdOfCall(n: number): string {
  return (mockedCommand.mock.calls[n]![1] as Record<string, unknown>).lookId as string
}

describe('ComputerUse — lookId 传递修复', () => {
  beforeEach(() => { vi.clearAllMocks() })

  // ══════════ 核心修复：observe/screenshot 从 look 响应中提取 lookId ══════════

  describe('doObserve — lookId 提取', () => {
    it('look 响应含 lookId 时，stateId 应为 lookId', async () => {
      mockedCommand.mockResolvedValueOnce(lookResponse({ lookId: 'look_5', stateId: '' }))
      const r = await doObserve(makeToolCall('t1', 'computer_use', { action: 'observe' }))
      expect(r.metadata!.stateId).toBe('look_5')
      expect(r.content).toContain('look_5')
    })

    it('look 响应含 stateId 时优先使用 stateId', async () => {
      mockedCommand.mockResolvedValueOnce(lookResponse({ lookId: 'look_2', stateId: 'state_abc' }))
      const r = await doObserve(makeToolCall('t2', 'computer_use', { action: 'observe' }))
      expect(r.metadata!.stateId).toBe('state_abc')
    })

    it('无 stateId 且无 lookId 时为空字符串', async () => {
      mockedCommand.mockResolvedValueOnce({ outline: { ref: '@e1', role: 'Window' } })
      const r = await doObserve(makeToolCall('t3', 'computer_use', { action: 'observe' }))
      expect(r.metadata!.stateId).toBe('')
    })

    it('无 outline 时返回提示', async () => {
      mockedCommand.mockResolvedValueOnce({ lookId: 'look_1' })
      const r = await doObserve(makeToolCall('t4', 'computer_use', { action: 'observe' }))
      expect(r.content).toContain('未获取到 UI 大纲')
    })
  })

  describe('doScreenshot — lookId 提取', () => {
    it('从 look 响应中提取 lookId 作为 stateId', async () => {
      mockedCommand.mockResolvedValueOnce(lookResponse({ lookId: 'look_3', stateId: '', outline: undefined }))
      const r = await doScreenshot(makeToolCall('t1', 'computer_use', { action: 'screenshot' }))
      expect(r.metadata!.stateId).toBe('look_3')
    })
  })

  // ══════════ 核心修复：所有 act 函数使用 stateId 参数作为 lookId ══════════

  describe('doClickElement — lookId 传递', () => {
    it('使用 stateId 作为 lookId', async () => {
      mockedCommand.mockResolvedValueOnce(actResponse({ lookId: 'look_7' })).mockResolvedValueOnce({})
      await doClickElement(makeToolCall('t1', 'computer_use', { action: 'click_element', ref: '@e2', stateId: 'look_7' }))
      expect(lookIdOfCall(0)).toBe('look_7')
    })

    it('未提供 stateId 时回退到 look', async () => {
      mockedCommand.mockResolvedValueOnce(actResponse()).mockResolvedValueOnce({})
      await doClickElement(makeToolCall('t2', 'computer_use', { action: 'click_element', ref: '@e1' }))
      expect(lookIdOfCall(0)).toBe('look')
    })

    it('缺少 ref 返回错误', async () => {
      const r = await doClickElement(makeToolCall('t3', 'computer_use', { action: 'click_element' }))
      expect(r.success).toBe(false)
      expect(r.error).toContain('ref')
    })

    it('outcome=didnt 标记未生效', async () => {
      mockedCommand.mockResolvedValueOnce(actResponse({ outcome: 'didnt' })).mockResolvedValueOnce({})
      const r = await doClickElement(makeToolCall('t4', 'computer_use', { action: 'click_element', ref: '@e2', stateId: 'look_1' }))
      expect(r.success).toBe(false)
      expect(r.content).toContain('未生效')
    })
  })

  describe('doSetText — lookId 传递', () => {
    it('使用 stateId 作为 lookId', async () => {
      mockedCommand.mockResolvedValueOnce(actResponse())
      const r = await doSetText(makeToolCall('t1', 'computer_use', { action: 'set_text', ref: '@e3', text: 'hi', stateId: 'look_2' }))
      expect(r.success).toBe(true)
      expect(lookIdOfCall(0)).toBe('look_2')
      expect((mockedCommand.mock.calls[0]![1] as any).params.text).toBe('hi')
    })

    it('缺少 ref 返回错误', async () => {
      const r = await doSetText(makeToolCall('t2', 'computer_use', { action: 'set_text', text: 'hi' }))
      expect(r.success).toBe(false)
    })
  })

  describe('doMouseClick — lookId 传递', () => {
    it('使用 stateId 作为 lookId', async () => {
      mockedCommand.mockResolvedValueOnce(actResponse())
      await doMouseClick(makeToolCall('t1', 'computer_use', { action: 'mouse_click', x: 100, y: 200, stateId: 'look_3' }))
      expect(lookIdOfCall(0)).toBe('look_3')
    })

    it('未提供 stateId 时回退到 look', async () => {
      mockedCommand.mockResolvedValueOnce(actResponse())
      await doMouseClick(makeToolCall('t2', 'computer_use', { action: 'mouse_click', x: 50, y: 50 }))
      expect(lookIdOfCall(0)).toBe('look')
    })
  })

  describe('doMouseMove — lookId 传递', () => {
    it('使用 stateId 作为 lookId', async () => {
      mockedCommand.mockResolvedValueOnce(actResponse())
      await doMouseMove(makeToolCall('t1', 'computer_use', { action: 'mouse_move', x: 300, y: 400, stateId: 'look_4' }))
      expect(lookIdOfCall(0)).toBe('look_4')
    })
  })

  describe('doMouseDrag — lookId 传递', () => {
    it('使用 stateId 作为 lookId', async () => {
      mockedCommand.mockResolvedValueOnce(actResponse())
      await doMouseDrag(makeToolCall('t1', 'computer_use', { action: 'mouse_drag', path: [{ x: 0, y: 0 }, { x: 1, y: 1 }], stateId: 'look_5' }))
      expect(lookIdOfCall(0)).toBe('look_5')
    })

    it('path 少于 2 点返回错误', async () => {
      const r = await doMouseDrag(makeToolCall('t2', 'computer_use', { action: 'mouse_drag', path: [{ x: 0, y: 0 }] }))
      expect(r.success).toBe(false)
      expect(r.error).toContain('path')
    })
  })

  describe('doMouseScroll — lookId 传递', () => {
    it('使用 stateId 作为 lookId', async () => {
      mockedCommand.mockResolvedValueOnce(actResponse())
      await doMouseScroll(makeToolCall('t1', 'computer_use', { action: 'mouse_scroll', x: 200, y: 300, scrollY: -3, stateId: 'look_6' }))
      expect(lookIdOfCall(0)).toBe('look_6')
    })
  })

  describe('doKeyPress — lookId 传递', () => {
    it('使用 stateId 作为 lookId', async () => {
      mockedCommand.mockResolvedValueOnce(actResponse())
      await doKeyPress(makeToolCall('t1', 'computer_use', { action: 'key_press', keys: ['Ctrl', 'S'], stateId: 'look_7' }))
      expect(lookIdOfCall(0)).toBe('look_7')
    })
  })

  describe('doKeyType — lookId 传递', () => {
    it('使用 stateId 作为 lookId', async () => {
      mockedCommand.mockResolvedValueOnce(actResponse())
      const r = await doKeyType(makeToolCall('t1', 'computer_use', { action: 'key_type', text: '你好', stateId: 'look_8' }))
      expect(r.success).toBe(true)
      expect(lookIdOfCall(0)).toBe('look_8')
    })

    it('缺少 text 返回错误', async () => {
      const r = await doKeyType(makeToolCall('t2', 'computer_use', { action: 'key_type' }))
      expect(r.success).toBe(false)
    })
  })

  // ══════════ 非 act 类函数 ══════════

  describe('doReadText', () => {
    it('返回元素文本', async () => {
      mockedCommand.mockResolvedValueOnce('Hello World')
      const r = await doReadText(makeToolCall('t1', 'computer_use', { action: 'read_text', ref: '@e3' }))
      expect(r.content).toContain('Hello World')
    })

    it('缺少 ref 返回错误', async () => {
      const r = await doReadText(makeToolCall('t2', 'computer_use', { action: 'read_text' }))
      expect(r.success).toBe(false)
    })
  })

  describe('doFindWindow', () => {
    it('返回窗口列表', async () => {
      mockedCommand.mockResolvedValueOnce({ roots: [{ rootRef: '@r1', title: '记事本', appName: 'notepad', isFocused: true }, { rootRef: '@r2', title: 'Edge' }] })
      const r = await doFindWindow(makeToolCall('t1', 'computer_use', { action: 'find_window' }))
      expect(r.content).toContain('记事本')
      expect(r.content).toContain('2 个窗口')
    })

    it('无窗口返回提示', async () => {
      mockedCommand.mockResolvedValueOnce({ roots: [] })
      const r = await doFindWindow(makeToolCall('t2', 'computer_use', { action: 'find_window', window: '不存在' }))
      expect(r.content).toContain('未找到')
    })
  })

  describe('doWait', () => {
    it('条件满足返回成功', async () => {
      mockedCommand.mockResolvedValueOnce({ satisfied: true })
      const r = await doWait(makeToolCall('t1', 'computer_use', { action: 'wait', text: '加载完成', until: 'present' }))
      expect(r.content).toContain('已出现')
    })

    it('超时返回未满足', async () => {
      mockedCommand.mockResolvedValueOnce({ satisfied: false })
      const r = await doWait(makeToolCall('t2', 'computer_use', { action: 'wait', text: 'x', until: 'absent' }))
      expect(r.content).toContain('超时')
    })

    it('缺少 text 返回错误', async () => {
      const r = await doWait(makeToolCall('t3', 'computer_use', { action: 'wait' }))
      expect(r.success).toBe(false)
    })
  })

  // ══════════ ObserveUiTool ══════════

  describe('ObserveUiTool', () => {
    const tool = new ObserveUiTool()

    it('从 look 响应提取 lookId 作为 stateId', async () => {
      mockedCommand.mockResolvedValueOnce(lookResponse({ lookId: 'look_10', stateId: '' }))
      const r = await tool.execute(makeToolCall('t1', 'observe_ui', { root: '@r1' }), undefined)
      expect(r.metadata!.stateId).toBe('look_10')
    })

    it('优先使用 stateId 字段', async () => {
      mockedCommand.mockResolvedValueOnce(lookResponse({ lookId: 'look_2', stateId: 'state_xyz' }))
      const r = await tool.execute(makeToolCall('t2', 'observe_ui', {}), undefined)
      expect(r.metadata!.stateId).toBe('state_xyz')
    })
  })

  // ══════════ ActUiTool ══════════

  describe('ActUiTool', () => {
    const tool = new ActUiTool()

    it('使用 stateId 作为初始 lookId', async () => {
      mockedCommand.mockResolvedValueOnce(actResponse({ lookId: 'look_5' })).mockResolvedValueOnce({})
      await tool.execute(makeToolCall('t1', 'act_ui', { stateId: 'look_5', actions: JSON.stringify([{ action: 'press', ref: '@e2' }]) }), undefined)
      expect(lookIdOfCall(0)).toBe('look_5')
    })

    it('未提供 stateId 时回退到 look', async () => {
      mockedCommand.mockResolvedValueOnce(actResponse()).mockResolvedValueOnce({})
      await tool.execute(makeToolCall('t2', 'act_ui', { stateId: '', actions: [{ action: 'press', ref: '@e1' }] }), undefined)
      expect(lookIdOfCall(0)).toBe('look')
    })

    it('多步操作使用上一步返回的 lookId', async () => {
      mockedCommand
        .mockResolvedValueOnce(actResponse({ lookId: 'look_2' }))
        .mockResolvedValueOnce(actResponse({ lookId: 'look_3' }))
        .mockResolvedValueOnce({})
      await tool.execute(makeToolCall('t3', 'act_ui', { stateId: 'look_1', actions: [{ action: 'click', ref: '@e1' }, { action: 'setText', ref: '@e2', text: 'hi' }] }), undefined)
      expect(lookIdOfCall(0)).toBe('look_1')
      expect(lookIdOfCall(1)).toBe('look_2')
    })

    it('无效 JSON 返回错误', async () => {
      const r = await tool.execute(makeToolCall('t4', 'act_ui', { stateId: 'look_1', actions: 'not json' }), undefined)
      expect(r.success).toBe(false)
      expect(r.error).toContain('JSON')
    })

    it('空 actions 返回错误', async () => {
      const r = await tool.execute(makeToolCall('t5', 'act_ui', { stateId: 'look_1', actions: [] }), undefined)
      expect(r.success).toBe(false)
      expect(r.error).toContain('至少')
    })
  })

  // ══════════ ComputerUseTool 端到端 lookId 流转 ══════════

  describe('ComputerUseTool — 端到端', () => {
    const tool = new ComputerUseTool()

    it('observe 返回 lookId → click_element 使用该 lookId', async () => {
      // Step 1: observe
      mockedCommand.mockResolvedValueOnce(lookResponse({ lookId: 'look_42', stateId: '' }))
      const observeResult = await tool.execute(makeToolCall('tc1', 'computer_use', { action: 'observe', window: '@r1' }), undefined)
      const stateId = observeResult.metadata!.stateId as string
      expect(stateId).toBe('look_42')

      // Step 2: click_element with stateId from observe
      mockedCommand.mockResolvedValueOnce(actResponse({ lookId: 'look_42' })).mockResolvedValueOnce({ image: 'base64' })
      await tool.execute(makeToolCall('tc2', 'computer_use', { action: 'click_element', ref: '@e2', stateId }), undefined)

      // 验证 act 命令（第 2 次 mock 调用）使用了 observe 返回的 lookId
      expect(lookIdOfCall(1)).toBe('look_42')
    })

    it('未知 action 返回错误', async () => {
      const r = await tool.execute(makeToolCall('t1', 'computer_use', { action: 'unknown' }), undefined)
      expect(r.success).toBe(false)
      expect(r.error).toContain('未知')
    })

    it('onChunk 回调被调用', async () => {
      mockedCommand.mockResolvedValueOnce(lookResponse({ lookId: 'look_1' }))
      const chunks: Array<{ toolStatus?: string; toolName?: string }> = []
      await tool.execute(makeToolCall('t1', 'computer_use', { action: 'observe' }), (c) => chunks.push(c as any))
      expect(chunks.some(c => c.toolStatus === 'calling' && c.toolName === 'computer_use')).toBe(true)
    })
  })
})
