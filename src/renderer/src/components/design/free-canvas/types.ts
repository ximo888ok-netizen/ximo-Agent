import type { StyleEntry, ComponentMeta } from '@shared/types'
export type { StyleEntry, ComponentMeta }

export interface LayoutItem {
  componentId: string
  x: number
  y: number
  w: number
  h: number
  label: string
}

export interface LayoutTemplate {
  id: string
  name: string
  desc: string
  blocks: string[]
  items: LayoutItem[]
}

export interface ScenarioEntry {
  id: string
  name: string
  icon: string
  layouts: LayoutTemplate[]
}
