/**
 * 内置主题预设模板 — 8 个精选配色方案
 *
 * 每个预设只覆盖关键变量（主题色 + 背景层 + 文字），
 * 未覆盖的变量保持默认值。light/dark 各一份。
 */

export interface ThemePreset {
  id: string
  name: string
  desc: string
  light: Record<string, string>
  dark: Record<string, string>
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'midnight-aurora',
    name: '午夜极光',
    desc: '深空墨蓝 + 紫色极光',
    light: {
      '--theme-color': '#6366f1',
      '--bg-base': '#eef0f6',
      '--text-primary': '#1a1a2e',
      '--text-secondary': '#555870',
      '--text-muted': '#9498ad',
    },
    dark: {
      '--theme-color': '#818cf8',
      '--bg-base': '#0a0a18',
      '--text-primary': '#e8e8f0',
      '--text-secondary': '#a0a3b8',
      '--text-muted': '#5a5d70',
    },
  },
  {
    id: 'ocean-breeze',
    name: '深海蓝调',
    desc: '清冷海蓝 + 半透明玻璃',
    light: {
      '--theme-color': '#0ea5e9',
      '--bg-base': '#e8f4f8',
      '--text-primary': '#0c2340',
      '--text-secondary': '#46688a',
      '--text-muted': '#8aa5be',
    },
    dark: {
      '--theme-color': '#38bdf8',
      '--bg-base': '#04101e',
      '--text-primary': '#d0e8f5',
      '--text-secondary': '#7ba5c4',
      '--text-muted': '#4a6b85',
    },
  },
  {
    id: 'forest-mist',
    name: '森林晨雾',
    desc: '墨绿 + 自然色调',
    light: {
      '--theme-color': '#059669',
      '--bg-base': '#edf5f0',
      '--text-primary': '#14241b',
      '--text-secondary': '#4a6655',
      '--text-muted': '#8aa598',
    },
    dark: {
      '--theme-color': '#34d399',
      '--bg-base': '#070d0a',
      '--text-primary': '#d8f0e4',
      '--text-secondary': '#7ba890',
      '--text-muted': '#4a6b5a',
    },
  },
  {
    id: 'sunset-glow',
    name: '日落晚霞',
    desc: '暖橙 + 玫瑰金',
    light: {
      '--theme-color': '#f97316',
      '--bg-base': '#fdf3e8',
      '--text-primary': '#2e1a0c',
      '--text-secondary': '#70502a',
      '--text-muted': '#b08868',
    },
    dark: {
      '--theme-color': '#fb923c',
      '--bg-base': '#120804',
      '--text-primary': '#fce8d0',
      '--text-secondary': '#c49878',
      '--text-muted': '#7a5a40',
    },
  },
  {
    id: 'cyberpunk-neon',
    name: '赛博朋克',
    desc: '霓虹粉紫 + 纯黑暗色',
    light: {
      '--theme-color': '#d946ef',
      '--bg-base': '#f0e8f8',
      '--text-primary': '#1a0a2e',
      '--text-secondary': '#503a70',
      '--text-muted': '#9080b0',
    },
    dark: {
      '--theme-color': '#e879f9',
      '--bg-base': '#08020e',
      '--text-primary': '#e8d0f8',
      '--text-secondary': '#a878c4',
      '--text-muted': '#5a3a7a',
    },
  },
  {
    id: 'rose-quartz',
    name: '玫瑰石英',
    desc: '玫瑰粉 + 柔和灰白',
    light: {
      '--theme-color': '#e11d48',
      '--bg-base': '#fce8ec',
      '--text-primary': '#2e0a14',
      '--text-secondary': '#70304a',
      '--text-muted': '#b06878',
    },
    dark: {
      '--theme-color': '#fb7185',
      '--bg-base': '#0e0408',
      '--text-primary': '#f8d0d8',
      '--text-secondary': '#c47088',
      '--text-muted': '#7a4050',
    },
  },
  {
    id: 'monochrome-pro',
    name: '极简黑白',
    desc: '纯灰阶 + 无彩色',
    light: {
      '--theme-color': '#3f3f46',
      '--bg-base': '#f4f4f5',
      '--text-primary': '#18181b',
      '--text-secondary': '#52525b',
      '--text-muted': '#a1a1aa',
    },
    dark: {
      '--theme-color': '#d4d4d8',
      '--bg-base': '#0a0a0b',
      '--text-primary': '#f4f4f5',
      '--text-secondary': '#a1a1aa',
      '--text-muted': '#52525b',
    },
  },
  {
    id: 'amber-gold',
    name: '琥珀金',
    desc: '金色 + 暖棕底色',
    light: {
      '--theme-color': '#d97706',
      '--bg-base': '#faf5ea',
      '--text-primary': '#2e1e08',
      '--text-secondary': '#6b5028',
      '--text-muted': '#a88858',
    },
    dark: {
      '--theme-color': '#f59e0b',
      '--bg-base': '#0c0804',
      '--text-primary': '#f5e5c8',
      '--text-secondary': '#b89868',
      '--text-muted': '#705838',
    },
  },
]
