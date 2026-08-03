import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

/**
 * DesignCritiqueTool — UX 设计审查
 * 注入专业的审查清单给 LLM，进行全面的 UX 质量评估
 */
export class DesignCritiqueTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'design_critique',
    description: '对 UI 代码进行全面的 UX 设计审查。从视觉层级、信息架构、认知负荷、交互一致性、颜色使用、排版质量等多个维度评估界面质量。返回结构化的审查报告，包含评分和优先级的改进建议。',
    parameters: {
      type: 'object',
      properties: {
        codeOrDescription: { type: 'string', description: 'UI 代码或功能描述' },
        focusArea: { type: 'string', description: '审查重点：hierarchy（层级）、layout（布局）、color（颜色）、typography（排版）、interaction（交互）、overall（综合）', enum: ['hierarchy', 'layout', 'color', 'typography', 'interaction', 'overall'], default: 'overall' }
      },
      required: ['codeOrDescription']
    }
  }

  async execute(toolCall: ToolCall, onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal): Promise<ToolResult> {
    const input = (toolCall.arguments.codeOrDescription as string) || ''
    const focusArea = (toolCall.arguments.focusArea as string) || 'overall'

    if (!input) return this.error(toolCall.id, '缺少 codeOrDescription 参数')
    onChunk?.({ toolStatus: 'calling', toolName: 'design_critique' })

    const checklists: Record<string, string[]> = {
      hierarchy: [
        '页面标题/主操作是否突出？', '信息层级是否清晰（主/次/辅助）？',
        '视觉权重分布是否合理？', '关键操作是否容易发现？',
        '是否有不必要的信息干扰用户注意力？'
      ],
      layout: [
        '布局是否遵循网格系统？', '间距是否统一（8px 基准）？',
        '相关元素是否分组在一起（邻近性原则）？', '响应式布局是否覆盖所有常见断点？',
        '元素对齐是否一致？'
      ],
      color: [
        '主色使用是否克制？', '对比度是否满足 WCAG AA 标准？',
        '语义色（成功/警告/错误）是否一致？', '暗色模式是否可用？',
        '颜色是否承载了必要的含义？'
      ],
      typography: [
        '字体层级是否清晰（不超过 4 级）？', '行高/字间距是否合适？',
        '正文是否易于阅读（40-75 字符/行）？', '中英文混排是否协调？',
        '是否使用了 web-safe 备用字体？'
      ],
      interaction: [
        '按钮是否有 hover/active/focus 状态？', '加载态/空态/错误态是否处理？',
        '过渡动画是否流畅（<300ms）？', '键盘导航是否可用？',
        '关键操作是否有确认机制？'
      ]
    }

    const focus = focusArea === 'overall'
      ? Object.values(checklists).flat()
      : checklists[focusArea] || checklists.overall

    const guidance = [
      `## UI 设计审查 — ${focusArea === 'overall' ? '综合评估' : `重点关注: ${focusArea}`}`,
      '',
      '请对以下 UI 进行审查：',
      '```',
      input.slice(0, 3000),
      '```',
      '',
      '### 审查维度',
      ...focus.map((q, i) => `${i + 1}. ${q}`),
      '',
      '### 评估标准',
      '- 每项评分：1（严重问题）、2（需改进）、3（合格）、4（良好）、5（优秀）',
      '- 标注每个问题的严重程度和修复建议',
      '- 给出整体评分（百分制）和优先级排序的改进清单',
      '',
      '请基于 better-react-web-ui 设计原则给出专业审查意见。'
    ].join('\n')

    return {
      toolCallId: toolCall.id, toolName: 'design_critique',
      content: guidance, success: true, displayType: 'text',
      metadata: { focusArea }
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'design_critique', content: '', success: false, error: msg }
  }
}
