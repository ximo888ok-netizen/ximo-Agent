import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { listCustomStyleIds, customStyleDir, readCustomStyleFiles, saveCustomStyle, deleteCustomStyle } from '@main/CustomDesignStore'

/**
 * 解析 design-systems 目录的绝对路径。
 *
 * electron-vite 打包后代码在 out/main/ 下，而 design-systems 是静态资源不会被打包。
 * 需要多重回退：① 打包后同目录（生产构建复制了资源）→ ② 源码目录（dev 模式）→ ③ 项目根 + src 路径。
 */
function resolveDesignSystemsDir(): string {
  // ① import.meta.url 同目录（资源已复制到输出目录）
  const bundledDir = dirname(new URL(import.meta.url).pathname.replace(/^\//, ''))
  const path1 = join(bundledDir, 'design-systems')
  if (existsSync(path1)) return path1

  // ② 源码目录（dev 模式：从 out/main/ 回溯到 src/main/tools/Design/）
  const srcDir = join(bundledDir, '../../src/main/tools/Design/design-systems')
  if (existsSync(srcDir)) return srcDir

  // ③ 项目根 + 源码路径
  const cwdDir = join(process.cwd(), 'src/main/tools/Design/design-systems')
  if (existsSync(cwdDir)) return cwdDir

  // 回退到 ①（即使不存在，也返回一个合理路径用于错误信息）
  return path1
}

/** design-systems 根目录 */
const DESIGN_SYSTEMS_DIR = resolveDesignSystemsDir()

/** 风格系统元数据 */
interface StyleManifest {
  id: string
  name: string
  category: string
  description: string
}

/** 缓存目录扫描结果 */
let cachedStyles: StyleManifest[] | null = null

/** 扫描内置 + 自定义风格 */
function scanStyles(): StyleManifest[] {
  if (cachedStyles) return cachedStyles

  const result: StyleManifest[] = []

  // 内置风格
  const stylesDir = DESIGN_SYSTEMS_DIR
  if (existsSync(stylesDir)) {
    const entries = readdirSync(stylesDir)
    for (const entry of entries) {
      const dir = join(stylesDir, entry)
      if (!statSync(dir).isDirectory()) continue
      const manifestPath = join(dir, 'manifest.json')
      if (!existsSync(manifestPath)) continue
      try {
        const raw = JSON.parse(readFileSync(manifestPath, 'utf8'))
        result.push({
          id: raw.id || entry,
          name: raw.name || entry,
          category: raw.category || 'Other',
          description: raw.description || ''
        })
      } catch {
        // skip invalid
      }
    }
  }

  // 自定义风格
  for (const id of listCustomStyleIds()) {
    const files = readCustomStyleFiles(id)
    if (files?.manifest) {
      const raw = files.manifest as Record<string, string>
      const existingIdx = result.findIndex(s => s.id === id)
      const entry = { id: raw.id || id, name: raw.name || id, category: raw.category || '自定义', description: raw.description || '' }
      if (existingIdx >= 0) result[existingIdx] = entry
      else result.push(entry)
    }
  }

  cachedStyles = result.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
  return cachedStyles
}

/** 刷新缓存（创建/更新/删除后调用） */
function refreshStyles(): void { cachedStyles = null }

/**
 * DesignStyleTool — 设计风格系统工具
 *
 * 移植自 open-design-main 的 design-systems 目录（151 个风格包）：
 * - action="list"            → 列出所有风格系统（按分类分组）
 * - action="get"             → 获取风格完整上下文（DESIGN.md + tokens.css）
 * - action="list_categories" → 列出所有分类及每类的风格数
 * - action="create"          → 创建自定义风格（写入用户数据目录）
 * - action="update"          → 更新自定义风格内容
 * - action="delete"          → 删除自定义风格
 */
export class DesignStyleTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'design_style',
    description:
      '设计风格系统：列出 151+ 个设计风格（含 Apple、GitHub、Stripe、Brutalism、Minimal 等），获取风格完整上下文（DESIGN.md 设计指南 + tokens.css CSS 变量）。生成 UI 时使用此工具指定视觉风格。支持创建/更新/删除自定义风格。使用流程：先 list 浏览风格 → 再 get 获取 tokens.css 和设计指南 → 将 :root { ... } 粘贴到 HTML <style> 中 → 所有样式引用 var(--name)。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '操作类型：list=列出所有风格，get=获取风格完整上下文，list_categories=列出分类，create=创建自定义风格，update=更新风格内容，delete=删除自定义风格',
          enum: ['list', 'get', 'list_categories', 'create', 'update', 'delete']
        },
        style_id: {
          type: 'string',
          description: '风格 ID，如 apple、github、minimal。create/update/delete 时为自定义风格 ID（仅字母数字下划线横线）'
        },
        name: {
          type: 'string',
          description: '风格显示名称（create 时必填），如"赛博朋克风"'
        },
        category: {
          type: 'string',
          description: '分类（create 时可选），如"自定义风格"。list 时可选，用于按分类过滤'
        },
        description: {
          type: 'string',
          description: '风格描述（create 时可选）'
        },
        design_md: {
          type: 'string',
          description: '设计指南 Markdown 文本（create/update 时必填），描述颜色用法、排版层级、组件规范等'
        },
        tokens_css: {
          type: 'string',
          description: 'CSS 变量文本（create/update 时必填），含 :root { --accent: ...; --bg: ...; } 等变量定义'
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

    onChunk?.({ toolStatus: 'calling', toolName: 'design_style' })

    switch (action) {
      case 'list':
        return this.handleList(toolCall)
      case 'get':
        return this.handleGet(toolCall)
      case 'list_categories':
        return this.handleListCategories(toolCall)
      case 'create':
        return this.handleCreate(toolCall)
      case 'update':
        return this.handleCreate(toolCall) // create 和 update 逻辑一致（覆写）
      case 'delete':
        return await this.handleDelete(toolCall)
      default:
        return this.error(toolCall.id, `未知操作: ${action}。支持: list / get / list_categories / create / update / delete`)
    }
  }

  /** 列出所有风格 */
  private handleList(toolCall: ToolCall): ToolResult {
    const styles = scanStyles()
    const categoryFilter = (toolCall.arguments.category as string) || ''

    const filtered = categoryFilter
      ? styles.filter((s) => s.category === categoryFilter)
      : styles

    if (filtered.length === 0) {
      return {
        toolCallId: toolCall.id,
        toolName: 'design_style',
        content: categoryFilter
          ? `分类"${categoryFilter}"下没有风格系统。`
          : '当前没有可用的设计风格系统。',
        success: true,
        displayType: 'text'
      }
    }

    // 按分类分组
    const groups: Record<string, StyleManifest[]> = {}
    for (const s of filtered) {
      if (!groups[s.category]) groups[s.category] = []
      groups[s.category].push(s)
    }

    const lines: string[] = [`## 设计风格系统（${filtered.length} 个）\n`]
    for (const cat of Object.keys(groups).sort()) {
      lines.push(`### ${cat}（${groups[cat].length} 个）\n`)
      for (const s of groups[cat]) {
        lines.push(`- **${s.id}** — ${s.name}`)
      }
      lines.push('')
    }

    lines.push('---')
    lines.push('使用 `design_style(action="get", style_id="风格ID")` 获取完整风格上下文（DESIGN.md + tokens.css）。')

    return {
      toolCallId: toolCall.id,
      toolName: 'design_style',
      content: lines.join('\n'),
      success: true,
      displayType: 'text',
      metadata: {
        count: filtered.length,
        categories: Object.keys(groups).map((c) => ({ category: c, count: groups[c].length }))
      }
    }
  }

  /** 列出所有分类 */
  private handleListCategories(toolCall: ToolCall): ToolResult {
    const styles = scanStyles()
    const counts: Record<string, number> = {}
    for (const s of styles) {
      counts[s.category] = (counts[s.category] || 0) + 1
    }

    const lines = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([cat, count]) => `- **${cat}** — ${count} 个风格`)

    return {
      toolCallId: toolCall.id,
      toolName: 'design_style',
      content: `## 设计风格分类（${styles.length} 个风格，${Object.keys(counts).length} 个分类）\n\n${lines.join('\n')}`,
      success: true,
      displayType: 'text',
      metadata: { total: styles.length, categories: counts }
    }
  }

  /** 获取风格完整上下文 */
  private handleGet(toolCall: ToolCall): ToolResult {
    const styleId = (toolCall.arguments.style_id as string) || ''
    if (!styleId) {
      return this.error(toolCall.id, 'get 操作需要 style_id 参数')
    }

    // 优先查自定义风格，其次内置
    const customFiles = readCustomStyleFiles(styleId)
    const builtinDir = join(DESIGN_SYSTEMS_DIR, styleId)
    const hasCustom = customFiles !== null
    const hasBuiltin = existsSync(builtinDir)
    if (!hasCustom && !hasBuiltin) {
      return this.error(toolCall.id, `未找到风格系统: ${styleId}。使用 \`design_style(action="list")\` 查看可用风格。`)
    }

    const parts: string[] = []

    // manifest.json
    let manifest: StyleManifest | null = null
    const manifestData = hasCustom ? customFiles!.manifest : null
    if (manifestData) {
      const raw = manifestData as Record<string, string>
      manifest = { id: raw.id || styleId, name: raw.name || styleId, category: raw.category || 'Other', description: raw.description || '' }
    } else {
      const manifestPath = join(builtinDir, 'manifest.json')
      if (existsSync(manifestPath)) {
        try {
          const raw = JSON.parse(readFileSync(manifestPath, 'utf8'))
          manifest = { id: raw.id, name: raw.name, category: raw.category, description: raw.description }
        } catch { /* skip */ }
      }
    }
    if (manifest) {
      parts.push(`## 设计风格: ${manifest.name} (${manifest.id})\n`)
      parts.push(`**分类**: ${manifest.category}\n`)
    }

    // DESIGN.md
    const designMd = hasCustom ? customFiles!.designMd : (existsSync(join(builtinDir, 'DESIGN.md')) ? readFileSync(join(builtinDir, 'DESIGN.md'), 'utf8') : null)
    if (designMd) {
      parts.push('\n---\n## 设计指南 (DESIGN.md)\n')
      parts.push(designMd)
    }

    // tokens.css
    const tokensCss = hasCustom ? customFiles!.tokensCss : (existsSync(join(builtinDir, 'tokens.css')) ? readFileSync(join(builtinDir, 'tokens.css'), 'utf8') : null)
    if (tokensCss) {
      parts.push('\n---\n## 设计令牌 (tokens.css)\n')
      parts.push('将以下 `:root { ... }` 块粘贴到 HTML 的第一个 `<style>` 中，然后所有样式引用 `var(--name)`：\n')
      parts.push('```css')
      parts.push(tokensCss)
      parts.push('```')
    }

    parts.push('\n---\n## 使用方法')
    parts.push('1. 将 tokens.css 中的 `:root { ... }` 块粘贴到 HTML `<style>` 标签内')
    parts.push('2. 所有颜色使用 `var(--accent)`、`var(--bg)`、`var(--fg)` 等')
    parts.push('3. 字体使用 `var(--font-display)`、`var(--font-body)`')
    parts.push('4. 间距使用 `var(--space-1)` 到 `var(--space-12)`')
    parts.push('5. 圆角使用 `var(--radius-sm)` 到 `var(--radius-pill)`')
    parts.push('6. 遵循 DESIGN.md 中的设计指南（颜色用法、排版层级、组件规范等）')

    return {
      toolCallId: toolCall.id,
      toolName: 'design_style',
      content: parts.join('\n'),
      success: true,
      displayType: 'text',
      metadata: { style_id: styleId, has_design_md: !!designMd, has_tokens: !!tokensCss, is_custom: hasCustom }
    }
  }

  /** 创建/更新自定义风格 */
  private async handleCreate(toolCall: ToolCall): Promise<ToolResult> {
    const id = (toolCall.arguments.style_id as string) || ''
    const name = (toolCall.arguments.name as string) || ''
    const category = (toolCall.arguments.category as string) || '自定义风格'
    const description = (toolCall.arguments.description as string) || ''
    const designMd = (toolCall.arguments.design_md as string) || ''
    const tokensCss = (toolCall.arguments.tokens_css as string) || ''

    if (!id || !name) {
      return this.error(toolCall.id, 'create/update 需要 style_id 和 name 参数')
    }
    if (!designMd || !tokensCss) {
      return this.error(toolCall.id, 'create/update 需要 design_md 和 tokens_css 参数')
    }

    await saveCustomStyle(id, { id, name, category, description }, designMd, tokensCss)
    refreshStyles()

    return {
      toolCallId: toolCall.id,
      toolName: 'design_style',
      content: `✅ 自定义风格「${name}」(ID: ${id}) 已保存。使用 \`design_style(action="get", style_id="${id}")\` 获取完整内容。`,
      success: true
    }
  }

  /** 删除自定义风格 */
  private async handleDelete(toolCall: ToolCall): Promise<ToolResult> {
    const id = (toolCall.arguments.style_id as string) || ''
    if (!id) {
      return this.error(toolCall.id, 'delete 需要 style_id 参数')
    }
    const ok = await deleteCustomStyle(id)
    if (!ok) {
      return this.error(toolCall.id, `删除失败：自定义风格「${id}」不存在。内置风格不可删除。`)
    }
    refreshStyles()
    return {
      toolCallId: toolCall.id,
      toolName: 'design_style',
      content: `✅ 自定义风格「${id}」已删除。`,
      success: true
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'design_style', content: '', success: false, error: msg }
  }
}
