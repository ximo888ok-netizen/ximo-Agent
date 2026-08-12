import type { Skill } from '@shared/types'
import type { Page } from 'playwright'

/** 浏览器步骤类型 */
interface BrowserStep {
  tool: string
  arguments: Record<string, unknown>
}

/**
 * 执行单个浏览器操作步骤
 */
export async function executeBrowserStep(
  page: Page,
  step: BrowserStep
): Promise<string> {
  switch (step.tool) {
    case 'browser_navigate': {
      const url = step.arguments.url as string
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      return `导航到 ${url}`
    }
    case 'browser_click': {
      const selector = step.arguments.selector as string
      await page.click(selector, { timeout: 10000 }).catch(async () => {
        await page.waitForSelector(selector, { timeout: 5000 })
        await page.click(selector, { timeout: 5000 })
      })
      return `点击 ${selector}`
    }
    case 'browser_type': {
      const selector = step.arguments.selector as string
      const text = step.arguments.text as string
      await page.fill(selector, text, { timeout: 10000 })
      return `在 ${selector} 输入 "${text}"`
    }
    case 'browser_get_content': {
      const textContent = await page.evaluate(() => document.body?.innerText || '')
      return `获取页面内容（${textContent.length} 字符）`
    }
    case 'browser_screenshot': {
      await page.screenshot({ timeout: 10000 })
      return '截图完成'
    }
    case 'browser_execute_js': {
      const script = step.arguments.script as string
      await page.evaluate(script)
      return '执行 JS 完成'
    }
    default:
      return `步骤 ${step.tool}（手动操作）`
  }
}

/** 根据任务描述模糊匹配最相似的技能 */
export function findSimilarSkill(skills: Skill[], nameHint: string, taskDesc?: string): Skill | null {
  if (skills.length === 0) return null

  const keywords = [nameHint, taskDesc || '']
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .split(/\s+/)

  let bestSkill: Skill | null = null
  let bestScore = 0

  for (const skill of skills) {
    const searchable = `${skill.name} ${skill.description} ${skill.tags.join(' ')}`.toLowerCase()
    let score = 0
    for (const kw of keywords) {
      if (kw && searchable.includes(kw)) score++
    }
    if (skill.name.toLowerCase().includes(nameHint.toLowerCase())) score += 2
    if (score > bestScore) {
      bestScore = score
      bestSkill = skill
    }
  }

  return bestScore > 0 ? bestSkill : null
}
