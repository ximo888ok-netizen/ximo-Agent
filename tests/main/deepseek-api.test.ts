import { describe, it, expect } from 'vitest'
import { toApiEffort } from '../../src/main/deepseek/api'

describe('deepseek/api', () => {
  describe('toApiEffort', () => {
    it('off 映射为 off', () => {
      expect(toApiEffort('off')).toBe('off')
    })

    it('high 映射为 high', () => {
      expect(toApiEffort('high')).toBe('high')
    })

    it('ultra 映射为 max（应用层自定义等级等价于 API 层 max）', () => {
      expect(toApiEffort('ultra')).toBe('max')
    })

    it('max 映射为 max', () => {
      expect(toApiEffort('max')).toBe('max')
    })
  })
})
