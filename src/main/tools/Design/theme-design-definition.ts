import type { ToolDefinition } from '@shared/types'

/** theme_design 工具定义 */
export const THEME_DESIGN_DEFINITION: ToolDefinition = {
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
