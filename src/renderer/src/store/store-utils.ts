/**
 * Store 辅助函数 — 从 useStore.ts 提取
 */

/** 生成唯一 ID — 统一从共享模块导出，避免多份实现 */
export { genId } from '@shared/utils'

/** 从消息文本生成会话标题 */
export function makeTitle(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 24 ? clean.slice(0, 24) + '…' : clean || '新对话'
}
