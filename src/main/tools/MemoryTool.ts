import type { Tool } from './Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk, ToolContext } from '@shared/types'
import { loadMemory, saveMemory } from '@main/store'
import type { Mode } from '@shared/types'

/**
 * MemoryTool — 模式记忆读写工具
 *
 * 让 Agent 能自主读取和更新当前模式的持久化记忆。
 * 记忆内容在每次对话开始时注入系统提示词，指导 Agent 的行为。
 *
 * 记忆只应记录三类内容：
 * 1. 用户习惯 — 用户偏好的格式、风格、工作方式
 * 2. 踩过的坑 — 曾经犯过的错误及纠正方法
 * 3. 工具语法 — 本项目中工具调用的正确语法要点
 *
 * 记忆必须精简：合并重复项，删除过时项，保持每条一行。
 */
export class MemoryTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'memory_update',
    description:
      '读取或更新当前模式的持久化记忆。记忆在每次对话开始时自动注入系统提示词，是 Agent 跨会话学习的关键机制。\n\n' +
      '## 何时使用\n' +
      '- 用户纠正了你的错误后 → 记录到「踩过的坑」\n' +
      '- 用户表达了明确的偏好 → 记录到「用户习惯」\n' +
      '- 你发现工具调用的语法要点 → 记录到「工具语法」\n' +
      '- 记忆内容过多或过时时 → 精简提炼，删除冗余和过时项\n\n' +
      '## 记忆规则\n' +
      '- 只记录三类内容：用户习惯、踩过的坑、工具语法\n' +
      '- 每条一行，格式：`- 简明描述`\n' +
      '- 合并重复项，删除过时项，定期精简\n' +
      '- 总量控制在 30 行以内，避免臃肿',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['read', 'write'],
          description: 'read=查看当前记忆全文；write=用新内容替换记忆（发送完整内容，非追加）'
        },
        content: {
          type: 'string',
          description: 'action=write 时的完整记忆内容（Markdown 纯文本）。为空字符串则清空记忆。'
        }
      },
      required: ['action']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    _signal?: AbortSignal,
    context?: ToolContext
  ): Promise<ToolResult> {
    const action = toolCall.arguments.action as 'read' | 'write'
    const mode = (context?.mode ?? 'office') as Mode

    onChunk?.({ toolStatus: 'calling', toolName: 'memory_update' })

    if (action === 'read') {
      const content = await loadMemory(mode)
      return {
        toolCallId: toolCall.id,
        toolName: 'memory_update',
        content: content.trim() || '（记忆为空）',
        success: true,
        displayType: 'text'
      }
    }

    if (action === 'write') {
      const content = (toolCall.arguments.content as string) ?? ''
      await saveMemory(mode, content)
      const lineCount = content.trim() ? content.trim().split('\n').length : 0
      return {
        toolCallId: toolCall.id,
        toolName: 'memory_update',
        content: `记忆已更新（${mode} 模式，${lineCount} 行）。下次对话将自动生效。`,
        success: true,
        displayType: 'text'
      }
    }

    return {
      toolCallId: toolCall.id,
      toolName: 'memory_update',
      content: '',
      success: false,
      error: `未知 action: ${action}`
    }
  }
}
