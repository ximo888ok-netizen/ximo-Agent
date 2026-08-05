// 渲染层服务商工具 — 从 settings 解析当前活跃服务商的展示属性

import type { AppSettings, ProviderConfig } from '@shared/types'

/** 内置 DeepSeek 服务商 ID（与主进程 provider.ts 保持一致） */
export const DEEPSEEK_PROVIDER_ID = 'deepseek'

/** DeepSeek-V4 系列上下文窗口（tokens） */
export const DEEPSEEK_CONTEXT_WINDOW = 1_000_000

/** 自定义服务商缺省上下文窗口 */
const DEFAULT_CUSTOM_CONTEXT_WINDOW = 131_072

/** 获取当前活跃的自定义服务商配置（内置 DeepSeek 时返回 undefined） */
export function getActiveCustomProvider(settings: AppSettings | null | undefined): ProviderConfig | undefined {
  if (!settings) return undefined
  const id = settings.activeProviderId ?? DEEPSEEK_PROVIDER_ID
  if (id === DEEPSEEK_PROVIDER_ID) return undefined
  return (settings.providers ?? []).find((p) => p.id === id)
}

/** 当前活跃服务商的上下文窗口（内置 DeepSeek = 1M） */
export function getActiveContextWindow(settings: AppSettings | null | undefined): number {
  const p = getActiveCustomProvider(settings)
  return p?.contextWindowTokens ?? (p ? DEFAULT_CUSTOM_CONTEXT_WINDOW : DEEPSEEK_CONTEXT_WINDOW)
}

/** 当前活跃服务商是否支持 thinking/reasoning 专属参数 */
export function isReasoningCapable(settings: AppSettings | null | undefined): boolean {
  const p = getActiveCustomProvider(settings)
  return p ? p.sendReasoningParams !== false : true
}
