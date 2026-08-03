import type { ToolDefinition, ToolCall, ToolResult } from '@shared/types'
import type { Tool } from '@main/tools/Tool'
import {
  startRecording,
  stopRecording,
  isRecording,
  getRecordingSession,
  appendStep,
  loadSkills,
  saveSkills,
  getRrwebEventCount
} from '@main/SkillStore'
import type { Skill } from '@shared/types'
import { RrwebRecorder } from './RrwebRecorder'
import { BrowserManager } from '@main/tools/Browser/BrowserManager'
import { isEmbeddedBrowserActive, executeWebviewCommand } from '@main/tools/Browser/WebviewBridge'

/**
 * SkillRecordTool — 技能录制工具（基于 rrweb）
 * 支持三个操作：
 *   1. start：开始录制（指定起始URL），同时注入 rrweb 录制代码到浏览器页面
 *   2. stop：停止录制，收集 rrweb 事件流并自动生成技能
 *   3. status：查询当前录制状态
 *
 * 录制期间：
 *   - rrweb 自动捕获页面 DOM 变更和用户交互事件
 *   - Agent 执行的 browser_* 等工具操作也会追加到录制会话的 steps 中（用于 AI 理解）
 *   - 两者共同保存：steps 用于 AI 语义理解，rrwebEvents 用于真实回放
 */
export class SkillRecordTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'skill_record',
    description: '技能录制工具（基于 rrweb 网页录制技术）。开始录制后，rrweb 会自动捕获页面的所有 DOM 变更和用户交互事件；同时 Agent 执行的浏览器操作也会记录到操作步骤中。停止录制时，自动将操作序列和 rrweb 事件流生成为可复用的技能。支持三个操作：start（开始录制）、stop（停止录制并生成技能）、status（查询录制状态）。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '操作类型：start=开始录制，stop=停止录制并生成技能，status=查询当前录制状态',
          enum: ['start', 'stop', 'status']
        },
        url: {
          type: 'string',
          description: '录制起始 URL（仅 action=start 时有效）'
        },
        name: {
          type: 'string',
          description: '技能名称（仅 action=stop 时有效，若不提供则自动生成）'
        },
        description: {
          type: 'string',
          description: '技能描述（仅 action=stop 时有效，用于后续相似任务匹配）'
        },
        tags: {
          type: 'string',
          description: '技能标签，逗号分隔（仅 action=stop 时有效）'
        }
      },
      required: ['action']
    }
  }

  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const { action, url, name, description, tags } = toolCall.arguments

    switch (action) {
      case 'start': {
        const session = startRecording(url as string | undefined)

        // 注入 rrweb 录制到浏览器页面
        try {
          const recorder = RrwebRecorder.getInstance()

          // 优先使用内嵌浏览器 webview
          if (isEmbeddedBrowserActive()) {
            // 如果指定了 URL，先导航到该 URL
            if (url) {
              await executeWebviewCommand('navigate', { url: url as string })
              await new Promise(r => setTimeout(r, 1500))
            }
            await recorder.startRecordingInWebview()

            return {
              toolCallId: toolCall.id,
              toolName: 'skill_record',
              content: `🔴 录制已开始！会话 ID: ${session.id}\n\nrrweb 已在内嵌浏览器中注入，正在捕获页面的所有 DOM 变更和用户交互。\nAgent 执行的浏览器操作也会被同步记录。\n起始 URL: ${url || '当前页面'}\n\n完成后请调用 skill_record(action="stop") 结束录制并生成技能。`,
              success: true
            }
          }

          // 回退到 Playwright
          const browserManager = BrowserManager.getInstance()
          browserManager.setHeadless(false)
          const page = url
            ? await browserManager.getPageForUrl(url as string)
            : await browserManager.getPage()

          await recorder.startRecording(page)

          return {
            toolCallId: toolCall.id,
            toolName: 'skill_record',
            content: `🔴 录制已开始！会话 ID: ${session.id}\n\nrrweb 已在浏览器中注入，正在捕获页面的所有 DOM 变更和用户交互。\nAgent 执行的浏览器操作也会被同步记录。\n起始 URL: ${url || '当前页面'}\n\n完成后请调用 skill_record(action="stop") 结束录制并生成技能。`,
            success: true
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          return {
            toolCallId: toolCall.id,
            toolName: 'skill_record',
            content: `🔴 录制会话已创建（ID: ${session.id}），但 rrweb 注入失败：${msg}\n\n仍可通过 Agent 操作步骤录制技能，但回放时将使用步骤回放而非 rrweb 回放。`,
            success: true
          }
        }
      }

      case 'stop': {
        // 先停止 rrweb 录制
        const recorder = RrwebRecorder.getInstance()
        await recorder.stopRecording()

        const rrwebCount = getRrwebEventCount()
        const session = stopRecording()
        if (!session) {
          return {
            toolCallId: toolCall.id,
            toolName: 'skill_record',
            content: '当前没有进行中的录制会话。',
            success: false,
            error: '没有活跃的录制会话'
          }
        }

        if (session.steps.length === 0 && session.rrwebEvents.length === 0) {
          return {
            toolCallId: toolCall.id,
            toolName: 'skill_record',
            content: '录制会话中没有任何操作步骤或 rrweb 事件，无法生成技能。请重新录制并执行一些操作。',
            success: false,
            error: '录制数据为空'
          }
        }

        // 恢复浏览器 headless 模式
        BrowserManager.getInstance().setHeadless(true)

        // 自动生成技能名称和描述
        const skillName = (name as string) || generateSkillName(session.steps)
        const skillDesc = (description as string) || generateSkillDescription(session.steps, session.startUrl)
        const skillTags = typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : []

        const skill: Skill = {
          id: session.id,
          name: skillName,
          description: skillDesc,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          invokeCount: 0,
          steps: session.steps,
          rrwebEvents: session.rrwebEvents.length > 0 ? session.rrwebEvents : undefined,
          tags: skillTags,
          source: 'recorded',
          startUrl: session.startUrl
        }

        // 持久化技能
        const skills = await loadSkills()
        skills.unshift(skill)
        await saveSkills(skills)

        // 生成技能摘要
        const stepsSummary = session.steps.map((s, i) =>
          `  ${i + 1}. ${s.tool}${s.description ? ` — ${s.description}` : ''}${s.arguments.url ? ` (${s.arguments.url})` : ''}${s.arguments.selector ? ` [${s.arguments.selector}]` : ''}${s.arguments.text ? ` "${s.arguments.text}"` : ''}`
        ).join('\n')

        const rrwebInfo = session.rrwebEvents.length > 0
          ? `\n**rrweb 事件流**：${session.rrwebEvents.length} 个事件（可用于真实网页回放）`
          : '\n**rrweb 事件流**：无（将使用步骤回放）'

        return {
          toolCallId: toolCall.id,
          toolName: 'skill_record',
          content: `✅ 技能已生成！\n\n**技能名称**：${skillName}\n**技能描述**：${skillDesc}\n**操作步骤**（共 ${session.steps.length} 步）：\n${stepsSummary}${rrwebInfo}\n**标签**：${skillTags.length > 0 ? skillTags.join(', ') : '无'}\n\n后续遇到相似任务时，Agent 会自动匹配并调用此技能（通过 skill_invoke），也可以手动指定技能名称调用。`,
          success: true
        }
      }

      case 'status': {
        if (isRecording()) {
          const session = getRecordingSession()!
          const rrwebInfo = session.rrwebEvents.length > 0
            ? `\nrrweb 事件：${session.rrwebEvents.length} 个`
            : '\nrrweb 事件：尚未开始收集'
          return {
            toolCallId: toolCall.id,
            toolName: 'skill_record',
            content: `🔴 正在录制中！已记录 ${session.steps.length} 步操作。${rrwebInfo}\n会话 ID: ${session.id}\n起始 URL: ${session.startUrl || '无'}\n\n完成后请调用 skill_record(action="stop") 结束录制。`,
            success: true
          }
        }
        // 列出已有技能
        const skills = await loadSkills()
        if (skills.length === 0) {
          return {
            toolCallId: toolCall.id,
            toolName: 'skill_record',
            content: '当前没有录制会话，也没有已保存的技能。可以调用 skill_record(action="start", url="目标URL") 开始录制新技能。',
            success: true
          }
        }
        const skillsList = skills.map(s => {
          const type = s.source === 'expert' ? '[专家技能]' : s.rrwebEvents ? `[rrweb: ${s.rrwebEvents.length}事件]` : '[步骤回放]'
          return `- **${s.name}**（${s.invokeCount} 次调用）${type} ${s.tags.length > 0 ? ` [${s.tags.join(',')}]` : ''} — ${s.description}`
        }).join('\n')
        return {
          toolCallId: toolCall.id,
          toolName: 'skill_record',
          content: `当前没有录制会话。\n\n已有技能（共 ${skills.length} 个）：\n${skillsList}`,
          success: true
        }
      }

      default:
        return {
          toolCallId: toolCall.id,
          toolName: 'skill_record',
          content: `未知操作：${action}。支持的操作：start、stop、status`,
          success: false,
          error: `未知操作: ${action}`
        }
    }
  }
}

