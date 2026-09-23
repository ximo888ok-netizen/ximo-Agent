import { describe, it, expect } from 'vitest'
import {
  buildMemory,
  countContentLines,
  parseMemory,
  LINE_BUDGET,
  MEMORY_SECTIONS,
} from '../../src/renderer/src/lib/memory-format'

describe('memory-format — 记忆文本解析与拼回', () => {
  it('空内容解析为空的 structured，且不产生任何落盘文本', () => {
    const p = parseMemory('')
    expect(p.mode).toBe('structured')
    expect(buildMemory(p)).toBe('')
    expect(buildMemory(parseMemory('   \n\n  '))).toBe('')
  })

  it('无分类标题的原文保持 freeform，内容一字不改', () => {
    const raw = '- 我喜欢简短回答\n- 不要用 emoji\n'
    const p = parseMemory(raw)
    expect(p.mode).toBe('freeform')
    expect(p.freeText).toBe(raw)
    expect(buildMemory(p)).toBe(raw)
  })

  it('识别三类标题并分桶', () => {
    const raw = [
      '## 用户习惯',
      '- 中文回答',
      '',
      '## 踩过的坑',
      '- 改文件前先读全文',
      '',
      '## 工具语法',
      '- office_docs 的 action 取 create',
      '',
    ].join('\n')
    const p = parseMemory(raw)
    expect(p.mode).toBe('structured')
    expect(p.sections.habits).toBe('- 中文回答')
    expect(p.sections.pitfalls).toBe('- 改文件前先读全文')
    expect(p.sections.tooling).toBe('- office_docs 的 action 取 create')
    expect(p.other).toBe('')
  })

  it('往返稳定：structured 解析后再拼回，内容不丢失', () => {
    const raw = '## 用户习惯\n- 中文回答\n\n## 工具语法\n- foo(bar)\n'
    const once = buildMemory(parseMemory(raw))
    const twice = buildMemory(parseMemory(once))
    // 拼回文本可能重排/规整空白，但二次往返必须完全收敛
    expect(twice).toBe(once)
    expect(once).toContain('- 中文回答')
    expect(once).toContain('- foo(bar)')
    expect(once).not.toContain('## 踩过的坑') // 空分类不写标题
  })

  it('无法识别的标题与其正文进入 other，且原文保留', () => {
    const raw = '## 用户习惯\n- 中文回答\n\n## 备忘\n- 记得跑测试\n'
    const p = parseMemory(raw)
    expect(p.sections.habits).toBe('- 中文回答')
    expect(p.other).toContain('## 备忘')
    expect(p.other).toContain('- 记得跑测试')
    expect(buildMemory(p)).toContain('## 其他')
    expect(buildMemory(p)).toContain('- 记得跑测试')
  })

  it('标题行不需要额外空格，且支持 # ~ #### 多级', () => {
    expect(parseMemory('# 用户习惯\n- a').sections.habits).toBe('- a')
    expect(parseMemory('#### 用户习惯\n- a').sections.habits).toBe('- a')
  })

  it('正文行数不含标题行', () => {
    const text = '## 用户习惯\n- a\n- b\n\n## 踩过的坑\n- c\n'
    expect(countContentLines(text)).toBe(3)
    expect(LINE_BUDGET).toBe(30)
    expect(MEMORY_SECTIONS).toHaveLength(3)
  })

  it('全部清空后拼回为空串 —— 等价于清空记忆而非写入空标题', () => {
    const cleared = { ...parseMemory('## 用户习惯\n- a'), sections: { habits: '', pitfalls: '', tooling: '' }, other: '' }
    expect(buildMemory(cleared)).toBe('')
  })
})
