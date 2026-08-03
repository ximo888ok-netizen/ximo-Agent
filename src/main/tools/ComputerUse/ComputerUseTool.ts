import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'
import {
  doScreenshot, doObserve, doFindWindow,
  doClickElement, doSetText, doReadText,
  doMouseClick, doMouseMove, doMouseDrag, doMouseScroll,
  doKeyPress, doKeyType, doWait
} from './computer-use-actions'

/**
 * ComputerUseTool — 一体化桌面操控工具
 *
 * 合并了 find_roots / observe_ui / search_ui / act_ui / wait_for 五个工具为一个，
 * Agent 只需一次调用就能完成"观察 → 定位 → 操作 → 验证"全流程。
 *
 * 同时新增直接鼠标键盘控制：
 * - mouse_move / mouse_click / mouse_drag — 直接坐标操控
 * - key_press / key_type — 直接键盘输入
 * - screenshot — 截屏查看
 *
 * action 参数决定执行哪种操作，一步到位，无需多轮工具往返。
 */
export class ComputerUseTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'computer_use',
    description:
      '一体化桌面操控工具，合并观察、定位、操作、验证为一次调用。通过 action 参数指定操作类型（screenshot/observe/find_window/click_element/set_text/read_text/mouse_click/mouse_move/mouse_drag/mouse_scroll/key_press/key_type/wait）。\n操作策略：screenshot 看屏幕 → observe 获取 @e 元素引用 → click_element/set_text 语义操作（不生效时 mouse_click 坐标兜底）→ key_type 输入文本 / key_press 快捷键。一步能完成的不拆多步。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '操作类型',
          enum: [
            'screenshot', 'observe', 'find_window',
            'click_element', 'set_text', 'read_text',
            'mouse_click', 'mouse_move', 'mouse_drag', 'mouse_scroll',
            'key_press', 'key_type',
            'wait'
          ]
        },
        // 感知类参数
        window: { type: 'string', description: 'observe/find_window: 窗口引用(@rN)或标题关键词', default: '' },
        // 操作类参数
        ref: { type: 'string', description: 'click_element/set_text/read_text: UI 元素引用(@eN)', default: '' },
        text: { type: 'string', description: 'set_text/key_type: 要输入的文本', default: '' },
        // 直接操控参数
        x: { type: 'number', description: 'mouse_click/mouse_move/mouse_scroll: X 坐标', default: 0 },
        y: { type: 'number', description: 'mouse_click/mouse_move/mouse_scroll: Y 坐标', default: 0 },
        button: { type: 'string', description: 'mouse_click: 鼠标按钮', enum: ['left', 'right', 'middle'], default: 'left' },
        clickCount: { type: 'number', description: 'mouse_click: 点击次数', default: 1 },
        path: {
          type: 'array',
          description: 'mouse_drag: 拖拽路径坐标数组',
          items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } }
        },
        scrollX: { type: 'number', description: 'mouse_scroll: 水平滚动量', default: 0 },
        scrollY: { type: 'number', description: 'mouse_scroll: 垂直滚动量', default: 0 },
        keys: {
          type: 'array',
          description: 'key_press: 按键组合，如 ["Ctrl","S"] 或 ["Enter"]',
          items: { type: 'string' }
        },
        // wait 参数
        until: { type: 'string', description: 'wait: 条件方向 present(出现)/absent(消失)', enum: ['present', 'absent'], default: 'present' },
        timeoutMs: { type: 'number', description: 'wait: 超时毫秒数', default: 10000 },
        // 通用
        stateId: { type: 'string', description: 'UI 状态 ID（observe 返回），用于引用绑定', default: '' }
      },
      required: ['action']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    _signal?: AbortSignal
  ): Promise<ToolResult> {
    const action = (toolCall.arguments.action as string) || ''
    onChunk?.({ toolStatus: 'calling', toolName: 'computer_use' })

    try {
      switch (action) {
        // ── 感知类 ──
        case 'screenshot': return await doScreenshot(toolCall)
        case 'observe': return await doObserve(toolCall)
        case 'find_window': return await doFindWindow(toolCall)

        // ── 语义操作类 ──
        case 'click_element': return await doClickElement(toolCall)
        case 'set_text': return await doSetText(toolCall)
        case 'read_text': return await doReadText(toolCall)

        // ── 直接鼠标控制 ──
        case 'mouse_click': return await doMouseClick(toolCall)
        case 'mouse_move': return await doMouseMove(toolCall)
        case 'mouse_drag': return await doMouseDrag(toolCall)
        case 'mouse_scroll': return await doMouseScroll(toolCall)

        // ── 直接键盘控制 ──
        case 'key_press': return await doKeyPress(toolCall)
        case 'key_type': return await doKeyType(toolCall)

        // ── 验证类 ──
        case 'wait': return await doWait(toolCall)

        default:
          return { toolCallId: toolCall.id, toolName: 'computer_use', content: '', success: false, error: `未知操作类型: ${action}` }
      }
    } catch (e) {
      return { toolCallId: toolCall.id, toolName: 'computer_use', content: '', success: false, error: `操控失败 [${action}]：${(e as Error).message}` }
    }
  }
}
