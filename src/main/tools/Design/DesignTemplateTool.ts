import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'
import { templateLoader } from './TemplateLoader'

/**
 * DesignTemplateTool — 设计模板系统工具
 *
 * 移植自 open-design-main 的模板模式：
 * - action="list"  → 列出所有可用模板
 * - action="match" → 按关键词匹配模板
 * - action="get"   → 获取模板完整上下文（SKILL.md + 种子文件 + 布局库 + 自检清单）
 *
 * 工作流程：
 * 1. 用户描述需求 → LLM 调用 match 找到匹配模板
 * 2. LLM 调用 get 获取完整模板上下文
 * 3. LLM 按照模板工作流生成 HTML
 * 4. LLM 调用 design_preview 预览结果
 */
export class DesignTemplateTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'design_template',
    description:
      '设计模板系统：列出可用模板、按需求匹配模板、获取模板完整上下文（含种子文件、布局库、自检清单）。模板提供结构化的前端 UI 原型生成工作流，包括设计令牌系统、可粘贴的布局骨架和质量自检清单。使用流程：先 match 找到匹配模板 → 再 get 获取完整上下文 → 按模板工作流生成 HTML → 用 design_preview 预览。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '操作类型：list=列出所有模板，match=按关键词匹配模板，get=获取模板完整上下文',
          enum: ['list', 'match', 'get']
        },
        query: {
          type: 'string',
          description: '匹配查询（action=match 时使用），如"后台管理界面"、"移动端 App"、"SaaS 着陆页"'
        },
        template_id: {
          type: 'string',
          description: '模板 ID（action=get 时使用），如 web-prototype、dashboard、mobile-app、saas-landing'
        }
      },
      required: ['action']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    _signal?: AbortSignal
  ): Promise<ToolResult> {
    const action = (toolCall.arguments.action as string) || 'list'

    onChunk?.({ toolStatus: 'calling', toolName: 'design_template' })

    switch (action) {
      case 'list':
        return this.handleList(toolCall)
      case 'match':
        return this.handleMatch(toolCall)
      case 'get':
        return this.handleGet(toolCall)
      default:
        return this.error(toolCall.id, `未知操作: ${action}。支持: list / match / get`)
    }
  }

  /** 列出所有模板 */
  private handleList(toolCall: ToolCall): ToolResult {
    const templates = templateLoader.list()

    if (templates.length === 0) {
      return {
        toolCallId: toolCall.id,
        toolName: 'design_template',
        content: '当前没有可用的设计模板。',
        success: true,
        displayType: 'text'
      }
    }

    const lines = templates.map((t) => {
      const triggers = t.triggers.length > 0 ? `（触发词: ${t.triggers.join(', ')}）` : ''
      return `- **${t.id}** — ${t.name}${triggers}\n  ${t.description.split('\n')[0]}`
    })

    return {
      toolCallId: toolCall.id,
      toolName: 'design_template',
      content: `## 可用设计模板（${templates.length} 个）\n\n${lines.join('\n\n')}\n\n---\n使用 \`design_template(action="get", template_id="模板ID")\` 获取完整模板上下文。`,
      success: true,
      displayType: 'text',
      metadata: { count: templates.length, templates: templates.map((t) => ({ id: t.id, name: t.name, triggers: t.triggers })) }
    }
  }

  /** 按关键词匹配模板 */
  private handleMatch(toolCall: ToolCall): ToolResult {
    const query = (toolCall.arguments.query as string) || ''
    if (!query) {
      return this.error(toolCall.id, 'match 操作需要 query 参数')
    }

    const matched = templateLoader.match(query)

    if (matched.length === 0) {
      return {
        toolCallId: toolCall.id,
        toolName: 'design_template',
        content: `未找到匹配"${query}"的模板。使用 \`design_template(action="list")\` 查看所有可用模板。`,
        success: true,
        displayType: 'text'
      }
    }

    const lines = matched.map((t, i) => {
      const triggers = t.triggers.length > 0 ? `（触发词: ${t.triggers.join(', ')}）` : ''
      return `${i + 1}. **${t.id}** — ${t.name}${triggers}\n   ${t.description.split('\n')[0]}`
    })

    const best = matched[0]

    return {
      toolCallId: toolCall.id,
      toolName: 'design_template',
      content: `## 模板匹配结果（"${query}"）\n\n匹配到 ${matched.length} 个模板：\n\n${lines.join('\n\n')}\n\n---\n推荐使用 **${best.id}**。调用 \`design_template(action="get", template_id="${best.id}")\` 获取完整模板上下文。`,
      success: true,
      displayType: 'text',
      metadata: {
        query,
        matched: matched.map((t) => ({ id: t.id, name: t.name })),
        recommended: best.id
      }
    }
  }

  /** 获取模板完整上下文 */
  private handleGet(toolCall: ToolCall): ToolResult {
    const templateId = (toolCall.arguments.template_id as string) || ''
    if (!templateId) {
      return this.error(toolCall.id, 'get 操作需要 template_id 参数')
    }

    const ctx = templateLoader.getContext(templateId)
    if (!ctx) {
      return this.error(toolCall.id, `未找到模板: ${templateId}。使用 \`design_template(action="list")\` 查看可用模板。`)
    }

    // 构建完整上下文文本
    const parts: string[] = []

    parts.push(`## 模板: ${ctx.name} (${ctx.id})\n`)
    parts.push(`**平台**: ${ctx.platform}\n`)
    if (ctx.triggers.length > 0) {
      parts.push(`**触发词**: ${ctx.triggers.join(', ')}\n`)
    }

    // SKILL.md 正文（工作流说明）
    parts.push('\n---\n## 工作流说明\n')
    parts.push(ctx.body)

    // 种子文件
    if (ctx.seed) {
      parts.push('\n---\n## 种子文件 (assets/template.html)\n')
      parts.push('以下是种子模板 HTML。复制此文件作为基础，按照上述工作流填充内容：\n')
      parts.push('```html')
      parts.push(ctx.seed)
      parts.push('```')
    }

    // 布局库
    if (ctx.layouts) {
      parts.push('\n---\n## 布局库 (references/layouts.md)\n')
      parts.push(ctx.layouts)
    }

    // 自检清单
    if (ctx.checklist) {
      parts.push('\n---\n## 自检清单 (references/checklist.md)\n')
      parts.push(ctx.checklist)
    }

    parts.push('\n---\n## 下一步')
    parts.push('1. 按照上述工作流生成 HTML')
    parts.push('2. 使用 `design_preview(html=生成的HTML)` 预览结果')
    parts.push('3. 根据自检清单验证质量')

    return {
      toolCallId: toolCall.id,
      toolName: 'design_template',
      content: parts.join('\n'),
      success: true,
      displayType: 'text',
      metadata: {
        template_id: ctx.id,
        has_seed: !!ctx.seed,
        has_layouts: !!ctx.layouts,
        has_checklist: !!ctx.checklist
      }
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'design_template', content: '', success: false, error: msg }
  }
}
