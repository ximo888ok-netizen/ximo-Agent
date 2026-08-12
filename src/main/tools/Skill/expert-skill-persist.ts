import type { Skill } from '@shared/types'
import type { AgentEntry } from './expert-config'
import { loadSkills, saveSkills } from '@main/SkillStore'

/**
 * 将激活的专家信息保存为技能（source='expert'）。
 * 如果该专家已保存过则更新，避免重复。
 */
export async function saveExpertAsSkill(
  agent: AgentEntry,
  tools: string[],
  workflow: string,
  systemPrompt: string
): Promise<void> {
  try {
    const skills = await loadSkills()
    const existingIdx = skills.findIndex(s => s.source === 'expert' && s.expertId === agent.id)

    const skill: Skill = {
      id: existingIdx >= 0 ? skills[existingIdx].id : (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
      name: `专家：${agent.name}`,
      description: agent.description,
      createdAt: existingIdx >= 0 ? skills[existingIdx].createdAt : Date.now(),
      updatedAt: Date.now(),
      invokeCount: existingIdx >= 0 ? skills[existingIdx].invokeCount : 0,
      steps: [],
      tags: [agent.division, '专家'],
      source: 'expert',
      expertId: agent.id,
      expertName: agent.name,
      systemPrompt,
      configuredTools: tools,
      workflow
    }

    if (existingIdx >= 0) {
      skills[existingIdx] = skill
    } else {
      skills.unshift(skill)
    }
    await saveSkills(skills)
  } catch (e) {
    console.error('[AgentExpertTool] 保存专家技能失败：', e)
  }
}
