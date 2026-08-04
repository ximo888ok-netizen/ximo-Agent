export { genId } from '@shared/utils'

/** 从用户首条消息截取会话标题 */
export function makeTitle(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 24 ? clean.slice(0, 24) + '…' : clean || '新对话'
}
