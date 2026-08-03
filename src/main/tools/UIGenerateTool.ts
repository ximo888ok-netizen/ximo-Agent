import type { Tool } from './Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'
import { templateLoader } from './Design/TemplateLoader'

/**
 * UIGenerateTool — UI 组件生成工具
 *
 * 参考 better-react-web-ui 的设计原则，根据自然语言描述生成 React + Tailwind CSS 组件。
 * 本工具不执行实际生成（由 LLM 完成），而是：
 * 1. 验证和规范化用户需求
 * 2. 注入设计约束（仅 Tailwind CSS、React 生态、响应式、无障碍）
 * 3. 提供组件生成的最佳实践指导
 * 4. 检测是否有匹配的设计模板，若有则引导使用模板系统
 */
export class UIGenerateTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'ui_generate',
    description:
      '根据自然语言描述生成 React + Tailwind CSS 前端组件代码。支持指定组件类型、样式风格、交互行为。生成的代码遵循 better-react-web-ui 设计规范：仅使用 Tailwind CSS 样式、支持暗色模式、响应式布局、无障碍访问。适用于快速原型设计、UI 重构、组件开发等场景。',
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'UI 组件的自然语言描述，如"一个带搜索框和筛选器的数据表格"'
        },
        componentType: {
          type: 'string',
          description: '组件类型：form（表单）、table（表格）、card（卡片）、dashboard（仪表盘）、landing（着陆页）、modal（弹窗）、nav（导航栏）、custom（自定义）',
          enum: ['form', 'table', 'card', 'dashboard', 'landing', 'modal', 'nav', 'custom'],
          default: 'custom'
        },
        style: {
          type: 'string',
          description: '视觉风格：minimal（极简）、corporate（商务）、playful（活泼）、elegant（优雅）、dark（暗色主题）',
          enum: ['minimal', 'corporate', 'playful', 'elegant', 'dark'],
          default: 'minimal'
        },
        framework: {
          type: 'string',
          description: '目标框架（当前仅支持 React）',
          enum: ['react'],
          default: 'react'
        }
      },
      required: ['description']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    _signal?: AbortSignal
  ): Promise<ToolResult> {
    const description = toolCall.arguments.description as string
    const componentType = (toolCall.arguments.componentType as string) || 'custom'
    const style = (toolCall.arguments.style as string) || 'minimal'

    if (!description || typeof description !== 'string') {
      return {
        toolCallId: toolCall.id,
        toolName: 'ui_generate',
        content: '',
        success: false,
        error: '缺少 UI 组件描述（description 参数）'
      }
    }

    onChunk?.({ toolStatus: 'calling', toolName: 'ui_generate' })

    // 检测是否有匹配的设计模板
    const matchedTemplates = templateLoader.match(description)
    const templateHint = matchedTemplates.length > 0
      ? matchedTemplates.slice(0, 3).map((t) => `\`${t.id}\``).join(', ')
      : ''

    // 构建设计约束 prompt，指导 LLM 生成高质量代码
    const designGuidance = this.buildDesignGuidance(componentType, style)

    // 如果有匹配的模板，在指导前加入模板提示
    const fullGuidance = templateHint
      ? `## 💡 检测到匹配的设计模板

你的需求匹配到以下模板：${templateHint}

**推荐流程**：使用 \`design_template(action="get", template_id="${matchedTemplates[0].id}")\` 获取完整模板上下文（含种子文件、布局库、自检清单），按照模板工作流生成自包含 HTML 原型，再用 \`design_preview\` 预览。

模板模式适合快速生成完整页面原型；下面的 React+Tailwind 指导适合生成可复用组件。

---

${designGuidance}`
      : designGuidance

    return {
      toolCallId: toolCall.id,
      toolName: 'ui_generate',
      content: fullGuidance,
      success: true,
      displayType: 'code',
      metadata: { description, componentType, style, matchedTemplates: matchedTemplates.slice(0, 3).map((t) => t.id) }
    }
  }

  /** 构建设计指导 prompt（参考 better-react-web-ui 的 36 项技能原则） */
  private buildDesignGuidance(componentType: string, style: string): string {
    const styleGuides: Record<string, string> = {
      minimal:
        '- 使用大量留白和清晰的视觉层级\n- 颜色克制，以中性色为主，品牌色仅用于关键操作\n- 圆角小（rounded-md 或以下），阴影轻（shadow-sm）\n- 字体层次扁平，不超过 3 级字号',
      corporate:
        '- 专业稳重，使用深蓝色或深灰色为主调\n- 间距紧凑但不拥挤，信息密度适中\n- 表格/数据区域使用斑马纹和清晰边框\n- 按钮使用圆角矩形，字号略大保证可读性',
      playful:
        '- 明亮活泼的色彩搭配，可使用渐变和圆角（rounded-xl）\n- 卡片式布局，适当使用 emoji 或图标\n- 阴影更明显（shadow-md ~ shadow-lg）\n- 动效丰富但不打扰（hover 缩放、过渡动画）',
      elegant:
        '- 精致的排版，使用 serif 或优雅的无衬线字体\n- 细线条边框、柔和的阴影\n- 金色/玫瑰金/深紫等高级配色\n- 大留白、不对称布局可用',
      dark:
        '- 深色背景（slate-900 ~ slate-950），浅色文字\n- 使用 slate/gray 的暗色变体\n- 边框使用半透明（border-white/10）\n- 确保对比度满足 WCAG AA 标准（至少 4.5:1）'
    }

    const typeGuides: Record<string, string> = {
      form: '表单类型：\n- 使用受控组件 + React Hook Form 或原生 state\n- 字段分组清晰，label 在输入框上方\n- 验证状态明确（红色错误提示、绿色成功标记）\n- 提交按钮禁用态、加载态\n- 支持键盘提交（Enter）',
      table: '表格类型：\n- 表头固定（sticky top-0）\n- 列可排序（点击表头切换升/降序图标）\n- 斑马纹行（even:bg-slate-50）\n- 响应式：小屏显示为卡片列表\n- 空状态提示友好',
      card: '卡片类型：\n- 统一的 padding 和圆角\n- hover 时轻微上浮（translateY + shadow）\n- 图片/图标区域 + 文字区域分离\n- 如有操作按钮放在卡片底部',
      dashboard: '仪表盘类型：\n- 网格布局（grid-cols-1 md:grid-cols-2 lg:grid-cols-3/4）\n- 关键指标卡片（KPI Card）突出显示\n- 图表区域使用占位符（便于集成图表库）\n- 顶部可放日期筛选或全局操作栏',
      landing: '着陆页类型：\n- Hero 区域突出，使用大标题 + 副标题 + CTA 按钮\n- 特性展示区（Feature Section）使用图标 + 文字\n- 社会证明区（客户 Logo、用户评价）\n- Footer 包含链接导航',
      modal: '弹窗类型：\n- 居中显示，背景遮罩半透明\n- 标题栏 + 内容区 + 操作按钮栏\n- ESC 键和点击遮罩关闭\n- 焦点陷阱（Tab 在弹窗内循环）\n- 打开/关闭动画',
      nav: '导航栏类型：\n- 响应式：大屏水平导航，小屏汉堡菜单\n- 当前页高亮（aria-current="page"）\n- Sticky 置顶\n- 下拉菜单使用 Popover/Disclosure 模式',
      custom: ''
    }

    return `## 🎨 UI 组件生成规范

请根据以下描述生成 React + Tailwind CSS 组件：

### 用户需求
用户描述：${/* 由 LLM 从上下文中获取 */''}

### 设计约束（必须遵守）

**技术栈：**
- 仅使用 React + Tailwind CSS（禁止内联样式、CSS Modules、styled-components）
- Tailwind classes 类名按建议顺序排列：布局 → 间距 → 尺寸 → 排版 → 视觉 → 其他
- 组件以默认导出形式提供，放在 \`\`\`tsx 代码块中

**风格指南（${style}）：**
${styleGuides[style] || styleGuides.minimal}

**组件特定要求：**
${typeGuides[componentType] || typeGuides.custom}

**通用要求：**
- 暗色模式支持（dark: 前缀）
- 响应式设计（移动优先，使用 sm:/md:/lg: 断点）
- 无障碍：语义化 HTML、合适的 aria 属性、键盘可操作
- 过渡动画：hover/focus 状态变化使用 transition-all duration-200
- 组件可独立使用，不依赖外部状态管理
- 如需图标，使用 SVG 内联或 lucide-react（项目已安装）

**颜色系统参考：**
- Primary: blue-600 / blue-500 (hover) / blue-700 (active)
- Success: green-600 | Warning: amber-500 | Error: red-600
- Text: slate-900 (dark: slate-100) | Secondary: slate-500 (dark: slate-400)
- Background: white (dark: slate-900) | Surface: slate-50 (dark: slate-800)
- Border: slate-200 (dark: slate-700)

请直接生成完整的 \`\`\`tsx 代码块。代码应可直接复制使用。`
  }
}
