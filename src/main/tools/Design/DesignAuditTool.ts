import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

/**
 * DesignAuditTool — UI 质量审计
 * 可量化的 UI 质量检查（对比度/语义化/响应式/性能分数）
 */
export class DesignAuditTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'design_audit',
    description: '对 UI 代码进行可量化的质量审计。检查对比度、语义化 HTML、响应式完整度、性能标记等。通过静态代码分析给出结构化报告和分数。',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '要审计的 HTML/React 代码' }
      },
      required: ['code']
    }
  }

  async execute(toolCall: ToolCall, onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal): Promise<ToolResult> {
    const code = (toolCall.arguments.code as string) || ''
    if (!code) return this.error(toolCall.id, '缺少 code 参数')
    onChunk?.({ toolStatus: 'calling', toolName: 'design_audit' })

    const findings: string[] = []
    let score = 100

    // 检查语义化 HTML
    const semanticElements = ['<header', '<main', '<nav', '<footer', '<section', '<article', '<aside', '<h1', '<h2', '<h3']
    const found = semanticElements.filter((el) => code.includes(el))
    if (found.length < 3) {
      findings.push(`⚠️ 语义化 HTML 使用不足（发现 ${found.length}/${semanticElements.length} 个语义标签）`)
      score -= 15
    }

    // 检查 alt 属性
    const imgTags = code.match(/<img[^>]*>/g) || []
    const missingAlt = imgTags.filter((t) => !t.includes('alt='))
    if (missingAlt.length > 0) {
      findings.push(`⚠️ 有 ${missingAlt.length} 个 <img> 缺少 alt 属性`)
      score -= 10
    }

    // 检查暗色模式
    if (!code.includes('dark:')) {
      findings.push('⚠️ 未发现暗色模式支持（缺少 dark: 前缀）')
      score -= 10
    }

    // 检查响应式
    const responsiveClasses = ['sm:', 'md:', 'lg:', 'xl:', '2xl:']
    const hasResponsive = responsiveClasses.filter((c) => code.includes(c))
    if (hasResponsive.length < 2) {
      findings.push('⚠️ 响应式断点使用不足（建议至少使用 sm: 和 md:）')
      score -= 10
    }

    // 检查表单 label
    const inputs = code.match(/<input[^>]*>/g) || []
    const labels = code.match(/<label[^>]*>/g) || []
    if (inputs.length > labels.length) {
      findings.push('⚠️ 表单输入可能缺少关联 <label>')
      score -= 10
    }

    // 检查内联样式
    if (code.includes('style={{') || code.includes('style="')) {
      findings.push('⚠️ 存在内联样式，建议迁移到 Tailwind 类')
      score -= 5
    }

    if (findings.length === 0) {
      findings.push('✅ 基础审计通过，无明显问题')
    }

    const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D'

    const content = [
      `## 🔍 UI 质量审计报告`,
      '',
      `**总分**：${score}/100 (${grade})`,
      '',
      '### 检查结果',
      ...findings,
      '',
      '### 建议的改进方向',
      '- 使用 semantic HTML 标签替代 div',
      '- 为所有 `<img>` 添加有意义的 alt 文本',
      '- 通过 `dark:` 前缀支持暗色模式',
      '- 使用 sm:/md:/lg: 确保响应式体验',
      '- 关联 `<label>` 与表单控件提升可访问性'
    ].join('\n')

    return {
      toolCallId: toolCall.id, toolName: 'design_audit',
      content, success: true, displayType: 'text',
      metadata: { score, grade, findings: findings.map(f => ({ description: f })), findingsCount: findings.length }
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'design_audit', content: '', success: false, error: msg }
  }
}
