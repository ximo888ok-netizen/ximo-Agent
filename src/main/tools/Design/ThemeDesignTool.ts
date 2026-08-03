import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'
import { importThemePack, listThemePacks, deleteThemePack } from '@main/ThemePackStore'

/**
 * ThemeDesignTool — 主题与转场设计工具
 *
 * 让设计模式 Agent 用自然语言定制 UI 主题和转场动画，定制后自动加载到设置。
 *
 * - action="create_theme"       → 从 CSS 变量创建主题包，自动导入并应用
 * - action="list_themes"        → 列出已导入的主题包
 * - action="apply_theme"        → 应用指定主题包
 * - action="delete_theme"       → 删除主题包
 * - action="set_transition"     → 设置转场样式/配色/粒子/时长
 * - action="create_transition"  → 创建自定义转场动画（CSS + 粒子变量）
 *
 * 工具执行成功后通过 metadata.settingsPatch 返回需要更新的设置项，
 * runStream 自动调用 updateSettings 应用到 UI。
 */
export class ThemeDesignTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'theme_design',
    description: [
      '主题与转场设计工具：用自然语言为用户定制 UI 主题色/背景/玻璃材质/文字颜色，以及开屏转场动画样式。',
      '定制完成后自动导入并应用到设置，无需用户手动操作。',
      '',
      '## 可定制的 CSS 变量（主题包）',
      '以下变量均可覆盖，值必须是合法 CSS 字符串（颜色值、rgba 等）：',
      '- --theme-color        主色调（影响按钮、链接、高亮）',
      '- --bg-base            页面底色',
      '- --bg-surface         卡片/面板背景',
      '- --bg-elevated        弹出层/悬浮层背景',
      '- --bg-hover           悬停态背景',
      '- --bg-input           输入框背景',
      '- --glass-bg           玻璃材质背景',
      '- --glass-bg-strong    玻璃材质强化背景',
      '- --glass-border       玻璃边框',
      '- --glass-highlight    玻璃高光',
      '- --glass-shadow       玻璃阴影',
      '- --glow-color         光晕颜色',
      '- --border-DEFAULT     默认边框',
      '- --border-subtle      细微边框',
      '- --border-hover       悬停边框',
      '- --text-primary       主文字色',
      '- --text-secondary     次文字色',
      '- --text-muted         弱文字色',
      '- --orb-1 / --orb-2 / --orb-3  极光环境光球颜色',
      '',
      '## 转场动画参数（set_transition）',
      '- style: rose(玫瑰花瓣) / fireworks(烟花) / confetti(彩纸) / fade(淡入) / aura(光环) / lightfall(光瀑) / custom(自定义)',
      '- color_theme: rose / ocean / gold / aurora',
      '- particle_count: 粒子数量 (20-500)',
      '- duration: 转场时长 ms (1000-8000)',
      '',
      '## 自定义转场（create_transition）',
      '需提供 particle_class（粒子 CSS class 名）、css（含 @keyframes 的原始 CSS 文本）、',
      'vars（粒子变量模板：CSS 自定义属性名 → [min, max, unit]）。',
      '示例 vars: {"--tx": [-300, 300, "px"], "--ty": [-400, -100, "px"], "--delay": [0, 600, "ms"]}',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '操作类型',
          enum: ['create_theme', 'list_themes', 'apply_theme', 'delete_theme', 'set_transition', 'create_transition']
        },
        // ── create_theme ──
        theme_id: {
          type: 'string',
          description: '主题包 ID（仅字母数字下划线横线），如 "cyberpunk-night"'
        },
        theme_name: {
          type: 'string',
          description: '主题包显示名称，如 "赛博朋克之夜"'
        },
        light_vars: {
          type: 'object',
          description: '浅色模式 CSS 变量键值对，如 {"--theme-color": "#00f0ff", "--bg-base": "#0a0a1a"}',
          additionalProperties: { type: 'string' }
        },
        dark_vars: {
          type: 'object',
          description: '深色模式 CSS 变量键值对',
          additionalProperties: { type: 'string' }
        },
        theme_description: {
          type: 'string',
          description: '主题包描述（可选）'
        },
        // ── apply_theme / delete_theme ──
        pack_id: {
          type: 'string',
          description: '已有主题包 ID（apply_theme / delete_theme 时使用）'
        },
        // ── set_transition ──
        transition_style: {
          type: 'string',
          description: '转场样式',
          enum: ['rose', 'fireworks', 'confetti', 'fade', 'aura', 'lightfall', 'custom']
        },
        color_theme: {
          type: 'string',
          description: '转场配色主题',
          enum: ['rose', 'ocean', 'gold', 'aurora']
        },
        particle_count: {
          type: 'number',
          description: '粒子数量 (20-500)'
        },
        duration: {
          type: 'number',
          description: '转场时长 ms (1000-8000)'
        },
        // ── create_transition ──
        particle_class: {
          type: 'string',
          description: '自定义转场：粒子元素的 CSS class 名，如 "fire-particle"'
        },
        css: {
          type: 'string',
          description: '自定义转场：原始 CSS 文本，含 .particleClass 样式和 @keyframes 动画'
        },
        vars: {
          type: 'object',
          description: '自定义转场：粒子变量模板，CSS 自定义属性名 → [min, max, unit]',
          additionalProperties: { type: 'array', items: { type: 'number' } }
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
    const action = (toolCall.arguments.action as string) || ''
    onChunk?.({ toolStatus: 'calling', toolName: 'theme_design' })

    try {
      switch (action) {
        case 'create_theme':
          return await this.handleCreateTheme(toolCall)
        case 'list_themes':
          return await this.handleListThemes(toolCall)
        case 'apply_theme':
          return this.handleApplyTheme(toolCall)
        case 'delete_theme':
          return await this.handleDeleteTheme(toolCall)
        case 'set_transition':
          return this.handleSetTransition(toolCall)
        case 'create_transition':
          return this.handleCreateTransition(toolCall)
        default:
          return this.error(toolCall.id, `未知操作: ${action}。支持: create_theme / list_themes / apply_theme / delete_theme / set_transition / create_transition`)
      }
    } catch (e) {
      return this.error(toolCall.id, `执行失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ── 创建主题包 ──
  private async handleCreateTheme(toolCall: ToolCall): Promise<ToolResult> {
    const id = (toolCall.arguments.theme_id as string) || ''
    const name = (toolCall.arguments.theme_name as string) || ''
    const description = (toolCall.arguments.theme_description as string) || undefined
    const lightVars = (toolCall.arguments.light_vars as Record<string, string>) || undefined
    const darkVars = (toolCall.arguments.dark_vars as Record<string, string>) || undefined

    if (!id || !name) {
      return this.error(toolCall.id, 'create_theme 需要 theme_id 和 theme_name 参数')
    }
    if (!lightVars && !darkVars) {
      return this.error(toolCall.id, '至少需要 light_vars 或 dark_vars 中的一个')
    }

    const packJson = JSON.stringify({ id, name, description, light: lightVars, dark: darkVars })
    const pack = await importThemePack(packJson)

    return {
      toolCallId: toolCall.id,
      toolName: 'theme_design',
      content: `✅ 主题包「${pack.name}」(ID: ${pack.id}) 已创建并导入，已自动应用到设置。`,
      success: true,
      metadata: { settingsPatch: { activeThemePackId: pack.id } }
    }
  }

  // ── 列出主题包 ──
  private async handleListThemes(toolCall: ToolCall): Promise<ToolResult> {
    const packs = await listThemePacks()
    if (packs.length === 0) {
      return {
        toolCallId: toolCall.id,
        toolName: 'theme_design',
        content: '当前没有已导入的主题包。使用 `theme_design(action="create_theme", ...)` 创建一个。',
        success: true
      }
    }
    const lines = packs.map((p) => `- **${p.id}** — ${p.name}${p.description ? ` (${p.description})` : ''}`)
    return {
      toolCallId: toolCall.id,
      toolName: 'theme_design',
      content: `## 已导入的主题包（${packs.length} 个）\n\n${lines.join('\n')}\n\n---\n使用 \`theme_design(action="apply_theme", pack_id="ID")\` 应用主题。`,
      success: true,
      metadata: { packs: packs.map((p) => ({ id: p.id, name: p.name })) }
    }
  }

  // ── 应用主题包 ──
  private handleApplyTheme(toolCall: ToolCall): ToolResult {
    const packId = (toolCall.arguments.pack_id as string) || ''
    if (!packId) {
      return this.error(toolCall.id, 'apply_theme 需要 pack_id 参数')
    }
    return {
      toolCallId: toolCall.id,
      toolName: 'theme_design',
      content: `✅ 主题包「${packId}」已应用到设置。`,
      success: true,
      metadata: { settingsPatch: { activeThemePackId: packId } }
    }
  }

  // ── 删除主题包 ──
  private async handleDeleteTheme(toolCall: ToolCall): Promise<ToolResult> {
    const packId = (toolCall.arguments.pack_id as string) || ''
    if (!packId) {
      return this.error(toolCall.id, 'delete_theme 需要 pack_id 参数')
    }
    const ok = await deleteThemePack(packId)
    if (!ok) {
      return this.error(toolCall.id, `删除主题包「${packId}」失败：文件不存在或无法删除`)
    }
    return {
      toolCallId: toolCall.id,
      toolName: 'theme_design',
      content: `✅ 主题包「${packId}」已删除。`,
      success: true
    }
  }

  // ── 设置转场 ──
  private handleSetTransition(toolCall: ToolCall): ToolResult {
    const patch: Record<string, unknown> = {}

    const style = toolCall.arguments.transition_style as string | undefined
    const colorTheme = toolCall.arguments.color_theme as string | undefined
    const particleCount = toolCall.arguments.particle_count as number | undefined
    const duration = toolCall.arguments.duration as number | undefined

    if (style) patch.burstTransitionStyle = style
    if (colorTheme) patch.burstColorTheme = colorTheme
    if (particleCount !== undefined) {
      patch.burstParticleCount = Math.max(20, Math.min(500, Math.round(particleCount)))
    }
    if (duration !== undefined) {
      patch.burstDuration = Math.max(1000, Math.min(8000, Math.round(duration)))
    }

    if (Object.keys(patch).length === 0) {
      return this.error(toolCall.id, 'set_transition 至少需要 transition_style / color_theme / particle_count / duration 中的一个')
    }

    const summary = Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(', ')
    return {
      toolCallId: toolCall.id,
      toolName: 'theme_design',
      content: `✅ 转场设置已更新：${summary}`,
      success: true,
      metadata: { settingsPatch: patch }
    }
  }

  // ── 创建自定义转场动画 ──
  private handleCreateTransition(toolCall: ToolCall): ToolResult {
    const particleClass = (toolCall.arguments.particle_class as string) || ''
    const css = (toolCall.arguments.css as string) || ''
    const vars = (toolCall.arguments.vars as Record<string, [number, number, string]>) || undefined

    if (!particleClass || !css || !vars) {
      return this.error(toolCall.id, 'create_transition 需要 particle_class、css、vars 三个参数')
    }

    const animFile = {
      name: particleClass,
      version: 1 as const,
      particleClass,
      css,
      vars
    }

    return {
      toolCallId: toolCall.id,
      toolName: 'theme_design',
      content: `✅ 自定义转场动画「${particleClass}」已创建，已设置为自定义转场模式。`,
      success: true,
      metadata: {
        settingsPatch: {
          burstTransitionStyle: 'custom',
          customTransitionAnimation: JSON.stringify(animFile)
        }
      }
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'theme_design', content: '', success: false, error: msg }
  }
}
