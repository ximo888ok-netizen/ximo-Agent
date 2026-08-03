import type { Tool } from './Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk, ToolContext } from '@shared/types'

/**
 * PlanAskTool — 向用户实时提问（弹窗）
 *
 * Plan 模式下，Agent 对每个不确定的决策点调用此工具，
 * 弹窗展示问题，用户输入回答后 Agent 继续规划。
 */
export class PlanAskTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'plan_ask',
    description:
      '向用户实时弹窗提问。用于 Plan 模式：分析任务后，对关键决策点和不确定项逐个向用户提问，收集回答后整理执行方案。方案整理完毕后也用此工具展示方案并请求用户确认。每条提问聚焦一个问题，不要一次问多个问题。\n\n提问格式指引（UI 会自动解析并渲染对应交互组件）：\n- 选择题：在问题末尾用 "A. 选项一\\nB. 选项二\\nC. 选项三" 格式列出选项，UI 会渲染为可点击的单选按钮\n- 确认题：在方案末尾加上 "请确认以上方案是否可以开始执行？" 等确认语句，UI 会渲染为接受/拒绝按钮\n- 开放题：直接描述问题即可，UI 会渲染为文本输入框\n所有类型均附带自定义输入框，用户可补充其他想法。',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: '要向用户提问的内容。可以是：1) 对某个决策点的提问（如有选项请用 A. B. C. 格式列出）；2) 整理好的执行方案（末尾加"请确认..."语句）。每条提问聚焦一个问题。'
        }
      },
      required: ['question']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    _signal?: AbortSignal,
    context?: ToolContext
  ): Promise<ToolResult> {
    const question = (toolCall.arguments.question as string) || ''

    if (!question.trim()) {
      return this.error(toolCall.id, 'question 不能为空')
    }

    onChunk?.({ toolStatus: 'calling', toolName: 'plan_ask' })

    if (!context?.requestUserInput) {
      // 无弹窗能力时退化为文本返回
      return {
        toolCallId: toolCall.id,
        toolName: 'plan_ask',
        content: '无法弹窗提问。请在下方输入框直接回答：\n\n' + question,
        success: true,
        displayType: 'text'
      }
    }

    const result = await context.requestUserInput('ask', 'Plan 提问', question)

    if (!result.confirmed) {
      return {
        toolCallId: toolCall.id,
        toolName: 'plan_ask',
        content: '用户跳过了此问题。',
        success: true,
        displayType: 'text'
      }
    }

    return {
      toolCallId: toolCall.id,
      toolName: 'plan_ask',
      content: result.response || '用户确认（无文字回答）',
      success: true,
      displayType: 'text'
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'plan_ask', content: '', success: false, error: msg }
  }
}

/**
 * SpecReviewTool — 规范文档审核弹窗
 *
 * Spec 模式下，Agent 细化完规范后调用此工具，
 * 弹窗展示完整规范文档，用户审核后确认或打回。
 */
export class SpecReviewTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'spec_review',
    description:
      '将规范文档弹窗展示给用户审核。用于 Spec 模式：细化完规范后调用，用户确认后严格按照规范执行。用户打回时附带修改意见，需据此修订后重新提交审核。',
    parameters: {
      type: 'object',
      properties: {
        document: {
          type: 'string',
          description: '完整的规范文档（Markdown 格式）。应包含：任务拆解、每项任务的具体要求、验收标准。'
        }
      },
      required: ['document']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    _signal?: AbortSignal,
    context?: ToolContext
  ): Promise<ToolResult> {
    const document = (toolCall.arguments.document as string) || ''

    if (!document.trim()) {
      return this.error(toolCall.id, 'document 不能为空')
    }

    onChunk?.({ toolStatus: 'calling', toolName: 'spec_review' })

    if (!context?.requestUserInput) {
      return {
        toolCallId: toolCall.id,
        toolName: 'spec_review',
        content: '无法弹窗审核。规范文档如下，请在下方输入框确认或提出修改意见：\n\n' + document,
        success: true,
        displayType: 'text'
      }
    }

    const result = await context.requestUserInput('review', '规范审核', document)

    if (result.confirmed) {
      return {
        toolCallId: toolCall.id,
        toolName: 'spec_review',
        content: '✅ 用户已确认规范。请严格按照上述规范执行，不做范围外修改。' + (result.response ? `\n\n用户补充说明：${result.response}` : ''),
        success: true,
        displayType: 'text'
      }
    }

    return {
      toolCallId: toolCall.id,
      toolName: 'spec_review',
      content: '❌ 用户打回了规范，需要修改。' + (result.response ? `\n\n修改意见：${result.response}` : '\n\n用户未提供具体意见，请主动询问。'),
      success: true,
      displayType: 'text'
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'spec_review', content: '', success: false, error: msg }
  }
}
