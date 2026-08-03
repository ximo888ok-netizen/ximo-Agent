/**
 * ComputerUse action 处理函数 — 从 ComputerUseTool 提取
 *
 * 每个 action 对应一个独立的异步函数，接收 ToolCall 返回 ToolResult。
 * 主类 ComputerUseTool 仅负责路由分发。
 */

import type { ToolCall, ToolResult } from '@shared/types'
import { piBridge } from './PiBridge'
import { formatOutlineFull, formatOutlineCompact } from './outline-formatters'

/** 构造错误返回值 */
function error(id: string, msg: string): ToolResult {
  return { toolCallId: id, toolName: 'computer_use', content: '', success: false, error: msg }
}

// ── 感知类 ──

export async function doScreenshot(toolCall: ToolCall): Promise<ToolResult> {
  const result = await piBridge.command<Record<string, unknown>>('look', {
    readText: 'never', includeImage: true, maxDimension: 1280
  }, 15_000)

  const image = result?.image
  const stateId = (result as any)?.stateId || (result as any)?.lookId || ''
  const outline = result?.outline

  const lines = ['## 📸 屏幕截图']
  if (stateId) lines.push(`stateId: \`${stateId}\``)
  if (outline) {
    lines.push('', '**可交互元素摘要：**', '', formatOutlineCompact(outline as Record<string, unknown>))
  }

  const toolResult: ToolResult = {
    toolCallId: toolCall.id, toolName: 'computer_use',
    content: lines.join('\n'),
    success: true, displayType: 'text',
    metadata: { action: 'screenshot', stateId }
  }
  if (image && typeof image === 'string') {
    toolResult.screenshot = image.startsWith('data:') ? image : `data:image/png;base64,${image}`
  }
  return toolResult
}

export async function doObserve(toolCall: ToolCall): Promise<ToolResult> {
  const window = (toolCall.arguments.window as string) || ''

  const args: Record<string, unknown> = {
    readText: 'auto', includeImage: true, maxDimension: 1280
  }
  if (window) {
    if (window.startsWith('@r')) {
      args.windowRef = window
    } else {
      const findResult = await piBridge.command<{ roots?: unknown[] }>('listRoots', { title: window }, 10_000)
      const roots = Array.isArray((findResult as any)?.roots) ? (findResult as any).roots : []
      if (roots.length > 0) {
        args.windowRef = (roots[0] as any)?.rootRef || `@r1`
      }
    }
  }

  const result = await piBridge.command<Record<string, unknown>>('look', args, 20_000)
  const outline = (result as any)?.outline
  const stateId = (result as any)?.stateId || (result as any)?.lookId || ''
  const image = (result as any)?.image

  if (!outline) {
    return {
      toolCallId: toolCall.id, toolName: 'computer_use',
      content: '观察完成但未获取到 UI 大纲。请确认目标窗口是否存在。',
      success: true, displayType: 'text',
      metadata: { action: 'observe', stateId }
    }
  }

  const lines = [
    `## 🔍 UI 观察${window ? ` — ${window}` : ''}`,
    '', `**stateId:** \`${stateId}\``, '',
    formatOutlineFull(outline)
  ]

  const toolResult: ToolResult = {
    toolCallId: toolCall.id, toolName: 'computer_use',
    content: lines.join('\n'),
    success: true, displayType: 'text',
    metadata: { action: 'observe', stateId, window }
  }
  if (image && typeof image === 'string') {
    toolResult.screenshot = image.startsWith('data:') ? image : `data:image/png;base64,${image}`
  }
  return toolResult
}

export async function doFindWindow(toolCall: ToolCall): Promise<ToolResult> {
  const window = (toolCall.arguments.window as string) || ''
  const args: Record<string, unknown> = {}
  if (window) args.title = window

  const result = await piBridge.command<{ roots?: unknown[] }>('listRoots', args, 10_000)
  const roots = Array.isArray((result as any)?.roots) ? (result as any).roots : []

  if (roots.length === 0) {
    return {
      toolCallId: toolCall.id, toolName: 'computer_use',
      content: window ? `未找到匹配 "${window}" 的窗口。` : '当前没有打开的窗口。',
      success: true
    }
  }

  const lines = ['## 🖥️ 桌面窗口列表', '']
  for (let i = 0; i < roots.length; i++) {
    const r = roots[i] as Record<string, unknown>
    const rootRef = (r.rootRef as string) || `@r${i + 1}`
    const title = (r.title as string) || '(无标题)'
    const appName = (r.appName as string) || ''
    const isFocused = r.isFocused ? ' 🔥' : ''
    lines.push(`**${i + 1}.** \`${rootRef}\` — ${title}${isFocused}`)
    if (appName) lines.push(`   应用：${appName}`)
    lines.push('')
  }
  lines.push(`共 ${roots.length} 个窗口。使用 action=observe window=@rN 查看元素。`)

  return {
    toolCallId: toolCall.id, toolName: 'computer_use',
    content: lines.join('\n'),
    success: true, displayType: 'text',
    metadata: { action: 'find_window', rootCount: roots.length }
  }
}

// ── 语义操作类 ──

export async function doClickElement(toolCall: ToolCall): Promise<ToolResult> {
  const ref = (toolCall.arguments.ref as string) || ''
  if (!ref) return error(toolCall.id, 'click_element 需要 ref 参数（@e 引用）')
  const lookId = (toolCall.arguments.stateId as string) || 'look'

  const actResult = await piBridge.command<Record<string, unknown>>('act', {
    lookId, action: 'press', target: { ref }, policy: 'default', params: {}
  }, 15_000)

  const outcome = (actResult as any)?.performed?.outcome || 'unknown'
  const newLookId = (actResult as any)?.lookId || lookId

  // 操作后快速截图确认
  let screenshot: string | undefined
  try {
    const lookResult = await piBridge.command<Record<string, unknown>>('look', {
      readText: 'never', includeImage: true, maxDimension: 800
    }, 8_000)
    const img = (lookResult as any)?.image
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

  const outcome = (actResult as any)?.performed?.outcome || 'unknown'
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

  const outcome = (actResult as any)?.performed?.outcome || 'unknown'
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

  const outcome = (actResult as any)?.performed?.outcome || 'unknown'
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

  const outcome = (actResult as any)?.performed?.outcome || 'unknown'

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

  const outcome = (actResult as any)?.performed?.outcome || 'unknown'

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

  const outcome = (actResult as any)?.performed?.outcome || 'unknown'

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
  const satisfied = (result as any)?.satisfied !== false
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
