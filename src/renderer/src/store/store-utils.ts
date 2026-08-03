/**
 * Store 辅助函数 — 从 useStore.ts 提取
 */

/** 生成唯一 ID */
export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** 从消息文本生成会话标题 */
export function makeTitle(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 24 ? clean.slice(0, 24) + '…' : clean || '新对话'
}
