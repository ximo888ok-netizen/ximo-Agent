import { readFile, writeFile } from 'fs/promises'
import type { ImportedSkill } from '@shared/types'
import { importedSkillsFile } from './paths'
import { ensureDir } from './ensureDir'

// ---------- 导入技能持久化 ----------

export async function loadImportedSkills(): Promise<ImportedSkill[]> {
  try {
    await ensureDir()
    const raw = await readFile(importedSkillsFile, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    console.error('加载导入技能失败：', e)
  }
  return []
}

export async function saveImportedSkills(skills: ImportedSkill[]): Promise<void> {
  try {
    await ensureDir()
    await writeFile(importedSkillsFile, JSON.stringify(skills, null, 2), 'utf-8')
  } catch (e) {
    console.error('保存导入技能失败：', e)
  }
}

// ---------- SKILL.md 解析 ----------

/**
 * 从 SKILL.md 文件内容中解析出技能信息。
 *
 * 兼容格式（Claude / CatPaw / Open Design 等）：
 * ---
 * name: "skill-name"
 * description: "技能描述"
 * triggers:
 *   - "触发词1"
 *   - "触发词2"
 * ---
 * # 技能正文
 * 指令内容...
 */
export function parseSkillMarkdown(raw: string): { name: string; description: string; triggers: string[]; body: string; error?: string } {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { name: '', description: '', triggers: [], body: '', error: '内容为空' }
  }

  // 检查是否有 YAML frontmatter
  const frontmatterMatch = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)

  let name = ''
  let description = ''
  let triggers: string[] = []
  let body = trimmed

  if (frontmatterMatch) {
    const yaml = frontmatterMatch[1]
    body = frontmatterMatch[2].trim()

    // 简易 YAML 解析（不引入额外依赖）
    const lines = yaml.split('\n')
    let i = 0
    while (i < lines.length) {
      const line = lines[i]
      const nameMatch = line.match(/^name:\s*(.+)$/)
      if (nameMatch) {
        name = nameMatch[1].trim().replace(/^["']|["']$/g, '')
        i++
        continue
      }

      const descMatch = line.match(/^description:\s*(.+)$/)
      if (descMatch) {
        const val = descMatch[1].trim()
        if (val === '|' || val === '>') {
          // 多行描述
          i++
          const descLines: string[] = []
          while (i < lines.length && lines[i].startsWith('  ')) {
            descLines.push(lines[i].replace(/^  /, ''))
            i++
          }
          description = descLines.join('\n').trim()
        } else {
          description = val.replace(/^["']|["']$/g, '')
          i++
        }
        continue
      }

      const triggersMatch = line.match(/^triggers:\s*(.*)$/)
      if (triggersMatch) {
        const inlineVal = triggersMatch[1].trim()
        if (inlineVal === '' || inlineVal === '[]') {
          // 多行 triggers
          i++
          while (i < lines.length && lines[i].match(/^\s+-\s/)) {
            const triggerMatch = lines[i].match(/^\s+-\s+(.+)$/)
            if (triggerMatch) {
              triggers.push(triggerMatch[1].trim().replace(/^["']|["']$/g, ''))
            }
            i++
          }
        } else {
          // 内联数组格式：triggers: ["a", "b"]
          const arrMatch = inlineVal.match(/^\[(.*)\]$/)
          if (arrMatch) {
            const items = arrMatch[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
            triggers = items
          }
          i++
        }
        continue
      }

      i++
    }
  } else {
    // 没有 frontmatter，把整个内容当作 body，从第一行提取 name
    const firstLine = trimmed.split('\n')[0]
    const headingMatch = firstLine.match(/^#+\s*(.+)$/)
    if (headingMatch) {
      name = headingMatch[1].trim()
    }
  }

  if (!name) {
    return { name: '', description: '', triggers: [], body, error: '未找到技能名称（name 字段或 Markdown 标题）' }
  }

  if (!body) {
    body = description || `(技能 ${name} 无正文内容)`
  }

  return { name, description, triggers, body }
}
