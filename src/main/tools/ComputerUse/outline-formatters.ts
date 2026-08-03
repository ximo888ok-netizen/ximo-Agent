/**
 * Outline 格式化工具 — 从 ComputerUseTool 提取
 *
 * 将 UI 树形大纲格式化为 Agent 可读的文本
 */

/** 完整格式化 outline — 显示所有层级 */
export function formatOutlineFull(node: Record<string, unknown>, indent = 0): string {
  const lines: string[] = []
  const prefix = '  '.repeat(indent)
  const ref = node.ref || ''
  const role = node.role || ''
  const label = node.label || node.title || ''
  const value = node.value ? ` = "${String(node.value).slice(0, 60)}"` : ''
  const capabilities = node.capabilities as Record<string, unknown> | undefined
  const capStr = capabilities
    ? Object.entries(capabilities)
        .filter(([, v]) => v === true)
        .map(([k]) => k.replace(/^can/, ''))
        .join(', ')
    : ''
  const capDisplay = capStr ? ` [${capStr}]` : ''

  const line = label
    ? `${prefix}${ref} ${role}: "${label}"${value}${capDisplay}`
    : `${prefix}${ref} ${role}${value}${capDisplay}`
  lines.push(line)

  const children = node.children as Record<string, unknown>[] | undefined
  if (Array.isArray(children)) {
    for (const child of children) {
      lines.push(formatOutlineFull(child, indent + 1))
    }
  }

  return lines.join('\n')
}

/** 紧凑格式化 outline — 只显示可交互元素 */
export function formatOutlineCompact(node: Record<string, unknown>, indent = 0): string {
  const lines: string[] = []
  const prefix = '  '.repeat(indent)
  const ref = node.ref || ''
  const role = node.role || ''
  const label = node.label || node.title || ''
  const capabilities = node.capabilities as Record<string, unknown> | undefined

  const isInteractive = capabilities && (
    capabilities.canInvoke || capabilities.canPress || capabilities.canSetValue ||
    capabilities.isEnabled === false
  )
  if (label || isInteractive || indent === 0) {
    const capStr = capabilities
      ? Object.entries(capabilities)
          .filter(([, v]) => v === true)
          .map(([k]) => k.replace(/^can/, ''))
          .join(',')
      : ''
    const value = node.value ? `="${String(node.value).slice(0, 30)}"` : ''
    lines.push(`${prefix}${ref} ${role}: "${label}"${value}${capStr ? ` [${capStr}]` : ''}`)
  }

  const children = node.children as Record<string, unknown>[] | undefined
  if (Array.isArray(children)) {
    for (const child of children) {
      lines.push(formatOutlineCompact(child, indent + 1))
    }
  }

  return lines.join('\n')
}
