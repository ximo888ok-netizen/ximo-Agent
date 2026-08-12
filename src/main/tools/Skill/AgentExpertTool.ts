import type { Tool } from '@main/tools/Tool'
import type { ToolCall, ToolResult, StreamChunk, ToolContext } from '@shared/types'
import { agentsData, analyzeExpert, buildExpertSystemPrompt, type AgentEntry } from './expert-config'
import { callSubAgentWithTools } from './sub-agent'
import { loadCustomExperts, saveCustomExpert, deleteCustomExpert } from '@main/CustomDesignStore'
import { DEFINITION } from './expert-tool-definition'
import { saveExpertAsSkill } from './expert-skill-persist'

// 重导出以保持向后兼容（SkillInvokeTool 等从此模块导入）
export { callSubAgentWithTools } from './sub-agent'

// ---------------------------------------------------------------------------
// 工具实现
// ---------------------------------------------------------------------------

export class AgentExpertTool implements Tool {
  readonly definition = DEFINITION

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
    context?: ToolContext
  ): Promise<ToolResult> {
    const { action, expert_id, task, division, query } = toolCall.arguments as {
      action: string
      expert_id?: string
      task?: string
      division?: string
      query?: string
    }

    const data = agentsData
    // 合并自定义专家（同 ID 覆盖内置）
    const customExperts = loadCustomExperts()
    const customIds = new Set(customExperts.map(a => a.id))
    const builtinAgents = data.agents.filter(a => !customIds.has(a.id))
    const allAgents = [...builtinAgents, ...customExperts]
    const mergedData = { agents: allAgents, total: allAgents.length }

    switch (action) {
      case 'activate': {
        if (!expert_id) {
          return { toolCallId: toolCall.id, toolName: 'agent_expert', content: '错误：activate 需要 expert_id 参数', success: false, error: '缺少 expert_id' }
        }
        const agent = mergedData.agents.find(a => a.id === expert_id)
        if (!agent) {
          return { toolCallId: toolCall.id, toolName: 'agent_expert', content: `未找到专家：${expert_id}`, success: false, error: '专家不存在' }
        }

        // 分析专家提示词，推断所需工具和预设工作流
        const analysis = analyzeExpert(agent)
        const systemPrompt = buildExpertSystemPrompt(agent)

        // 自动将专家工作流保存为技能，供 skill_invoke 调用
        await saveExpertAsSkill(agent, analysis.tools, analysis.workflow, systemPrompt)

        // 有 task → 子 Agent 带工具独立处理并返回结果
        if (task && task.trim() && context?.apiKey) {
          onChunk?.({ toolStatus: 'calling', toolName: 'agent_expert' })
          try {
            // 收集子 Agent 工作过程事件（供前端可视化 + 持久化展示）
            const expertEvents: NonNullable<StreamChunk['subAgentEvent']>[] = []
            const subResult = await callSubAgentWithTools(
              context, systemPrompt, task, analysis.tools, onChunk, signal,
              (event) => { expertEvents.push(event) },
              { expertId: agent.id, expertName: agent.name }
            )
            return {
              toolCallId: toolCall.id,
              toolName: 'agent_expert',
              content: `**${agent.name}**（${agent.emoji}）的回复：\n\n${subResult}`,
              success: true,
              metadata: {
                expertId: agent.id, expertName: agent.name, subAgentMode: true,
                configuredTools: analysis.tools, workflow: analysis.workflow,
                expertEvents: expertEvents.slice(0, 200),
                expertResult: subResult.slice(0, 4000),
              }
            }
          } catch (e) {
            // 子 Agent 调用失败时，降级为返回专家信息 + 分析结果 + 手动指引
            return {
              toolCallId: toolCall.id,
              toolName: 'agent_expert',
              content: `子 Agent 调用失败：${(e as Error).message}\n\n---\n\n` +
                `## 专家信息\n${agent.emoji} **${agent.name}**（\`${agent.id}\`）— ${agent.description}\n\n` +
                `## 推荐工具配置\n${analysis.tools.map(t => `- \`${t}\``).join('\n')}\n\n` +
                `## ${analysis.workflow}\n\n` +
                `## 系统提示词\n${systemPrompt}\n\n` +
                `请主 Agent 自行以该专家视角，使用推荐工具处理任务。`,
              success: true,
              metadata: {
                expertId: agent.id, expertName: agent.name, subAgentMode: false,
                error: (e as Error).message, configuredTools: analysis.tools, workflow: analysis.workflow
              }
            }
          }
        }

        // 无 task → 返回专家信息 + 提示词分析 + 推荐工具 + 预设工作流
        return {
          toolCallId: toolCall.id,
          toolName: 'agent_expert',
          content: `## 已激活专家 ${agent.emoji} **${agent.name}**（\`${agent.id}\`）\n\n` +
            `**简介**：${agent.description}\n\n` +
            `---\n\n` +
            `### 📋 提示词分析结果\n\n` +
            `**人格设定**：${agent.personality}\n\n` +
            `**工作风格**：${agent.vibe}\n\n` +
            `---\n\n` +
            `### 🔧 推荐工具配置（${analysis.tools.length} 个）\n\n` +
            analysis.tools.map(t => `- \`${t}\``).join('\n') + '\n\n' +
            `---\n\n` +
            `### 🔄 ${analysis.workflow}\n\n` +
            `---\n\n` +
            `### 📝 系统提示词\n\n${systemPrompt}\n\n` +
            `---\n\n` +
            `### 💾 已自动保存为技能\n\n` +
            `该专家的工具调用引导和自动化流程已永久保存为技能「专家：${agent.name}」，后续可通过 \`skill_invoke(skill_name="专家：${agent.name}", task="任务描述")\` 直接调用。\n\n` +
            `---\n\n` +
            `> 主 Agent 可基于以上分析，使用 agent_expert(action="activate", expert_id="${agent.id}", task="具体任务描述") 让该专家带工具独立处理子任务。`,
          success: true,
          metadata: {
            expertId: agent.id, expertName: agent.name,
            systemPrompt, configuredTools: analysis.tools, workflow: analysis.workflow
          }
        }
      }

      case 'deactivate': {
        return {
          toolCallId: toolCall.id,
          toolName: 'agent_expert',
          content: expert_id ? `已停用专家 ${expert_id}，回到默认模式` : '已停用所有专家，回到默认模式',
          success: true
        }
      }

      case 'list': {
        const filtered = division
          ? mergedData.agents.filter(a => a.division === division)
          : mergedData.agents

        // 按部门分组
        const groups: Record<string, typeof data.agents> = {}
        for (const agent of filtered) {
          if (!groups[agent.division]) groups[agent.division] = []
          groups[agent.division].push(agent)
        }

        let content = `## AI 专家库（共 ${mergedData.total} 位专家）\n\n`
        for (const [div, agents] of Object.entries(groups)) {
          content += `### ${div}（${agents.length} 位）\n`
          for (const a of agents) {
            content += `- ${a.emoji} **${a.name}**（\`${a.id}\`）：${a.description.substring(0, 80)}${a.description.length > 80 ? '...' : ''}\n`
          }
          content += '\n'
        }

        return { toolCallId: toolCall.id, toolName: 'agent_expert', content, success: true }
      }

      case 'search': {
        if (!query) {
          return { toolCallId: toolCall.id, toolName: 'agent_expert', content: '错误：search 需要 query 参数', success: false, error: '缺少 query' }
        }
        const q = query.toLowerCase()
        const results = mergedData.agents.filter(a =>
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.division.toLowerCase().includes(q) ||
          a.vibe.toLowerCase().includes(q)
        )

        if (results.length === 0) {
          return { toolCallId: toolCall.id, toolName: 'agent_expert', content: `未找到与「${query}」匹配的专家`, success: true }
        }

        let content = `## 搜索「${query}」— 找到 ${results.length} 位专家\n\n`
        for (const a of results) {
          content += `- ${a.emoji} **${a.name}**（\`${a.id}\`，${a.division}）：${a.description.substring(0, 100)}\n`
        }

        return { toolCallId: toolCall.id, toolName: 'agent_expert', content, success: true }
      }

      case 'create':
      case 'update': {
        return await this.handleCreate(toolCall.arguments as {
          expert_id?: string; expert_name?: string; division?: string
          emoji?: string; description?: string; personality?: string
          vibe?: string; color?: string; expert_tools?: string[]
        }, toolCall.id)
      }

      case 'delete': {
        return await this.handleDelete(expert_id || '', toolCall.id)
      }

      default:
        return { toolCallId: toolCall.id, toolName: 'agent_expert', content: `未知操作：${action}`, success: false, error: '无效的 action' }
    }
  }

  // ── 创建/更新自定义专家 ──
  private async handleCreate(args: {
    expert_id?: string; expert_name?: string; division?: string
    emoji?: string; description?: string; personality?: string
    vibe?: string; color?: string; expert_tools?: string[]
  }, toolCallId: string): Promise<ToolResult> {
    const id = args.expert_id || ''
    const name = args.expert_name || ''
    const div = args.division || ''
    const desc = args.description || ''
    const personality = args.personality || ''
    const vibe = args.vibe || ''

    if (!id || !name || !div || !desc || !personality || !vibe) {
      return { toolCallId, toolName: 'agent_expert', content: '', success: false, error: 'create/update 需要 expert_id, expert_name, division, description, personality, vibe 参数' }
    }

    const entry: AgentEntry = {
      id, name, division: div, description: desc,
      emoji: args.emoji || '✨', vibe, personality,
      tools: args.expert_tools || [], color: args.color || '#6366f1'
    }
    await saveCustomExpert(entry)

    return {
      toolCallId, toolName: 'agent_expert',
      content: `✅ 自定义专家 ${entry.emoji} **${entry.name}**（\`${entry.id}\`）已保存。使用 \`agent_expert(action="activate", expert_id="${entry.id}")\` 激活。`,
      success: true
    }
  }

  // ── 删除自定义专家 ──
  private async handleDelete(expert_id: string, toolCallId: string): Promise<ToolResult> {
    if (!expert_id) {
      return { toolCallId, toolName: 'agent_expert', content: '错误：delete 需要 expert_id 参数', success: false, error: '缺少 expert_id' }
    }
    const ok = await deleteCustomExpert(expert_id)
    if (!ok) {
      return { toolCallId, toolName: 'agent_expert', content: `删除失败：自定义专家「${expert_id}」不存在。内置专家不可删除。`, success: false, error: '专家不存在或为内置专家' }
    }
    return { toolCallId, toolName: 'agent_expert', content: `✅ 自定义专家「${expert_id}」已删除。`, success: true }
  }
}


