/** ComputerUse 交互类动作 — 语义操作、鼠标、键盘、验证 */

import type { ToolCall, ToolResult } from '@shared/types'
import { piBridge } from './PiBridge'
import { error } from './cu-helpers'

// ── 语义操作类 ──

export async function doClickElement(toolCall: ToolCall): Promise<ToolResult> {
  const ref = (toolCall.arguments.ref as string) || ''
  if (!ref) return error(toolCall.id, 'click_element 需要 ref 参数（@e 引用）')
  const lookId = (toolCall.arguments.stateId as string) || 'look'

  const actResult = await piBridge.command<Record<string, unknown>>('act', {
    lookId, action: 'press', target: { ref }, policy: 'default', params: {}
  }, 15_000)

  const outcome = (actResult?.performed as Record<string, unknown> | undefined)?.outcome || 'unknown'
  const newLookId = actResult?.lookId || lookId

  let screenshot: string | undefined
  try {
    const lookResult = await piBridge.command<Record<string, unknown>>('look', {
      readText: 'never', includeImage: true, maxDimension: 800
    }, 8_000)
    const img = lookResult?.image
    if (img && typeof img === 'string') {
      screenshot = img.startsWith('data:') ? img : `data:image/png;base64,${img}`
    }
  } catch { /* 忽略截图失败 */ }

  const success = outcome === 'worked'
  const result: ToolResult = {
    toolCallId: toolCall.id, toolName: 'computer_use',
    content: success
      ? `✅ 已点击 ${ref}`
      : outcome === 'didnt' ? `❌ 点击 ${ref} 未生效` : `⚠️ 点击 ${ref} 结果不确定`,
    success, displayType: 'text',
    metadata: { action: 'click_element', ref, outcome, lookId: newLookId }
  }
  if (screenshot) result.screenshot = screenshot
  return result
}

export async function doSetText(toolCall: ToolCall): Promise<ToolResult> {
  const ref = (toolCall.arguments.ref as string) || ''
  const text = (toolCall.arguments.text as string) || ''
  if (!ref) return error(toolCall.id, 'set_text 需要 ref 参数')
  const lookId = (toolCall.arguments.stateId as string) || 'look'

  const actResult = await piBridge.command<Record<string, unknown>>('act', {
    lookId, action: 'setText', target: { ref }, policy: 'default', params: { text }
  }, 15_000)

  const outcome = (actResult?.performed as Record<string, unknown> | undefined)?.outcome || 'unknown'
  const success = outcome === 'worked'

  return {
    toolCallId: toolCall.id, toolName: 'computer_use',
    content: success
      ? `✅ 已设置 ${ref} 的文本为 "${text.slice(0, 50)}"`
      : `❌ 设置 ${ref} 文本未生效`,
    success, displayType: 'text',
    metadata: { action: 'set_text', ref, outcome, textLength: text.length }
  }
}

export async function doReadText(toolCall: ToolCall): Promise<ToolResult> {
  const ref = (toolCall.arguments.ref as string) || ''
  if (!ref) return error(toolCall.id, 'read_text 需要 ref 参数')

  const result = await piBridge.command<string>('uiaReadText', { ref, offset: 0 }, 10_000)
  const text = typeof result === 'string' ? result : JSON.stringify(result)

  return {
    toolCallId: toolCall.id, toolName: 'computer_use',
    content: `## 📄 ${ref} 文本内容\n\n${text || '(无文本内容)'}`,
    success: true, displayType: 'text',
    metadata: { action: 'read_text', ref, length: text?.length ?? 0 }
  }
}

// ── 直接鼠标控制 ──

export async function doMouseClick(toolCall: ToolCall): Promise<ToolResult> {
  const x = Number(toolCall.arguments.x) || 0
  const y = Number(toolCall.arguments.y) || 0
  const button = (toolCall.arguments.button as string) || 'left'
  const clickCount = Number(toolCall.arguments.clickCount) || 1
  const lookId = (toolCall.arguments.stateId as string) || 'look'

  const actResult = await piBridge.command<Record<string, unknown>>('act', {
    lookId, action: 'click', target: { x, y }, policy: 'default', params: { button, clickCount }
  }, 10_000)

  const outcome = (actResult?.performed as Record<string, unknown> | undefined)?.outcome || 'unknown'
  const success = outcome === 'worked' || outcome === 'unknown'

  return {
    toolCallId: toolCall.id, toolName: 'computer_use',
    content: success ? `✅ 已点击 (${x}, ${y}) [${button}]` : `❌ 点击 (${x}, ${y}) 未生效`,
    success, displayType: 'text',
    metadata: { action: 'mouse_click', x, y, button, clickCount, outcome }
  }
}

export async function doMouseMove(toolCall: ToolCall): Promise<ToolResult> {
  const x = Number(toolCall.arguments.x) || 0
  const y = Number(toolCall.arguments.y) || 0
  const lookId = (toolCall.arguments.stateId as string) || 'look'

  await piBridge.command<Record<string, unknown>>('act', {
    lookId, action: 'moveMouse', target: { x, y }, policy: 'default', params: {}
  }, 10_000)

  return {
    toolCallId: toolCall.id, toolName: 'computer_use',
    content: `✅ 鼠标已移动到 (${x}, ${y})`,
    success: true, displayType: 'text',
    metadata: { action: 'mouse_move', x, y }
  }
}

