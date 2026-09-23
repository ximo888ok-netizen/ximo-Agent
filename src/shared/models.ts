import type { ModelId } from './types'

/**
 * 内置 DeepSeek 模型 ID — 唯一来源
 *
 * 注意：这两个 ID 会作为请求体的 `model` 字段原样发给 API，
 * 改名等同于改请求参数，必须与 DeepSeek 侧的模型名一致。
 *
 * - `deepseek-v4-pro`   旗舰版 · 深度推理
 * - `deepseek-flash`    原生多模态 · 快速响应（由原 `deepseek-v4-flash` 更名而来）
 */
export const DS_MODEL_PRO: ModelId = 'deepseek-v4-pro'
export const DS_MODEL_FLASH: ModelId = 'deepseek-flash'

/**
 * 历史模型 ID → 现行 ID
 *
 * 用户设置文件里可能存着旧 ID，不迁移的话会把已不存在的模型名发给 API。
 * 目前只有一次更名：`deepseek-v4-flash` → `deepseek-flash`。
 */
const LEGACY_MODEL_IDS: Record<string, ModelId> = {
  'deepseek-v4-flash': DS_MODEL_FLASH,
}

/** 把历史模型 ID 归一化为现行 ID（非历史 ID 原样返回） */
export function normalizeModelId(model: string | undefined): ModelId | undefined {
  if (!model) return undefined
  return LEGACY_MODEL_IDS[model] ?? model
}

/**
 * 完整展示名。
 * 非内置模型（自定义服务商的模型名）原样返回 —— 不再用 `includes('pro')` 猜测，
 * 那种写法会把 `gpt-4o` 这类模型显示成「V4-Flash」。
 */
export function getModelLabel(model: string | undefined): string {
  if (!model) return ''
  if (model === DS_MODEL_PRO) return 'DeepSeek V4 Pro'
  if (model === DS_MODEL_FLASH) return 'DeepSeek Flash'
  return model
}

/** 短标签 — 输入区与会话头部的小胶囊用 */
export function getModelShortLabel(model: string | undefined): string {
  if (!model) return ''
  if (model === DS_MODEL_PRO) return 'V4 Pro'
  if (model === DS_MODEL_FLASH) return 'Flash'
  return model
}
