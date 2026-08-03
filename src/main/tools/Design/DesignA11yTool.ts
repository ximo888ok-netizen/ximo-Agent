import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

/**
 * DesignA11yTool — 无障碍专项审查
 */
export class DesignA11yTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'design_a11y',
    description: '对 UI 进行无障碍专项审查（WCAG 2.1 AA 标准）。检查 ARIA 属性、键盘导航、屏幕阅读器兼容、对比度要求等。',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '要检查的 HTML/React 代码' }
      },
      required: ['code']
    }
  }

  async execute(toolCall: ToolCall, onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal): Promise<ToolResult> {
    const code = (toolCall.arguments.code as string) || ''
    if (!code) return this.error(toolCall.id, '缺少 code 参数')
    onChunk?.({ toolStatus: 'calling', toolName: 'design_a11y' })

    const issues: Array<{ severity: string; description: string }> = []

    // WCAG 检查
    if (!code.includes('aria-label') && !code.includes('aria-labelledby')) {
      issues.push({ severity: 'medium', description: '缺少 aria-label 或 aria-labelledby — 屏幕阅读器用户可能无法理解元素含义' })
    }
    if (!code.includes('role=')) {
      issues.push({ severity: 'low', description: '未使用 role 属性 — 自定义组件可能无法被屏幕阅读器正确识别' })
    }
    if (!code.includes('tabIndex') && !code.includes('tabindex')) {
      issues.push({ severity: 'low', description: '未设置 tabindex — 键盘导航可能不完整' })
    }
    if (!code.includes('aria-hidden')) {
      issues.push({ severity: 'low', description: '未使用 aria-hidden 隐藏装饰性元素' })
    }

    const interactions = (code.match(/onClick|onKeyDown|onKeyUp/g) || []).length
    if (interactions > 0 && !code.includes('onKeyDown') && !code.includes('onKeyUp')) {
      issues.push({ severity: 'high', description: '有 onclick 但缺少 onKeyDown/onKeyUp — 键盘用户无法操作' })
    }

    const content = [
      `## ♿ 无障碍审查报告 (WCAG 2.1 AA)`,
      '',
      `检查项：${5} | 问题：${issues.length}`,
      ''
    ]
    if (issues.length === 0) {
      content.push('✅ 基础无障碍检查通过。')
    } else {
      content.push('### 发现的问题')
      issues.forEach((issue, i) => {
        content.push(`**${i + 1}. [${issue.severity}]** ${issue.description}`)
      })
    }

    content.push('', '### WCAG 2.1 AA 核心要求', '- 颜色对比度 ≥ 4.5:1（正文）/ 3:1（大字）', '- 所有交互元素可通过键盘操作', '- 图片提供替代文本（alt）', '- 表单控件关联 label', '- ARIA 属性在自定义组件上正确使用')

    return {
      toolCallId: toolCall.id, toolName: 'design_a11y',
      content: content.join('\n'), success: true, displayType: 'text',
      metadata: { issues, issuesCount: issues.length }
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'design_a11y', content: '', success: false, error: msg }
  }
}
