/** ComputerUse 感知类动作 — 截图、观察、查找窗口 */

import type { ToolCall, ToolResult } from '@shared/types'
import { piBridge } from './PiBridge'
import { formatOutlineFull, formatOutlineCompact } from './outline-formatters'

export async function doScreenshot(toolCall: ToolCall): Promise<ToolResult> {
  const result = await piBridge.command<Record<string, unknown>>('look', {
    readText: 'never', includeImage: true, maxDimension: 1280
  }, 15_000)

  const image = result?.image
  const stateId = result?.stateId || result?.lookId || ''
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
      const roots = Array.isArray(findResult?.roots) ? findResult.roots : []
      if (roots.length > 0) {
        args.windowRef = (roots[0] as Record<string, unknown>)?.rootRef as string || `@r1`
      }
    }
  }

  const result = await piBridge.command<Record<string, unknown>>('look', args, 20_000)
  const outline = result?.outline
  const stateId = result?.stateId || result?.lookId || ''
  const image = result?.image

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
    formatOutlineFull(outline as Record<string, unknown>)
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
  const roots = Array.isArray(result?.roots) ? result.roots : []

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
