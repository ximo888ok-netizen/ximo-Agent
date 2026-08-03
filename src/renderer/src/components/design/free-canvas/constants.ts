import { Globe, Smartphone, Monitor, Layout } from 'lucide-react'
import designSystemsCatalog from '@renderer/components/design/design-systems-catalog.json'
import uiComponentsCatalog from '@renderer/components/design/ui-components-catalog.json'
import scenarioLayoutsData from '@renderer/components/design/scenario-layouts.json'
import type { StyleEntry, ComponentMeta, ScenarioEntry } from './types'

export const STYLES = designSystemsCatalog as StyleEntry[]
export const COMPONENTS = (uiComponentsCatalog as { components: ComponentMeta[] }).components
export const SCENARIOS = (scenarioLayoutsData as { scenarios: ScenarioEntry[] }).scenarios

// 场景图标映射
export const SCENARIO_ICONS: Record<string, typeof Globe> = {
  Globe, Smartphone, Monitor, Layout,
}

// 默认放置尺寸
export const DEFAULT_W = 200
export const DEFAULT_H = 72

// 分类颜色映射
export const CAT_COLORS: Record<string, string> = {
  'Components': '#3b82f6',
  'Animations': '#8b5cf6',
  'Backgrounds': '#06b6d4',
  'TextAnimations': '#f59e0b',
}

// 布局 block 的迷你色块表示
export const BLOCK_COLORS: Record<string, string> = {
  hero: '#6366f1', split: '#6366f1', nav: '#3b82f6', header: '#3b82f6',
  banner: '#8b5cf6', toolbar: '#3b82f6', sidebar: '#06b6d4',
  row3: '#10b981', bento: '#10b981', grid4: '#10b981', grid: '#10b981',
  stats: '#f59e0b', kpi3: '#f59e0b', chart: '#f59e0b', list: '#ec4899',
  cards: '#ec4899', masonry: '#ec4899', profile: '#f97316', stack: '#f97316',
  cta: '#ef4444', action: '#ef4444', tabbar: '#64748b', menu: '#64748b',
  filter: '#14b8a6', search: '#14b8a6', pricing: '#a855f7', tree: '#06b6d4',
  editor: '#10b981', detail: '#f97316', col3: '#10b981', circular: '#8b5cf6',
  chroma: '#06b6d4', posters: '#ec4899', info: '#3b82f6', stepper: '#f59e0b',
  icons: '#10b981',
}
