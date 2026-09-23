// ====== UI 与模式配置类型 ======

import type { Mode } from './core'

// 各模式定义
export interface ModeConfig {
  id: Mode
  name: string
  icon: string
  description: string
  systemPrompt: string
  /** 快捷操作分组 — 组件必须消费此字段，禁止在组件内硬编码 prompt 数组 */
  actionGroups?: ActionGroup[]
  /** 该模式默认启用的工具名称列表 */
  tools?: string[]
}

export interface QuickAction {
  id: string
  label: string
  icon: string
  prompt: string
  /** 简短描述，显示在卡片中 */
  description?: string
}

/** 快捷操作分组 */
export interface ActionGroup {
  category: string
  icon: string
  actions: QuickAction[]
}

// 预设对话模板
export interface ConversationTemplate {
  id: string
  title: string
  mode: Mode
  description: string
  prompt: string
}

// 连接测试结果
export interface TestResult {
  success: boolean
  message: string
  latency?: number
  model?: string
}

// ====== 设计模式公共类型 ======

/** UI 组件元数据 — 镜像 catalog 中的结构 */
export interface ComponentMeta {
  id: string
  name: string
  nameCn: string
  category: string
  categoryCn: string
  dependencies: string[]
  props: string[]
  files: { jsx: string; css: string | null; assets: string[] | null }
}

/** 设计风格条目 */
export interface StyleEntry {
  id: string
  name: string
  category: string
  tokens: { accent: string; bg: string; fg: string; surface: string }
}

// ====== 文件树类型 ======

/** 文件树节点（主进程与渲染进程共享） */
export interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  children?: FileTreeNode[]
}
