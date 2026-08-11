import { describe, it, expect } from 'vitest'
import { resolveActiveProvider, DEEPSEEK_PROVIDER_ID } from '../../src/main/deepseek/provider'
import { DEFAULT_SETTINGS } from '../../src/shared/defaults'
import type { AppSettings, ProviderConfig } from '../../src/shared/types'

function makeSettings(patch: Partial<AppSettings> = {}): AppSettings {
  return { ...DEFAULT_SETTINGS, apiKey: 'sk-test', ...patch }
}

function makeProvider(patch: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: 'sk-or-test',
    models: ['gpt-4o', 'claude-3.5-sonnet'],
    ...patch
  }
}

describe('deepseek/provider — resolveActiveProvider', () => {
  describe('内置 DeepSeek 服务商', () => {
    it('复用顶层 apiKey/baseUrl 字段，1M 上下文，能力全开', () => {
      const settings = makeSettings({ baseUrl: 'https://api.deepseek.com/v1' })
      const p = resolveActiveProvider(settings, DEEPSEEK_PROVIDER_ID)

      expect(p.id).toBe(DEEPSEEK_PROVIDER_ID)
      expect(p.apiKey).toBe('sk-test')
      expect(p.baseUrl).toBe('https://api.deepseek.com/v1')
      expect(p.contextWindow).toBe(1_000_000)
      expect(p.isDeepSeek).toBe(true)
      expect(p.capabilities).toEqual({ sendReasoningParams: true, sendStreamUsage: true })
    })

    it('未指定 providerId 且无 activeProviderId 时回退到内置 DeepSeek', () => {
      const settings = makeSettings({ activeProviderId: undefined })
      const p = resolveActiveProvider(settings)
      expect(p.id).toBe(DEEPSEEK_PROVIDER_ID)
    })

    it('activeProviderId=deepseek 时解析内置服务商', () => {
      const settings = makeSettings({ activeProviderId: 'deepseek' })
      const p = resolveActiveProvider(settings)
      expect(p.isDeepSeek).toBe(true)
    })
  })

  describe('自定义服务商', () => {
    it('按 providerId 解析列表中的条目', () => {
      const settings = makeSettings({ providers: [makeProvider()] })
      const p = resolveActiveProvider(settings, 'openrouter')

      expect(p.id).toBe('openrouter')
      expect(p.apiKey).toBe('sk-or-test')
      expect(p.baseUrl).toBe('https://openrouter.ai/api/v1')
      expect(p.isDeepSeek).toBe(false)
    })

    it('缺省上下文窗口 131072 / 最大输出 8192', () => {
      const settings = makeSettings({ providers: [makeProvider()] })
      const p = resolveActiveProvider(settings, 'openrouter')
      expect(p.contextWindow).toBe(131_072)
      expect(p.maxOutputTokens).toBe(8192)
    })

    it('显式配置覆盖缺省值', () => {
      const settings = makeSettings({
        providers: [makeProvider({ contextWindowTokens: 32_768, maxOutputTokens: 4096 })]
      })
      const p = resolveActiveProvider(settings, 'openrouter')
      expect(p.contextWindow).toBe(32_768)
      expect(p.maxOutputTokens).toBe(4096)
    })

    it('能力开关缺省为 true（兼容 DeepSeek 系第三方）', () => {
      const settings = makeSettings({ providers: [makeProvider()] })
      const p = resolveActiveProvider(settings, 'openrouter')
      expect(p.capabilities).toEqual({ sendReasoningParams: true, sendStreamUsage: true })
    })

    it('能力开关显式关闭生效', () => {
      const settings = makeSettings({
        providers: [makeProvider({ sendReasoningParams: false, sendStreamUsage: false })]
      })
      const p = resolveActiveProvider(settings, 'openrouter')
      expect(p.capabilities).toEqual({ sendReasoningParams: false, sendStreamUsage: false })
    })

    it('缺省 providerId 时跟随 activeProviderId', () => {
      const settings = makeSettings({
        providers: [makeProvider()],
        activeProviderId: 'openrouter'
      })
      const p = resolveActiveProvider(settings)
      expect(p.id).toBe('openrouter')
    })
  })

  describe('回退保护', () => {
    it('providerId 不在列表中时回退到内置 DeepSeek', () => {
      const settings = makeSettings({ providers: [makeProvider()] })
      const p = resolveActiveProvider(settings, 'not-exist')
      expect(p.id).toBe(DEEPSEEK_PROVIDER_ID)
      expect(p.isDeepSeek).toBe(true)
    })

    it('providers 为空数组时回退到内置 DeepSeek', () => {
      const settings = makeSettings({ providers: [], activeProviderId: 'openrouter' })
      const p = resolveActiveProvider(settings)
      expect(p.id).toBe(DEEPSEEK_PROVIDER_ID)
    })
  })
})