export async function doMouseDrag(toolCall: ToolCall): Promise<ToolResult> {
  const path = (toolCall.arguments.path as Array<{ x: number; y: number }>) || []
  if (path.length < 2) return error(toolCall.id, 'mouse_drag 需要 path 参数（至少 2 个坐标点）')
  const lookId = (toolCall.arguments.stateId as string) || 'look'

  const actResult = await piBridge.command<Record<string, unknown>>('act', {
    lookId, action: 'drag', target: {}, policy: 'default', params: { path }
  }, 15_000)

  const outcome = (actResult?.performed as Record<string, unknown> | undefined)?.outcome || 'unknown'
  const success = outcome === 'worked' || outcome === 'unknown'

  return {
    toolCallId: toolCall.id, toolName: 'computer_use',
    content: success ? `✅ 已拖拽 ${path.length} 个路径点` : `❌ 拖拽未生效`,
    success, displayType: 'text',
    metadata: { action: 'mouse_drag', pathLength: path.length, outcome }
  }
}

export async function doMouseScroll(toolCall: ToolCall): Promise<ToolResult> {
  const x = Number(toolCall.arguments.x) || 0
  const y = Number(toolCall.arguments.y) || 0
  const scrollX = Number(toolCall.arguments.scrollX) || 0
  const scrollY = Number(toolCall.arguments.scrollY) || 0
  const lookId = (toolCall.arguments.stateId as string) || 'look'

  const actResult = await piBridge.command<Record<string, unknown>>('act', {
    lookId, action: 'scroll', target: { x, y }, policy: 'default', params: { scrollX, scrollY }
  }, 10_000)

  const outcome = (actResult?.performed as Record<string, unknown> | undefined)?.outcome || 'unknown'

  return {
    toolCallId: toolCall.id, toolName: 'computer_use',
    content: `✅ 已滚动 (${scrollX}, ${scrollY}) at (${x}, ${y})`,
    success: true, displayType: 'text',
    metadata: { action: 'mouse_scroll', x, y, scrollX, scrollY, outcome }
  }
}

// ── 直接键盘控制 ──

export async function doKeyPress(toolCall: ToolCall): Promise<ToolResult> {
  const keys = Array.isArray(toolCall.arguments.keys)
    ? (toolCall.arguments.keys as string[])
    : [String(toolCall.arguments.keys || 'Enter')]
  const lookId = (toolCall.arguments.stateId as string) || 'look'

  const actResult = await piBridge.command<Record<string, unknown>>('act', {
    lookId, action: 'keypress', target: {}, policy: 'default', params: { keys }
  }, 10_000)

  const outcome = (actResult?.performed as Record<string, unknown> | undefined)?.outcome || 'unknown'

  return {
    toolCallId: toolCall.id, toolName: 'computer_use',
    content: `✅ 已按键 [${keys.join('+')}]`,
    success: true, displayType: 'text',
    metadata: { action: 'key_press', keys, outcome }
  }
}

export async function doKeyType(toolCall: ToolCall): Promise<ToolResult> {
  const text = (toolCall.arguments.text as string) || ''
  if (!text) return error(toolCall.id, 'key_type 需要 text 参数')
  const lookId = (toolCall.arguments.stateId as string) || 'look'

  const actResult = await piBridge.command<Record<string, unknown>>('act', {
    lookId, action: 'typeText', target: {}, policy: 'default', params: { text }
  }, 10_000)

  const outcome = (actResult?.performed as Record<string, unknown> | undefined)?.outcome || 'unknown'

  return {
    toolCallId: toolCall.id, toolName: 'computer_use',
    content: `✅ 已输入文本 "${text.slice(0, 50)}"`,
    success: true, displayType: 'text',
    metadata: { action: 'key_type', textLength: text.length, outcome }
  }
}

// ── 验证类 ──

export async function doWait(toolCall: ToolCall): Promise<ToolResult> {
  const text = (toolCall.arguments.text as string) || ''
  const until = (toolCall.arguments.until as string) || 'present'
  const timeoutMs = Math.min(Number(toolCall.arguments.timeoutMs) || 10_000, 60_000)

  if (!text) return error(toolCall.id, 'wait 需要 text 参数')

  const result = await piBridge.command<Record<string, unknown>>('uiaWaitFor', { text, until, timeoutMs }, timeoutMs + 5_000)
  const satisfied = result?.satisfied !== false
  const condition = until === 'present' ? '出现' : '消失'

  return {
    toolCallId: toolCall.id, toolName: 'computer_use',
    content: satisfied
      ? `✅ 条件已满足："${text}" 已${condition}`
      : `⏰ 等待超时：在 ${timeoutMs}ms 内 "${text}" 未${condition}`,
    success: true, displayType: 'text',
    metadata: { action: 'wait', satisfied, text, until }
  }
}
