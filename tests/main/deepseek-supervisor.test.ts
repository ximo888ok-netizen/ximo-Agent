import { describe, it, expect } from 'vitest'
import {
  needsCorrection,
  buildCorrectionMessage
} from '../../src/main/deepseek/supervisor'
import type { SupervisionResult } from '../../src/main/deepseek/supervisor'

describe('deepseek/supervisor', () => {
  describe('needsCorrection', () => {
    it('null 返回 false', () => {
      expect(needsCorrection(null)).toBe(false)
    })

    it('verdict=on_track 返回 false', () => {
      const result: SupervisionResult = {
        verdict: 'on_track',
        issues: [],
        severity: 'low'
      }
      expect(needsCorrection(result)).toBe(false)
    })

    it('verdict=lazy 且有 correction 返回 true', () => {
      const result: SupervisionResult = {
        verdict: 'lazy',
        issues: ['跳过了验证步骤'],
        correction: '请执行验证步骤',
        severity: 'medium'
      }
      expect(needsCorrection(result)).toBe(true)
    })

    it('verdict=lazy 但无 correction 返回 false', () => {
      const result: SupervisionResult = {
        verdict: 'lazy',
        issues: ['跳过了验证步骤'],
        correction: undefined,
        severity: 'medium'
      }
      expect(needsCorrection(result)).toBe(false)
    })

    it('verdict=lazy 但 correction 为空字符串 返回 false', () => {
      const result = {
        verdict: 'lazy' as const,
        issues: ['跳过了验证步骤'],
        correction: '',
        severity: 'medium' as const
      }
      expect(needsCorrection(result)).toBe(false)
    })

    it('verdict=off_track 且有 correction 返回 true', () => {
      const result: SupervisionResult = {
        verdict: 'off_track',
        issues: ['偏离了原始任务'],
        correction: '请回到原始任务',
        severity: 'high'
      }
      expect(needsCorrection(result)).toBe(true)
    })

    it('verdict=violation 且有 correction 返回 true', () => {
      const result: SupervisionResult = {
        verdict: 'violation',
        issues: ['违反五锁协议'],
        correction: '请先确认计划再执行',
        severity: 'high'
      }
      expect(needsCorrection(result)).toBe(true)
    })
  })

  describe('buildCorrectionMessage', () => {
    it('lazy verdict 包含正确标签', () => {
      const result: SupervisionResult = {
        verdict: 'lazy',
        issues: ['问题1', '问题2'],
        correction: '纠正指令',
        severity: 'medium'
      }
      const msg = buildCorrectionMessage(result, 3)
      expect(msg).toContain('偷懒')
      expect(msg).toContain('第 3 轮')
      expect(msg).toContain('问题1')
      expect(msg).toContain('问题2')
      expect(msg).toContain('纠正指令')
      expect(msg).toContain('medium')
    })

    it('off_track verdict 包含正确标签', () => {
      const result: SupervisionResult = {
        verdict: 'off_track',
        issues: ['跑偏了'],
        correction: '回到正轨',
        severity: 'high'
      }
      const msg = buildCorrectionMessage(result, 1)
      expect(msg).toContain('跑偏')
    })

    it('violation verdict 包含正确标签', () => {
      const result: SupervisionResult = {
        verdict: 'violation',
        issues: ['违规了'],
        correction: '遵守协议',
        severity: 'high'
      }
      const msg = buildCorrectionMessage(result, 5)
      expect(msg).toContain('违规')
    })

    it('on_track verdict 包含正常标签', () => {
      const result: SupervisionResult = {
        verdict: 'on_track',
        issues: [],
        correction: '',
        severity: 'low'
      }
      const msg = buildCorrectionMessage(result, 2)
      expect(msg).toContain('正常')
    })

    it('多个 issues 按编号列出', () => {
      const result: SupervisionResult = {
        verdict: 'lazy',
        issues: ['第一', '第二', '第三'],
        correction: '修复',
        severity: 'low'
      }
      const msg = buildCorrectionMessage(result, 1)
      expect(msg).toContain('1. 第一')
      expect(msg).toContain('2. 第二')
      expect(msg).toContain('3. 第三')
    })
  })
})
