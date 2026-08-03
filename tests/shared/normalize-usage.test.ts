import { describe, it, expect } from 'vitest'
import { normaliseUsage } from '../../src/shared/cache/normalize-usage'

describe('normaliseUsage', () => {
  it('DeepSeek 形态：prompt_cache_hit/miss 在顶层', () => {
    const result = normaliseUsage({
      prompt_tokens: 1000,
      completion_tokens: 200,
      total_tokens: 1200,
      prompt_cache_hit_tokens: 800,
      prompt_cache_miss_tokens: 200
    })
    expect(result.promptTokens).toBe(1000)
    expect(result.completionTokens).toBe(200)
    expect(result.totalTokens).toBe(1200)
    expect(result.cacheHitTokens).toBe(800)
    expect(result.cacheMissTokens).toBe(200)
  })

  it('OpenAI 形态：cached_tokens 嵌套在 prompt_tokens_details', () => {
    const result = normaliseUsage({
      prompt_tokens: 1000,
      completion_tokens: 100,
      prompt_tokens_details: { cached_tokens: 700 }
    })
    expect(result.cacheHitTokens).toBe(700)
    // miss = prompt - hit = 300
    expect(result.cacheMissTokens).toBe(300)
  })

  it('hit 和 miss 都为 0 时返回 0', () => {
    const result = normaliseUsage({
      prompt_tokens: 500,
      completion_tokens: 50
    })
    expect(result.cacheHitTokens).toBe(0)
    expect(result.cacheMissTokens).toBe(0)
  })

  it('只有 hit 无 miss 时派生 miss = prompt - hit', () => {
    const result = normaliseUsage({
      prompt_tokens: 500,
      prompt_cache_hit_tokens: 300
    })
    expect(result.cacheHitTokens).toBe(300)
    expect(result.cacheMissTokens).toBe(200)
  })

  it('hit > prompt 时不派生负数 miss', () => {
    const result = normaliseUsage({
      prompt_tokens: 100,
      prompt_cache_hit_tokens: 200
    })
    // hit=200 > prompt=100，不满足 promptTokens > hit 条件，miss 保持 0
    expect(result.cacheMissTokens).toBe(0)
  })

  it('reasoning_tokens 从 completion_tokens_details 读取', () => {
    const result = normaliseUsage({
      prompt_tokens: 100,
      completion_tokens: 200,
      completion_tokens_details: { reasoning_tokens: 150 }
    })
    expect(result.reasoningTokens).toBe(150)
  })

  it('reasoning_tokens 从 prompt_tokens_details 读取（fallback）', () => {
    const result = normaliseUsage({
      prompt_tokens: 100,
      completion_tokens: 200,
      prompt_tokens_details: { reasoning_tokens: 80 }
    })
    expect(result.reasoningTokens).toBe(80)
  })

  it('completion_tokens_details.reasoning_tokens 优先于 prompt_tokens_details', () => {
    const result = normaliseUsage({
      prompt_tokens: 100,
      completion_tokens: 200,
      completion_tokens_details: { reasoning_tokens: 50 },
      prompt_tokens_details: { reasoning_tokens: 80 }
    })
    expect(result.reasoningTokens).toBe(50)
  })

  it('finish_reason 传递', () => {
    const result = normaliseUsage({
      prompt_tokens: 10,
      finish_reason: 'stop'
    })
    expect(result.finishReason).toBe('stop')
  })

  it('无 finish_reason 时默认空字符串', () => {
    const result = normaliseUsage({ prompt_tokens: 10 })
    expect(result.finishReason).toBe('')
  })

  it('total_tokens 缺失时派生 = prompt + completion', () => {
    const result = normaliseUsage({
      prompt_tokens: 300,
      completion_tokens: 100
    })
    expect(result.totalTokens).toBe(400)
  })

  it('空对象输入返回全 0', () => {
    const result = normaliseUsage({})
    expect(result.promptTokens).toBe(0)
    expect(result.completionTokens).toBe(0)
    expect(result.totalTokens).toBe(0)
    expect(result.cacheHitTokens).toBe(0)
    expect(result.cacheMissTokens).toBe(0)
    expect(result.reasoningTokens).toBe(0)
    expect(result.finishReason).toBe('')
  })

  it('DeepSeek 形态 hit+miss 已正确填充时不派生', () => {
    const result = normaliseUsage({
      prompt_tokens: 1000,
      prompt_cache_hit_tokens: 700,
      prompt_cache_miss_tokens: 300
    })
    // miss 已有值 300，不应被派生覆盖
    expect(result.cacheMissTokens).toBe(300)
  })
})
