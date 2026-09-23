import type { ReasoningEffort } from '@shared/types'

/**
 * 思考强度档位 —— 全应用单一来源。
 *
 * 面板（ReasoningSlider）与设置页（ModelTab / AgentTab）共用这一份，
 * 避免三处各自维护一个数组导致标签/描述漂移。
 *
 * 标签是**位置语义**（在五档标尺上的第几格），不是枚举名的直译：
 *   off→关闭 · low→低 · high→中 · max→高 · ultra→超高
 * 所以 `high` 显示为「中」—— 它在这条标尺上确实位于正中。
 */
export interface ReasoningLevel {
  value: ReasoningEffort
  label: string
  desc: string
}

export const REASONING_LEVELS: readonly ReasoningLevel[] = [
  { value: 'off', label: '关闭', desc: '不输出思维链，响应最快' },
  { value: 'low', label: '低', desc: '轻度推理，明显快于默认档' },
  { value: 'high', label: '中', desc: '均衡推理（默认）' },
  { value: 'max', label: '高', desc: '深度推理，适合复杂任务' },
  { value: 'ultra', label: '超高', desc: '极致推理 + 工程范式 + 监督审查' }
]

export const LEVEL_COUNT = REASONING_LEVELS.length

/**
 * 归一化任意来源的档位值。
 * settings.json 里可能残留旧版本或手改的非法值（如 `'low'` 在加入这一档之前、
 * 或拼错的字符串），直接 findIndex 会返回 -1 并让下游读到 undefined 抛错
 * （曾导致整棵 React 树卸载、表现为空白窗口）。统一兜底到默认档。
 */
export function normalizeEffort(value: unknown): ReasoningEffort {
  return REASONING_LEVELS.some((l) => l.value === value)
    ? (value as ReasoningEffort)
    : 'high'
}

/** 档位在标尺上的索引（0 = 关闭，LEVEL_COUNT-1 = 超高） */
export function effortIndex(value: ReasoningEffort): number {
  const i = REASONING_LEVELS.findIndex((l) => l.value === value)
  return i < 0 ? 0 : i
}

/** 该档位是否开启思考（除 off 外都开） */
export function isThinking(value: ReasoningEffort): boolean {
  return value !== 'off'
}
