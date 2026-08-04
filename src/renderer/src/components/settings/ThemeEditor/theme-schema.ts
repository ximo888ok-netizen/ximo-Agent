/**
 * 主题变量 Schema — 定义所有可编辑的 CSS 变量及其元数据
 *
 * 输入类型说明：
 * - color       → 纯色取色器（Hex）
 * - color-alpha → 取色器 + 透明度滑块（rgba）
 * - color-mix   → 跟随主题色开关 + 百分比滑块 + 混合目标选择
 * - shadow      → 多层阴影可视化编辑器
 * - easing      → 可视化缓动曲线选择器
 */

export type VarInputType = 'color' | 'color-alpha' | 'color-mix' | 'shadow' | 'easing'

export interface ThemeVarMeta {
  /** CSS 变量名，如 --theme-color */
  key: string
  /** 中文标签 */
  label: string
  /** 浅色模式默认值 */
  lightDefault: string
  /** 深色模式默认值 */
  darkDefault: string
  /** 输入类型 */
  type: VarInputType
  /** 简短说明 */
  desc?: string
}

export interface ThemeCategory {
  id: string
  label: string
  icon: string
  vars: ThemeVarMeta[]
}

/** 全部分类及其变量定义 */
export const THEME_SCHEMA: ThemeCategory[] = [
  {
    id: 'color',
    label: '主题色',
    icon: '🎨',
    vars: [
      { key: '--theme-color', label: '主题色', lightDefault: '#3b82f6', darkDefault: '#3b82f6', type: 'color', desc: '核心色，所有强调色的源头' },
      { key: '--theme-accent-hover', label: '悬停强调色', lightDefault: 'color-mix(in srgb, var(--theme-color) 85%, black)', darkDefault: 'color-mix(in srgb, var(--theme-color) 88%, white)', type: 'color-mix', desc: '鼠标悬停时的强调色' },
      { key: '--theme-accent-muted', label: '弱化强调色', lightDefault: 'color-mix(in srgb, var(--theme-color) 70%, white)', darkDefault: 'color-mix(in srgb, var(--theme-color) 70%, black)', type: 'color-mix', desc: '弱化态的强调色' },
      { key: '--accent-light', label: '亮色强调', lightDefault: 'color-mix(in srgb, var(--theme-color) 70%, white)', darkDefault: '#60a5fa', type: 'color-mix', desc: '亮色态强调色' },
    ],
  },
  {
    id: 'bg',
    label: '背景层级',
    icon: '🏠',
    vars: [
      { key: '--bg-base', label: '基础背景', lightDefault: '#eef0f4', darkDefault: '#090b10', type: 'color', desc: '窗口最底层背景' },
      { key: '--bg-surface', label: '表面背景', lightDefault: '#ffffff', darkDefault: 'rgba(22, 25, 33, 0.66)', type: 'color-alpha', desc: '卡片/面板表面' },
      { key: '--bg-elevated', label: '升起面板', lightDefault: '#ffffff', darkDefault: 'rgba(30, 34, 44, 0.85)', type: 'color-alpha', desc: '弹窗、下拉等升起面板' },
      { key: '--bg-hover', label: '悬停背景', lightDefault: 'rgba(20, 30, 50, 0.06)', darkDefault: 'rgba(255, 255, 255, 0.06)', type: 'color-alpha', desc: '鼠标悬停时的背景' },
      { key: '--bg-input', label: '输入框背景', lightDefault: '#ffffff', darkDefault: '#12151c', type: 'color', desc: '输入框背景色' },
    ],
  },
  {
    id: 'glass',
    label: '玻璃材质',
    icon: '🪟',
    vars: [
      { key: '--glass-bg', label: '玻璃底色', lightDefault: '#ffffff', darkDefault: 'rgba(24, 28, 38, 0.58)', type: 'color-alpha', desc: '玻璃面板底色' },
      { key: '--glass-bg-strong', label: '强玻璃底色', lightDefault: '#ffffff', darkDefault: 'rgba(28, 32, 43, 0.82)', type: 'color-alpha', desc: '侧栏、模态等强玻璃' },
      { key: '--glass-border', label: '玻璃边框', lightDefault: 'rgba(20, 30, 50, 0.08)', darkDefault: 'rgba(255, 255, 255, 0.09)', type: 'color-alpha', desc: '玻璃面板边框' },
      { key: '--glass-highlight', label: '顶部高光', lightDefault: 'rgba(255, 255, 255, 0.5)', darkDefault: 'rgba(255, 255, 255, 0.12)', type: 'color-alpha', desc: '玻璃顶部高光' },
      { key: '--glass-shadow', label: '玻璃阴影', lightDefault: '0 8px 32px rgba(31, 45, 74, 0.12), 0 1.5px 6px rgba(31, 45, 74, 0.08)', darkDefault: '0 12px 40px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.3)', type: 'shadow', desc: '玻璃投影' },
    ],
  },
  {
    id: 'border',
    label: '边框与发光',
    icon: '✏️',
    vars: [
      { key: '--border-DEFAULT', label: '默认边框', lightDefault: 'rgba(20, 30, 50, 0.1)', darkDefault: 'rgba(255, 255, 255, 0.1)', type: 'color-alpha', desc: '默认边框色' },
      { key: '--border-subtle', label: '细微分割线', lightDefault: 'rgba(20, 30, 50, 0.06)', darkDefault: 'rgba(255, 255, 255, 0.06)', type: 'color-alpha', desc: '细微分割线' },
      { key: '--border-hover', label: '悬停边框', lightDefault: 'rgba(20, 30, 50, 0.18)', darkDefault: 'rgba(255, 255, 255, 0.2)', type: 'color-alpha', desc: '悬停态边框' },
      { key: '--glow-color', label: '发光色', lightDefault: 'color-mix(in srgb, var(--theme-color) 38%, transparent)', darkDefault: 'color-mix(in srgb, var(--theme-color) 55%, transparent)', type: 'color-mix', desc: '按钮发光、聚焦光晕' },
    ],
  },
  {
    id: 'text',
    label: '文字',
    icon: '📝',
    vars: [
      { key: '--text-primary', label: '主文字', lightDefault: '#141c2b', darkDefault: '#f2f4f8', type: 'color', desc: '标题、正文' },
      { key: '--text-secondary', label: '次要文字', lightDefault: '#5a6472', darkDefault: '#a3aab8', type: 'color', desc: '描述文字' },
      { key: '--text-muted', label: '弱化文字', lightDefault: '#9aa3af', darkDefault: '#646b78', type: 'color', desc: '占位、提示文字' },
    ],
  },
  {
    id: 'aurora',
    label: '极光环境光',
    icon: '🌌',
    vars: [
      { key: '--orb-1', label: '极光球 1', lightDefault: 'color-mix(in srgb, var(--theme-color) 34%, transparent)', darkDefault: 'color-mix(in srgb, var(--theme-color) 30%, transparent)', type: 'color-mix', desc: '跟随主题色的极光球' },
      { key: '--orb-2', label: '极光球 2', lightDefault: 'rgba(56, 189, 248, 0.26)', darkDefault: 'rgba(34, 211, 238, 0.13)', type: 'color-alpha', desc: '青色极光球' },
      { key: '--orb-3', label: '极光球 3', lightDefault: 'rgba(168, 130, 255, 0.22)', darkDefault: 'rgba(147, 96, 255, 0.16)', type: 'color-alpha', desc: '紫色极光球' },
    ],
  },
  {
    id: 'easing',
    label: '动效缓动',
    icon: '⚡',
    vars: [
      { key: '--ease-ios', label: 'iOS 缓动', lightDefault: 'cubic-bezier(0.32, 0.72, 0, 1)', darkDefault: 'cubic-bezier(0.32, 0.72, 0, 1)', type: 'easing', desc: 'iOS 标准缓动曲线' },
      { key: '--ease-out-expo', label: 'Expo 缓动', lightDefault: 'cubic-bezier(0.16, 1, 0.3, 1)', darkDefault: 'cubic-bezier(0.16, 1, 0.3, 1)', type: 'easing', desc: 'Expo 缓出曲线' },
      { key: '--ease-out-quart', label: 'Quart 缓动', lightDefault: 'cubic-bezier(0.25, 1, 0.5, 1)', darkDefault: 'cubic-bezier(0.25, 1, 0.5, 1)', type: 'easing', desc: 'Quart 缓出曲线' },
    ],
  },
]

/** 扁平化的全部变量列表 */
export const ALL_THEME_VARS: ThemeVarMeta[] = THEME_SCHEMA.flatMap((c) => c.vars)

/** 变量键名 → 默认值映射（浅色） */
export const LIGHT_DEFAULTS: Record<string, string> = Object.fromEntries(
  ALL_THEME_VARS.map((v) => [v.key, v.lightDefault]),
)

/** 变量键名 → 默认值映射（深色） */
export const DARK_DEFAULTS: Record<string, string> = Object.fromEntries(
  ALL_THEME_VARS.map((v) => [v.key, v.darkDefault]),
)

/** 获取指定模式的默认值 */
export function getDefaultVars(mode: 'light' | 'dark'): Record<string, string> {
  return mode === 'light' ? LIGHT_DEFAULTS : DARK_DEFAULTS
}