// ---------- 辅助函数 ----------

function generateSkillName(steps: { tool: string; arguments: Record<string, unknown> }[]): string {
  const browserSteps = steps.filter(s => s.tool.startsWith('browser_'))
  if (browserSteps.length > 0) {
    const hasNavigate = browserSteps.some(s => s.tool === 'browser_navigate')
    const hasClick = browserSteps.some(s => s.tool === 'browser_click')
    const hasType = browserSteps.some(s => s.tool === 'browser_type')
    const parts: string[] = ['网页']
    if (hasNavigate) parts.push('浏览')
    if (hasClick) parts.push('点击')
    if (hasType) parts.push('填写')
    return parts.join('与') + '操作'
  }
  return '自动化操作'
}

function generateSkillDescription(steps: { tool: string; arguments: Record<string, unknown>; description?: string }[], startUrl?: string): string {
  const parts: string[] = []
  if (startUrl) parts.push(`从 ${startUrl} 开始`)
  for (const s of steps) {
    if (s.description) parts.push(s.description)
    else if (s.tool === 'browser_navigate') parts.push(`导航到 ${s.arguments.url}`)
    else if (s.tool === 'browser_click') parts.push(`点击 ${s.arguments.selector}`)
    else if (s.tool === 'browser_type') parts.push(`输入 "${s.arguments.text}"`)
    else if (s.tool === 'browser_get_content') parts.push('获取页面内容')
    else if (s.tool === 'browser_screenshot') parts.push('截图')
  }
  return parts.length > 0 ? parts.join(' → ') : '录制的操作序列'
}
