/**
 * 主题变量 Schema — 定义所有可编辑的 CSS 变量及其元数据
 *
 * 输入类型说明：
 * - color       → 纯色取色器（Hex）— 已废弃，统一使用 color-alpha
 * - color-alpha → 取色器 + 透明度滑块（rgba）— 支持透明
 * - color-mix   → 跟随主题色开关 + 百分比滑块 + 混合目标选择
 * - shadow      → 多层阴影可视化编辑器
 * - easing      → 可视化缓动曲线选择器
 * - dimension   → 数值 + 单位滑块（px / deg / 无单位）
 * - select      → 选项按钮组
 */

export type VarInputType = 'color' | 'color-alpha' | 'color-mix' | 'shadow' | 'easing' | 'dimension' | 'select'

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
  /** dimension 类型：单位（px / deg / ''） */
  unit?: string
  /** dimension 类型：最小值 */
  min?: number
  /** dimension 类型：最大值 */
  max?: number
  /** dimension 类型：步进 */
  step?: number
  /** select 类型：可选项 */
  options?: string[]
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
      { key: '--theme-color', label: '主题色', lightDefault: '#3b82f6', darkDefault: '#3b82f6', type: 'color-alpha', desc: '核心色，所有强调色的源头' },
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
      { key: '--bg-base', label: '基础背景', lightDefault: '#eef0f4', darkDefault: '#090b10', type: 'color-alpha', desc: '窗口最底层背景' },
      { key: '--bg-surface', label: '表面背景', lightDefault: '#ffffff', darkDefault: 'rgba(22, 25, 33, 0.66)', type: 'color-alpha', desc: '卡片/面板表面' },
      { key: '--bg-elevated', label: '升起面板', lightDefault: '#ffffff', darkDefault: 'rgba(30, 34, 44, 0.85)', type: 'color-alpha', desc: '弹窗、下拉等升起面板' },
      { key: '--bg-hover', label: '悬停背景', lightDefault: 'rgba(20, 30, 50, 0.06)', darkDefault: 'rgba(255, 255, 255, 0.06)', type: 'color-alpha', desc: '鼠标悬停时的背景' },
      { key: '--bg-input', label: '输入框背景', lightDefault: '#ffffff', darkDefault: '#12151c', type: 'color-alpha', desc: '输入框背景色' },
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
      { key: '--text-primary', label: '主文字', lightDefault: '#141c2b', darkDefault: '#f2f4f8', type: 'color-alpha', desc: '标题、正文' },
      { key: '--text-secondary', label: '次要文字', lightDefault: '#5a6472', darkDefault: '#a3aab8', type: 'color-alpha', desc: '描述文字' },
      { key: '--text-muted', label: '弱化文字', lightDefault: '#9aa3af', darkDefault: '#646b78', type: 'color-alpha', desc: '占位、提示文字' },
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
  {
    id: 'transform-3d',
    label: '3D 变换',
    icon: '🧊',
    vars: [
      { key: '--perspective', label: '透视距离', lightDefault: '1000px', darkDefault: '1000px', type: 'dimension', unit: 'px', min: 200, max: 3000, step: 50, desc: '观察者到 Z=0 平面的距离，值越小透视越强' },
      { key: '--perspective-origin', label: '透视原点', lightDefault: 'center', darkDefault: 'center', type: 'select', options: ['center', 'top', 'bottom', 'left', 'right', 'top left', 'top right', 'bottom left', 'bottom right'], desc: '透视消失点位置' },
      { key: '--transform-style', label: '变换风格', lightDefault: 'preserve-3d', darkDefault: 'preserve-3d', type: 'select', options: ['flat', 'preserve-3d'], desc: '子元素是否在 3D 空间中渲染' },
      { key: '--backface-visibility', label: '背面可见性', lightDefault: 'hidden', darkDefault: 'hidden', type: 'select', options: ['visible', 'hidden'], desc: '元素旋转后背面是否可见' },
      { key: '--rotate-x', label: 'X 轴旋转', lightDefault: '0deg', darkDefault: '0deg', type: 'dimension', unit: 'deg', min: -180, max: 180, step: 1, desc: '绕 X 轴旋转角度（正值向用户倾倒）' },
      { key: '--rotate-y', label: 'Y 轴旋转', lightDefault: '0deg', darkDefault: '0deg', type: 'dimension', unit: 'deg', min: -180, max: 180, step: 1, desc: '绕 Y 轴旋转角度（正值向右翻转）' },
      { key: '--rotate-z', label: 'Z 轴旋转', lightDefault: '0deg', darkDefault: '0deg', type: 'dimension', unit: 'deg', min: -180, max: 180, step: 1, desc: '绕 Z 轴旋转角度（平面旋转）' },
      { key: '--translate-z', label: 'Z 轴位移', lightDefault: '0px', darkDefault: '0px', type: 'dimension', unit: 'px', min: -500, max: 500, step: 5, desc: '沿 Z 轴位移，正值靠近观察者' },
      { key: '--card-tilt-x', label: '卡片倾斜 X', lightDefault: '2deg', darkDefault: '2deg', type: 'dimension', unit: 'deg', min: -30, max: 30, step: 0.5, desc: '卡片悬停时 X 轴倾斜角度' },
      { key: '--card-tilt-y', label: '卡片倾斜 Y', lightDefault: '-2deg', darkDefault: '-2deg', type: 'dimension', unit: 'deg', min: -30, max: 30, step: 0.5, desc: '卡片悬停时 Y 轴倾斜角度' },
      { key: '--depth-shadow', label: '3D 深度阴影', lightDefault: '0 4px 8px rgba(31, 45, 74, 0.12), 0 8px 16px rgba(31, 45, 74, 0.08)', darkDefault: '0 4px 8px rgba(0, 0, 0, 0.3), 0 8px 16px rgba(0, 0, 0, 0.2)', type: 'shadow', desc: '3D 层级投影，模拟物体浮起' },
    ],
  },
  {
    id: 'light-3d',
    label: '3D 光照',
    icon: '💡',
    vars: [
      { key: '--light-color', label: '光照颜色', lightDefault: 'rgba(255, 255, 255, 0.15)', darkDefault: 'rgba(255, 255, 255, 0.08)', type: 'color-alpha', desc: '3D 表面高光颜色' },
      { key: '--light-angle', label: '光照角度', lightDefault: '135deg', darkDefault: '135deg', type: 'dimension', unit: 'deg', min: 0, max: 360, step: 5, desc: '光源照射方向（0°=右，90°=下，180°=左，270°=上）' },
      { key: '--light-intensity', label: '光照强度', lightDefault: '0.15', darkDefault: '0.08', type: 'dimension', unit: '', min: 0, max: 1, step: 0.01, desc: '高光最大强度系数' },
      { key: '--ambient-light', label: '环境光', lightDefault: 'rgba(255, 255, 255, 0.05)', darkDefault: 'rgba(255, 255, 255, 0.02)', type: 'color-alpha', desc: '环境填充光颜色' },
      { key: '--edge-highlight', label: '边缘高光', lightDefault: 'rgba(255, 255, 255, 0.3)', darkDefault: 'rgba(255, 255, 255, 0.1)', type: 'color-alpha', desc: '3D 边缘高光色' },
      { key: '--edge-highlight-size', label: '边缘高光宽度', lightDefault: '1px', darkDefault: '1px', type: 'dimension', unit: 'px', min: 0, max: 5, step: 0.5, desc: '边缘高光线条宽度' },
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
