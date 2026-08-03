import type { ToolDefinition, ToolCall, ToolResult, StreamChunk, ToolContext } from '@shared/types'
import type { Tool } from '@main/tools/Tool'
import { loadSkills, saveSkills } from '@main/SkillStore'
import { BrowserManager } from '@main/tools/Browser/BrowserManager'
import { RrwebReplayer } from './RrwebReplayer'
import { callSubAgentWithTools } from './AgentExpertTool'
import type { Skill } from '@shared/types'

/**
 * SkillInvokeTool — 技能调用工具（支持 rrweb 回放）
 * 优先使用 rrweb 事件流进行真实网页回放；
 * 如果技能没有 rrwebEvents，则降级到逐步工具调用回放。
 */
export class SkillInvokeTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'skill_invoke',
    description: '技能调用工具。根据技能名称或任务描述，自动找到最匹配的已有技能并执行。支持三种技能类型：\n1) rrweb 事件流回放（优先，完整还原页面状态和用户交互）；\n2) 步骤回放（降级，逐步执行浏览器工具调用）；\n3) 专家技能（source=expert，以专家系统提示词启动子 Agent 带工具独立处理任务）。\n\n专家技能由 agent_expert 激活时自动保存，调用时需提供 task 参数指定任务。',
    parameters: {
      type: 'object',
      properties: {
        skill_name: {
          type: 'string',
          description: '技能名称（精确匹配）。如果提供，优先按名称查找技能。'
        },
        task_description: {
          type: 'string',
          description: '任务描述（模糊匹配）。当 skill_name 未提供时，根据任务描述在所有技能中查找最相似的。对于专家技能，此参数作为子 Agent 的任务描述。'
        },
        task: {
          type: 'string',
          description: '任务描述（专家技能专用）。当调用专家技能时，此参数作为交给专家子 Agent 处理的任务描述。'
        },
        url_override: {
          type: 'string',
          description: '覆盖技能的起始 URL（用于在不同网站执行相同流程）'
        }
      },
      required: ['skill_name']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
    context?: ToolContext
  ): Promise<ToolResult> {
    const { skill_name, url_override } = toolCall.arguments

    // 查找技能
    const skills = await loadSkills()
    const skill = skills.find(s => s.name === skill_name)

    if (!skill) {
      // 尝试模糊匹配
      const taskDesc = toolCall.arguments.task_description as string | undefined
      const matched = findSimilarSkill(skills, skill_name as string, taskDesc)
      if (!matched) {
        return {
          toolCallId: toolCall.id,
          toolName: 'skill_invoke',
          content: `未找到技能 "${skill_name}"。当前已有 ${skills.length} 个技能。${skills.length > 0 ? '可用技能：' + skills.map(s => s.name).join(', ') : '请先使用 skill_record 录制技能，或使用 agent_expert 激活专家自动生成技能。'}`,
          success: false,
          error: `技能 "${skill_name}" 不存在`
        }
      }
      return this.executeSkill(matched, toolCall, url_override as string | undefined, onChunk, signal, context)
    }

    return this.executeSkill(skill, toolCall, url_override as string | undefined, onChunk, signal, context)
  }

  private async executeSkill(
    skill: Skill,
    toolCall: ToolCall,
    urlOverride?: string,
    onChunk?: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
    context?: ToolContext
  ): Promise<ToolResult> {
    // 更新技能调用次数
    const skills = await loadSkills()
    const idx = skills.findIndex(s => s.id === skill.id)
    if (idx >= 0) {
      skills[idx].invokeCount++
      skills[idx].updatedAt = Date.now()
      await saveSkills(skills)
    }

    // 专家技能 — 以专家系统提示词启动子 Agent 处理任务
    if (skill.source === 'expert' && skill.systemPrompt) {
      return this.invokeExpertSkill(skill, toolCall, onChunk, signal, context)
    }

    // 优先使用 rrweb 事件流回放
    if (skill.rrwebEvents && skill.rrwebEvents.length > 0) {
      return this.replayWithRrweb(skill, toolCall, onChunk, signal)
    }

    // 降级到步骤回放
    return this.replayWithSteps(skill, toolCall, urlOverride, onChunk, signal)
  }

  /**
   * 调用专家类型技能 — 以专家系统提示词启动子 Agent 带工具独立处理任务
   */
  private async invokeExpertSkill(
    skill: Skill,
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
    context?: ToolContext
  ): Promise<ToolResult> {
    const task = (toolCall.arguments.task as string) ||
                 (toolCall.arguments.task_description as string) ||
                 '请根据你的专业能力和工作流处理用户请求'

    if (!context?.apiKey) {
      return {
        toolCallId: toolCall.id,
        toolName: 'skill_invoke',
        content: `专家技能「${skill.name}」需要 API 配置才能启动子 Agent。当前未配置 API Key。`,
        success: false,
        error: '缺少 API 配置'
      }
    }

    const tools = skill.configuredTools ?? []
    onChunk?.({ toolStatus: 'calling', toolName: `skill_invoke（${skill.expertName ?? '专家'}）` })

    try {
      const subResult = await callSubAgentWithTools(
        context, skill.systemPrompt!, task, tools, onChunk, signal
      )

      return {
        toolCallId: toolCall.id,
        toolName: 'skill_invoke',
        content: `✅ 专家技能「${skill.name}」执行完毕（已调用 ${skill.invokeCount} 次）\n\n**${skill.expertName ?? '专家'}** 的回复：\n\n${subResult}`,
        success: true,
        metadata: {
          skillId: skill.id, skillName: skill.name,
          expertId: skill.expertId, expertName: skill.expertName,
          subAgentMode: true, configuredTools: tools
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return {
        toolCallId: toolCall.id,
        toolName: 'skill_invoke',
        content: `专家技能「${skill.name}」调用失败：${msg}`,
        success: false,
        error: msg
      }
    }
  }

  /**
   * 使用 rrweb 事件流回放（优先）
   */
  private async replayWithRrweb(
    skill: Skill,
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    signal?: AbortSignal
  ): Promise<ToolResult> {
    onChunk?.({ toolStatus: 'calling', toolName: 'skill_invoke' })

    try {
      const replayer = RrwebReplayer.getInstance()
      const { duration, eventCount } = await replayer.replay(skill.rrwebEvents!)

      const durationSec = Math.round(duration / 1000)

      // 回放完毕后恢复 headless 模式
      await replayer.stopReplay()

      return {
        toolCallId: toolCall.id,
        toolName: 'skill_invoke',
        content: `✅ 技能 "${skill.name}" 已通过 rrweb 回放完毕！\n\n**回放方式**：rrweb 事件流回放（完整还原页面状态）\n**事件数量**：${eventCount} 个\n**录制时长**：约 ${durationSec} 秒\n\n该技能已被调用 ${skill.invokeCount + 1} 次。`,
        success: true
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)

      // rrweb 回放失败，降级到步骤回放
      if (skill.steps.length > 0) {
        return this.replayWithSteps(skill, toolCall, undefined, onChunk, signal)
      }

      return {
        toolCallId: toolCall.id,
        toolName: 'skill_invoke',
        content: `rrweb 回放失败且无步骤数据：${msg}`,
        success: false,
        error: msg
      }
    }
  }

  /**
   * 使用工具调用步骤回放（降级）
   */
  private async replayWithSteps(
    skill: Skill,
    toolCall: ToolCall,
    urlOverride?: string,
    onChunk?: (chunk: StreamChunk) => void,
    signal?: AbortSignal
  ): Promise<ToolResult> {
    const results: string[] = []
    const browserManager = BrowserManager.getInstance()
    browserManager.setHeadless(false)

    try {
      // 如果技能有起始 URL 或用户覆盖了 URL，先导航到该页面
      const startUrl = urlOverride || skill.startUrl
      if (startUrl) {
        onChunk?.({ toolStatus: 'calling', toolName: 'skill_invoke' })
        const page = await browserManager.getPageForUrl(startUrl)
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {})
        results.push(`✅ 导航到 ${startUrl}`)
      }

      // 逐步执行技能中的操作
      for (let i = 0; i < skill.steps.length; i++) {
        if (signal?.aborted) break

        const step = skill.steps[i]
        onChunk?.({
          toolStatus: 'calling',
          toolName: 'skill_invoke',
          toolCall: {
            id: `skill-step-${i}`,
            name: step.tool,
            arguments: step.arguments
          }
        })

        try {
          const page = await browserManager.getPage()
          const stepResult = await executeBrowserStep(page, step)
          results.push(`  ${i + 1}. ${step.tool}: ${stepResult}`)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          results.push(`  ${i + 1}. ${step.tool}: ❌ ${msg}`)
        }

        await new Promise(resolve => setTimeout(resolve, 500))
      }

      browserManager.setHeadless(true)

      return {
        toolCallId: toolCall.id,
        toolName: 'skill_invoke',
        content: `✅ 技能 "${skill.name}" 执行完毕（步骤回放模式）！\n\n执行结果（共 ${skill.steps.length} 步）：\n${results.join('\n')}\n\n该技能已被调用 ${skill.invokeCount + 1} 次。`,
        success: true
      }
    } catch (e) {
      browserManager.setHeadless(true)
      const msg = e instanceof Error ? e.message : String(e)
      return {
        toolCallId: toolCall.id,
        toolName: 'skill_invoke',
        content: `技能 "${skill.name}" 执行出错：${msg}\n\n已完成步骤：\n${results.join('\n')}`,
        success: false,
        error: msg
      }
    }
  }
}

// ---------- 辅助函数 ----------

async function executeBrowserStep(
  page: import('playwright').Page,
  step: { tool: string; arguments: Record<string, unknown> }
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
function findSimilarSkill(skills: Skill[], nameHint: string, taskDesc?: string): Skill | null {
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
