/**
 * 服务商解析层 — 将 settings 解析为当前活跃的模型服务商配置。
 *
 * 内置 DeepSeek 服务商（id='deepseek'）复用顶层 apiKey/baseUrl 字段，
 * 能力全开，行为与历史版本完全一致。
 * 自定义服务商从 providers 列表读取，DeepSeek 专属参数由能力开关门控。
 */

import type { AppSettings } from '@shared/types'

/** 服务商能力开关 — 控制是否发送 DeepSeek 专属请求参数 */
export interface ProviderCapabilities {
  /** 发送 enable_thinking / reasoning_effort，并保留消息中的 reasoning_content 字段 */
  sendReasoningParams: boolean
  /** 发送 stream_options.include_usage */
  sendStreamUsage: boolean
}

/** 解析后的活跃服务商 */
export interface ResolvedProvider {
  id: string
  name: string
  apiKey: string
  baseUrl: string
  /** 上下文窗口大小（tokens） */
  contextWindow: number
  /** 单次最大输出 token */
  maxOutputTokens: number
  /** 是否为内置 DeepSeek 服务商 */
  isDeepSeek: boolean
  capabilities: ProviderCapabilities
}

/** 内置 DeepSeek 服务商 ID */
export const DEEPSEEK_PROVIDER_ID = 'deepseek'

/** DeepSeek-V4 系列上下文窗口 */
const DEEPSEEK_CONTEXT_WINDOW = 1_000_000

/** 自定义服务商缺省上下文窗口 */
const DEFAULT_CUSTOM_CONTEXT_WINDOW = 131_072

/** 自定义服务商缺省最大输出 token */
const DEFAULT_CUSTOM_MAX_OUTPUT = 8192

/**
 * 解析活跃服务商。
 * @param settings   应用设置
 * @param providerId 指定服务商 ID（缺省取 settings.activeProviderId）
 *
 * 自定义服务商不存在时回退到内置 DeepSeek，保证链路不中断。
 */
export function resolveActiveProvider(settings: AppSettings, providerId?: string): ResolvedProvider {
  const id = providerId || settings.activeProviderId || DEEPSEEK_PROVIDER_ID

  if (id === DEEPSEEK_PROVIDER_ID) {
    return {
      id: DEEPSEEK_PROVIDER_ID,
      name: 'DeepSeek',
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
      contextWindow: DEEPSEEK_CONTEXT_WINDOW,
      maxOutputTokens: settings.maxTokens,
      isDeepSeek: true,
      capabilities: { sendReasoningParams: true, sendStreamUsage: true }
    }
  }

  const cfg = (settings.providers ?? []).find((p) => p.id === id)
  if (!cfg) {
    return resolveActiveProvider(settings, DEEPSEEK_PROVIDER_ID)
  }

  return {
    id: cfg.id,
    name: cfg.name,
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl,
    contextWindow: cfg.contextWindowTokens ?? DEFAULT_CUSTOM_CONTEXT_WINDOW,
    maxOutputTokens: cfg.maxOutputTokens ?? DEFAULT_CUSTOM_MAX_OUTPUT,
    isDeepSeek: false,
    capabilities: {
      sendReasoningParams: cfg.sendReasoningParams ?? true,
      sendStreamUsage: cfg.sendStreamUsage ?? true
    }
  }
}
