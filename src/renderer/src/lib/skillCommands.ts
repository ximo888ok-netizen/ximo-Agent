/**
 * 导入技能斜杠命令 — 纯函数模块（可独立测试）
 *
 * 机制：
 * 1. 已启用的导入技能（ImportedSkill）动态注册为 `/技能名` 斜杠命令
 * 2. 用户在 `/` 菜单选中后，技能正文以 systemHint 形式注入单轮用户消息
 * 3. 技能命令的注入标识（`commandSkillId`）写入用户消息，
 *    与 buildApiMessages 协作，保证命中时不被重复被动注入
 */
import type { ImportedSkill } from '@shared/types'

/** 技能命令条目 — 与内置斜杠命令结构一致，额外携带 skillId 供去重 */
export interface SkillCommandEntry {
  cmd: string
  label: string
  description: string
  systemHint: string
  skillId: string
}

/** 技能命令注入标识 — 注入在 systemHint 开头，buildApiMessages 据此识别 */
export const SKILL_CMD_MARKER = '【技能调用】'

/** 命令名允许的字符集（技能名会做 slug 化，保证 / 命令合法） */
const CMD_INVALID_CHARS = /[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g

/** 技能名 → 斜杠命令名（slug 化：非法字符转 -，压缩连续 -，去首尾 -） */
export function skillToCommandName(name: string): string {
  const slug = name
    .trim()
    .replace(CMD_INVALID_CHARS, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'skill'
}

/**
 * 将已启用的导入技能转换为斜杠命令描述列表。
 * 纯函数 — 不访问 window/IPC，便于测试。
 */
export function buildSkillCommands(skills: ImportedSkill[]): Array<{
  cmd: string
  label: string
  description: string
  systemHint: string
  skillId: string
}> {
  return skills
    .filter((s) => s.enabled)
    .map((s) => ({
      cmd: `/${skillToCommandName(s.name)}`,
      label: s.name,
      description: s.description || '导入技能',
      systemHint: buildSkillSystemHint(s),
      skillId: s.id
    }))
}

/** 为单个技能构建 systemHint — 技能正文以「用户指令」形式注入单轮消息 */
export function buildSkillSystemHint(skill: ImportedSkill): string {
  const triggerLine = skill.triggers.length > 0
    ? `\n**触发词：** ${skill.triggers.map((t) => `\`${t}\``).join(', ')}`
    : ''
  return `${SKILL_CMD_MARKER}${skill.id}\n### ${skill.name}\n${skill.description}${triggerLine}\n\n${skill.body}`
}

/** 判断一条 systemHint 是否来自技能命令注入 */
export function isSkillCommandHint(systemHint: string): boolean {
  return systemHint.startsWith(SKILL_CMD_MARKER)
}

/** 从技能命令注入的 systemHint 中提取技能 ID（解析失败返回 null） */
export function extractSkillIdFromHint(systemHint: string): string | null {
  if (!isSkillCommandHint(systemHint)) return null
  const line = systemHint.split('\n', 1)[0] ?? ''
  const id = line.slice(SKILL_CMD_MARKER.length).trim()
  return id || null
}
