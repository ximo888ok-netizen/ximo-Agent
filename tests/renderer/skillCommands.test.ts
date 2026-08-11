import { describe, it, expect } from 'vitest'
import type { ImportedSkill } from '../../src/shared/types'
import {
  skillToCommandName,
  buildSkillCommands,
  buildSkillSystemHint,
  isSkillCommandHint,
  extractSkillIdFromHint,
  SKILL_CMD_MARKER
} from '../../src/renderer/src/lib/skillCommands'

const baseSkill = (overrides: Partial<ImportedSkill> = {}): ImportedSkill => ({
  id: 's1',
  name: 'reverse-flow',
  description: '二进制逆向工作流',
  triggers: ['逆向', '逆向模式'],
  body: '# Reverse Flow\n\n## Activation protocol\n执行分析流程。',
  enabled: true,
  importedAt: 1720000000000,
  source: 'file',
  fileName: 'reverse-flow.md',
  ...overrides
})

describe('skillToCommandName', () => {
  it('合法技能名原样保留', () => {
    expect(skillToCommandName('reverse-flow')).toBe('reverse-flow')
  })
  it('中文技能名保留', () => {
    expect(skillToCommandName('逆向工作流')).toBe('逆向工作流')
  })
  it('非法字符转为连字符', () => {
    expect(skillToCommandName('My Skill!')).toBe('My-Skill')
    expect(skillToCommandName('a/b_c')).toBe('a-b_c')
  })
  it('空名回退 skill', () => {
    expect(skillToCommandName('')).toBe('skill')
    expect(skillToCommandName('   ')).toBe('skill')
  })
  it('仅非法字符回退 skill', () => {
    expect(skillToCommandName('!!!')).toBe('skill')
  })
})

describe('buildSkillSystemHint', () => {
  it('包含触发词时注入触发词行', () => {
    const hint = buildSkillSystemHint(baseSkill())
    expect(hint.startsWith(`${SKILL_CMD_MARKER}s1`)).toBe(true)
    expect(hint).toContain('**触发词：** `逆向`, `逆向模式`')
    expect(hint).toContain('### reverse-flow')
    expect(hint).toContain('# Reverse Flow')
  })
  it('无触发词时不注入触发词行', () => {
    const hint = buildSkillSystemHint(baseSkill({ triggers: [] }))
    expect(hint).not.toContain('触发词')
  })
})

describe('isSkillCommandHint / extractSkillIdFromHint', () => {
  it('识别技能注入提示词', () => {
    const hint = buildSkillSystemHint(baseSkill())
    expect(isSkillCommandHint(hint)).toBe(true)
    expect(extractSkillIdFromHint(hint)).toBe('s1')
  })
  it('普通 systemHint 不识别', () => {
    expect(isSkillCommandHint('【Plan 模式】请帮我规划')).toBe(false)
    expect(extractSkillIdFromHint('【Plan 模式】请帮我规划')).toBe(null)
  })
})

describe('buildSkillCommands', () => {
  it('只包含已启用技能，命令以 / 开头', () => {
    const skills = [
      baseSkill(),
      baseSkill({ id: 's2', name: 'disabled-skill', enabled: false })
    ]
    const cmds = buildSkillCommands(skills)
    expect(cmds).toHaveLength(1)
    expect(cmds[0]!.cmd).toBe('/reverse-flow')
    expect(cmds[0]!.skillId).toBe('s1')
    expect(cmds[0]!.label).toBe('reverse-flow')
  })
  it('空列表返回空数组', () => {
    expect(buildSkillCommands([])).toEqual([])
  })
  it('systemHint 携带可解析的技能 ID', () => {
    const [cmd] = buildSkillCommands([baseSkill()])
    expect(extractSkillIdFromHint(cmd!.systemHint)).toBe('s1')
  })
})
