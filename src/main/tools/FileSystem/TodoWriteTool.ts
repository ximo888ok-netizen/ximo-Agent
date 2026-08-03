import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

/** TodoItem — 单个任务条目 */
export interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
  level?: number
  /** 指派给子 Agent 的角色描述（如"前端专家"），为空则由主 Agent 处理 */
  assignee?: string
}

/**
 * TodoWriteTool — 记录和更新 AI 的任务列表
 * 参考 Reasonix todo_write：每次发送完整列表替换之前的，支持两级嵌套（阶段+子步骤）
 * 工具本身无副作用，前端渲染为 checklist
 */
export class TodoWriteTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'todo_write',
    description:
      '记录和更新当前工作的结构化任务列表。每次调用发送完整列表替换之前的。当任务较复杂（多步骤、多模块协作）时自主使用，简单任务无需列举。同时只保持一个 in_progress 项，完成后立即标记为 completed。支持两级嵌套：level 0 = 阶段（里程碑），level 1 = 子步骤。可通过 assignee 字段将子任务指派给子 Agent 并行处理（配合 agent_expert 工具调度）。',
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: '完整任务列表，按顺序排列。替换之前的列表。',
          items: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: '任务描述（祈使句，如"添加解析器"）'
              },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed'],
                description: '任务状态。最多保持一个 in_progress'
              },
              activeForm: {
                type: 'string',
                description: '进行中时显示的现在进行时描述（如"正在添加解析器"）'
              },
              level: {
                type: 'number',
                description: '嵌套层级：0=阶段/里程碑，1=子步骤。不传则为平铺列表',
                enum: [0, 1]
              },
              assignee: {
                type: 'string',
                description: '指派给子 Agent 处理的角色描述（如"前端开发专家"、"数据库设计专家"）。设置后表示该任务由子 Agent 独立处理，需配合 agent_expert 工具调度。不填则由主 Agent 自行处理。'
              }
            },
            required: ['content', 'status']
          }
        }
      },
      required: ['todos']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    _signal?: AbortSignal
  ): Promise<ToolResult> {
    const todos = (toolCall.arguments.todos as TodoItem[]) || []

    if (todos.length === 0) {
      return this.error(toolCall.id, 'todos 不能为空')
    }

    onChunk?.({ toolStatus: 'calling', toolName: 'todo_write' })

    let done = 0
    let active = 0
    let pending = 0

    for (let i = 0; i < todos.length; i++) {
      const t = todos[i]
      if (!t.content) {
        return this.error(toolCall.id, `任务 ${i + 1}: content 不能为空`)
      }
      if (t.level !== undefined && (t.level < 0 || t.level > 1)) {
        return this.error(toolCall.id, `任务 ${i + 1}: 无效 level ${t.level}（应为 0=阶段 或 1=子步骤）`)
      }
      switch (t.status) {
        case 'completed':
          done++
          break
        case 'in_progress':
          active++
          break
        case 'pending':
          pending++
          break
        default:
          pending++
          break
      }
    }

    if (active > 1) {
      return this.error(toolCall.id, `最多只能有一个 in_progress 任务，当前有 ${active} 个`)
    }

    return {
      toolCallId: toolCall.id,
      toolName: 'todo_write',
      content: `任务列表已更新：${todos.length} 项 — ${done} 已完成, ${active} 进行中, ${pending} 待处理`,
      success: true,
      displayType: 'text',
      metadata: {
        todos,
        total: todos.length,
        done,
        active,
        pending
      }
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'todo_write', content: '', success: false, error: msg }
  }
}
