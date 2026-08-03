import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS } from '../../src/shared/defaults'

describe('DEFAULT_SETTINGS', () => {
  it('包含所有必需字段', () => {
    expect(DEFAULT_SETTINGS).toBeDefined()
    expect(typeof DEFAULT_SETTINGS.apiKey).toBe('string')
    expect(typeof DEFAULT_SETTINGS.baseUrl).toBe('string')
    expect(typeof DEFAULT_SETTINGS.model).toBe('string')
  })

  it('默认 apiKey 为空字符串', () => {
    expect(DEFAULT_SETTINGS.apiKey).toBe('')
  })

  it('默认 baseUrl 指向 DeepSeek API', () => {
    expect(DEFAULT_SETTINGS.baseUrl).toBe('https://api.deepseek.com/v1')
  })

  it('默认 model 为 deepseek-v4-pro', () => {
    expect(DEFAULT_SETTINGS.model).toBe('deepseek-v4-pro')
  })

  it('默认 thinkingMode 开启', () => {
    expect(DEFAULT_SETTINGS.thinkingMode).toBe(true)
  })

  it('默认 reasoningEffort 为 high', () => {
    expect(DEFAULT_SETTINGS.reasoningEffort).toBe('high')
  })

  it('默认 yoloMode 关闭', () => {
    expect(DEFAULT_SETTINGS.yoloMode).toBe(false)
  })

  it('默认主题为 dark', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('dark')
  })

  it('默认 checkpointEnabled 开启', () => {
    expect(DEFAULT_SETTINGS.checkpointEnabled).toBe(true)
  })

  it('默认 memoryEnabled 开启', () => {
    expect(DEFAULT_SETTINGS.memoryEnabled).toBe(true)
  })

  it('默认 maxToolRounds 为 30', () => {
    expect(DEFAULT_SETTINGS.maxToolRounds).toBe(30)
  })

  it('默认 maxContextChars 为 300000', () => {
    expect(DEFAULT_SETTINGS.maxContextChars).toBe(300000)
  })

  it('默认 maxToolResultChars 为 8000', () => {
    expect(DEFAULT_SETTINGS.maxToolResultChars).toBe(8000)
  })

  it('默认搜索引擎为 bing', () => {
    expect(DEFAULT_SETTINGS.defaultSearchEngine).toBe('bing')
  })

  it('默认 GPU 加速开启', () => {
    expect(DEFAULT_SETTINGS.gpuAcceleration).toBe(true)
  })

  it('默认 recentProjects 为空数组', () => {
    expect(DEFAULT_SETTINGS.recentProjects).toEqual([])
  })

  it('subAgent 默认模型为 flash', () => {
    expect(DEFAULT_SETTINGS.subAgentModel).toBe('deepseek-v4-flash')
  })

  it('上下文压缩参数有合理默认值', () => {
    expect(DEFAULT_SETTINGS.contextRecentKeep).toBe(5)
    expect(DEFAULT_SETTINGS.contextSnippedKeep).toBe(200)
    expect(DEFAULT_SETTINGS.contextPrunedKeep).toBe(80)
  })

  it('浏览器默认 headless', () => {
    expect(DEFAULT_SETTINGS.browserHeadless).toBe(true)
  })

  it('默认视口 1280x800', () => {
    expect(DEFAULT_SETTINGS.browserViewportWidth).toBe(1280)
    expect(DEFAULT_SETTINGS.browserViewportHeight).toBe(800)
  })
})
