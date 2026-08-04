/**
 * 生成唯一 ID — 主进程与渲染进程共用。
 *
 * 原先在 src/renderer/src/store/utils.ts 和 src/main/KnowledgeStore.ts
 * 各有一份实现，现统一到此处单一数据源。
 */
export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
