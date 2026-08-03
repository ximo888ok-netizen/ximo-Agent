import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk, ComponentMeta } from '@shared/types'
import { loadCatalog, refreshCatalog, readComponentFiles, saveCustomComponent, deleteCustomComponent } from './component-catalog'

/**
 * DesignComponentTool — UI 组件库工具
 *
 * 移植自 react-bits-main 的 139 个动效组件：
 * - action="list"            → 列出所有组件（按分类分组）
 * - action="get"             → 获取组件完整源码（JSX + CSS）
 * - action="list_categories" → 列出所有分类
 * - action="search"          → 按关键词搜索组件
 * - action="create"          → 创建自定义组件
 * - action="update"          → 更新自定义组件
 * - action="delete"          → 删除自定义组件
 */
export class DesignComponentTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'design_component',
    description:
      'UI 动效组件库（139+ 个组件，移植自 react-bits）：列出/搜索/获取组件源码。包含 4 大分类：交互组件（Dock、Carousel、MagicBento 等）、动画效果（StarBorder、Magnet、Ribbons 等）、背景特效（Aurora、Particles、Iridescence 等）、文字动画（GradientText、BlurText、CountUp 等）。组件基于 React + motion/gsap/ogl/three.js。支持创建/更新/删除自定义组件。使用流程：list 或 search 浏览组件 → get 获取完整源码 → 适配到生成的 HTML 中 → design_preview 预览。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '操作类型：list=列出所有组件，get=获取组件源码，list_categories=列出分类，search=搜索组件，create=创建自定义组件，update=更新自定义组件，delete=删除自定义组件',
          enum: ['list', 'get', 'list_categories', 'search', 'create', 'update', 'delete']
        },
        component_id: { type: 'string', description: '组件 ID（action=get 时使用），如 Aurora、GradientText、MagicBento、Dock、SpotlightCard' },
        category: { type: 'string', description: '按分类过滤（action=list 时可选）：Components、Animations、Backgrounds、TextAnimations' },
        query: { type: 'string', description: '搜索关键词（action=search 时使用），如"卡片"、"背景"、"文字动画"' },
        name_cn: { type: 'string', description: '组件中文名（create 时必填），如"流星卡片"' },
        component_category: { type: 'string', description: '组件分类 key（create 时必填）：Components、Animations、Backgrounds、TextAnimations' },
        component_category_cn: { type: 'string', description: '分类中文名（create 时必填），如"交互组件"、"动画效果"、"背景特效"、"文字动画"' },
        jsx: { type: 'string', description: '组件 JSX 源码（create/update 时必填）' },
        css: { type: 'string', description: '组件 CSS 源码（create/update 时可选）' },
        dependencies: { type: 'array', description: '依赖列表（create 时可选），如 ["motion", "gsap"]', items: { type: 'string' } },
        props: { type: 'array', description: 'Props 列表（create 时可选），如 ["children", "className"]', items: { type: 'string' } }
      },
      required: ['action']
    }
  }

  async execute(toolCall: ToolCall, onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal): Promise<ToolResult> {
    const action = (toolCall.arguments.action as string) || 'list'
    onChunk?.({ toolStatus: 'calling', toolName: 'design_component' })

    switch (action) {
      case 'list': return this.handleList(toolCall)
      case 'get': return this.handleGet(toolCall)
      case 'list_categories': return this.handleListCategories(toolCall)
      case 'search': return this.handleSearch(toolCall)
      case 'create': return await this.handleCreate(toolCall)
      case 'update': return await this.handleCreate(toolCall)
      case 'delete': return await this.handleDelete(toolCall)
      default: return this.error(toolCall.id, `未知操作: ${action}。支持: list / get / list_categories / search / create / update / delete`)
    }
  }

  private handleList(toolCall: ToolCall): ToolResult {
    const catalog = loadCatalog()
    const categoryFilter = (toolCall.arguments.category as string) || ''
    const filtered = categoryFilter ? catalog.filter(c => c.category === categoryFilter) : catalog

    if (filtered.length === 0) {
      return { toolCallId: toolCall.id, toolName: 'design_component', content: categoryFilter ? `分类"${categoryFilter}"下没有组件。` : '当前没有可用的 UI 组件。', success: true, displayType: 'text' }
    }

    const groups: Record<string, ComponentMeta[]> = {}
    for (const c of filtered) {
      if (!groups[c.category]) groups[c.category] = []
      groups[c.category].push(c)
    }

    const lines: string[] = [`## UI 动效组件库（${filtered.length} 个组件）\n`]
    for (const cat of Object.keys(groups).sort()) {
      const catCn = groups[cat][0]?.categoryCn || cat
      lines.push(`### ${catCn} (${cat})（${groups[cat].length} 个）\n`)
      for (const c of groups[cat]) {
        const deps = c.dependencies.length > 0 ? ` [依赖: ${c.dependencies.join(', ')}]` : ''
        lines.push(`- **${c.id}** — ${c.nameCn}${deps}`)
      }
      lines.push('')
    }
    lines.push('---', '使用 `design_component(action="get", component_id="组件ID")` 获取完整源码（JSX + CSS）。')

    return { toolCallId: toolCall.id, toolName: 'design_component', content: lines.join('\n'), success: true, displayType: 'text', metadata: { count: filtered.length, categories: Object.keys(groups).map(c => ({ category: c, count: groups[c].length })) } }
  }

  private handleListCategories(toolCall: ToolCall): ToolResult {
    const catalog = loadCatalog()
    const counts: Record<string, { count: number; nameCn: string }> = {}
    for (const c of catalog) {
      if (!counts[c.category]) counts[c.category] = { count: 0, nameCn: c.categoryCn }
      counts[c.category].count++
    }
    const lines = Object.entries(counts).sort(([, a], [, b]) => b.count - a.count).map(([cat, info]) => `- **${info.nameCn}** (${cat}) — ${info.count} 个组件`)
    return { toolCallId: toolCall.id, toolName: 'design_component', content: `## 组件分类（${catalog.length} 个组件，${Object.keys(counts).length} 个分类）\n\n${lines.join('\n')}`, success: true, displayType: 'text', metadata: { total: catalog.length, categories: counts } }
  }

  private handleSearch(toolCall: ToolCall): ToolResult {
    const query = ((toolCall.arguments.query as string) || '').toLowerCase()
    if (!query) return this.error(toolCall.id, 'search 操作需要 query 参数')

    const catalog = loadCatalog()
    const matched = catalog.filter(c =>
      c.id.toLowerCase().includes(query) || c.nameCn.includes(query) ||
      c.name.toLowerCase().includes(query) || c.category.toLowerCase().includes(query) ||
      c.categoryCn.includes(query) || c.dependencies.some(d => d.toLowerCase().includes(query))
    )

    if (matched.length === 0) {
      return { toolCallId: toolCall.id, toolName: 'design_component', content: `未找到匹配"${query}"的组件。使用 \`design_component(action="list")\` 查看所有组件。`, success: true, displayType: 'text' }
    }

    const lines = matched.map((c, i) => {
      const deps = c.dependencies.length > 0 ? ` [依赖: ${c.dependencies.join(', ')}]` : ''
      return `${i + 1}. **${c.id}** — ${c.nameCn} (${c.categoryCn})${deps}`
    })

    return { toolCallId: toolCall.id, toolName: 'design_component', content: `## 搜索结果（"${query}"，${matched.length} 个）\n\n${lines.join('\n')}\n\n---\n使用 \`design_component(action="get", component_id="组件ID")\` 获取完整源码。`, success: true, displayType: 'text', metadata: { query, matched: matched.map(c => ({ id: c.id, name: c.nameCn, category: c.category })) } }
  }

  private handleGet(toolCall: ToolCall): ToolResult {
    const componentId = (toolCall.arguments.component_id as string) || ''
    if (!componentId) return this.error(toolCall.id, 'get 操作需要 component_id 参数')

    const catalog = loadCatalog()
    const meta = catalog.find(c => c.id === componentId || c.id.toLowerCase() === componentId.toLowerCase())
    if (!meta) return this.error(toolCall.id, `未找到组件: ${componentId}。使用 \`design_component(action="list")\` 查看可用组件。`)

    const files = readComponentFiles(meta.category, meta.id)
    if (!files) return this.error(toolCall.id, `组件目录不存在: ${meta.category}/${meta.id}`)

    const parts: string[] = []
    parts.push(`## 组件: ${meta.nameCn} (${meta.id})\n`)
    parts.push(`**分类**: ${meta.categoryCn} (${meta.category})\n`)
    if (meta.dependencies.length > 0) parts.push(`**依赖**: ${meta.dependencies.join(', ')}\n`)
    if (meta.props.length > 0) parts.push(`**Props**: ${meta.props.join(', ')}\n`)

    if (files.jsx) { parts.push('\n---\n## 组件源码 (JSX)\n', '```jsx', files.jsx, '```') }
    if (files.css) { parts.push('\n---\n## 样式 (CSS)\n', '```css', files.css, '```') }

    parts.push('\n---\n## 使用方法')
    parts.push('1. 将 JSX 代码适配到你的 React 组件或 HTML 页面中')
    parts.push('2. 将 CSS 内容粘贴到 `<style>` 标签中')
    if (meta.dependencies.includes('motion')) parts.push('3. **motion/react 依赖**: 在 HTML 中引入 `https://cdn.jsdelivr.net/npm/framer-motion@11/dist/framer-motion.js`，将 `motion/react` 导入替换为全局变量 `Motion`')
    if (meta.dependencies.includes('gsap')) parts.push(`${meta.dependencies.includes('motion') ? '4' : '3'}. **gsap 依赖**: 在 HTML 中引入 \`https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js\`，将 \`import { gsap } from 'gsap'\` 替换为 \`const { gsap } = window;\``)
    if (meta.dependencies.includes('ogl')) parts.push(`- **ogl 依赖**: 在 HTML 中引入 \`https://cdn.jsdelivr.net/npm/ogl@1.0.11/dist/ogl.umd.js\`，将 \`from 'ogl'\` 的命名导入替换为 \`const { Renderer, Program, Mesh, Color, Triangle, ... } = OGL;\``)
    if (meta.dependencies.includes('three')) parts.push(`- **three 依赖**: 在 HTML 中引入 \`https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js\`，将 \`import * as THREE from 'three'\` 替换为 \`const THREE = window.THREE;\``)
    if (meta.dependencies.includes('matter-js')) parts.push(`- **matter-js 依赖**: 在 HTML 中引入 \`https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.20.0/matter.min.js\`，将 \`import Matter from 'matter-js'\` 替换为 \`const Matter = window.Matter;\``)
    parts.push('\n**提示**: 使用 `design_preview(html=代码)` 预览效果。画布会自动检测并加载所需依赖。')

    return { toolCallId: toolCall.id, toolName: 'design_component', content: parts.join('\n'), success: true, displayType: 'text', metadata: { component_id: meta.id, category: meta.category, dependencies: meta.dependencies, has_jsx: !!files.jsx, has_css: !!files.css } }
  }

  private async handleCreate(toolCall: ToolCall): Promise<ToolResult> {
    const id = (toolCall.arguments.component_id as string) || ''
    const nameCn = (toolCall.arguments.name_cn as string) || ''
    const category = (toolCall.arguments.component_category as string) || ''
    const categoryCn = (toolCall.arguments.component_category_cn as string) || ''
    const jsx = (toolCall.arguments.jsx as string) || ''
    const css = (toolCall.arguments.css as string) || null
    const deps = (toolCall.arguments.dependencies as string[]) || []
    const props = (toolCall.arguments.props as string[]) || []

    if (!id || !nameCn || !category || !jsx) return this.error(toolCall.id, 'create/update 需要 component_id, name_cn, component_category, jsx 参数')

    const meta: ComponentMeta = { id, name: id, nameCn, category, categoryCn: categoryCn || category, dependencies: deps, props, files: { jsx: `${id}.jsx`, css: css ? `${id}.css` : null, assets: null } }
    await saveCustomComponent(meta, jsx, css)
    refreshCatalog()

    return { toolCallId: toolCall.id, toolName: 'design_component', content: `✅ 自定义组件「${nameCn}」(ID: ${id}) 已保存。使用 \`design_component(action="get", component_id="${id}")\` 获取源码。`, success: true }
  }

  private async handleDelete(toolCall: ToolCall): Promise<ToolResult> {
    const id = (toolCall.arguments.component_id as string) || ''
    if (!id) return this.error(toolCall.id, 'delete 需要 component_id 参数')
    const ok = await deleteCustomComponent(id)
    if (!ok) return this.error(toolCall.id, `删除失败：自定义组件「${id}」不存在。内置组件不可删除。`)
    refreshCatalog()
    return { toolCallId: toolCall.id, toolName: 'design_component', content: `✅ 自定义组件「${id}」已删除。`, success: true }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'design_component', content: '', success: false, error: msg }
  }
}
