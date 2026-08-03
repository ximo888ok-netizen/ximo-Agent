/**
 * 权限系统 — 参考 Reasonix 的 permission 包
 *
 * 将静态 SENSITIVE_TOOLS 集合替换为基于规则的 allow/ask/deny 引擎。
 * 规则按工具名 + 可选 subject 匹配，决策优先级：deny > ask > allow。
 */

export type Decision = 'allow' | 'ask' | 'deny'

export interface PermissionRule {
  /** 工具名称 */
  tool: string
  /** 可选 subject 模式（如命令文本），空表示匹配该工具的所有调用 */
  subject?: string
  /** 是否按字面匹配 subject（false=glob 通配） */
  literal?: boolean
}

export interface PermissionConfig {
  /** 允许列表（无需确认直接执行） */
  allow: PermissionRule[]
  /** 询问列表（需要用户确认） */
  ask: PermissionRule[]
  /** 拒绝列表（禁止执行） */
  deny: PermissionRule[]
  /** 默认决策：未匹配任何规则时的回退决策（默认 'ask'） */
  defaultDecision?: Decision
}

/** YOLO 模式下所有工具都 allow */
export const YOLO_CONFIG: PermissionConfig = {
  allow: [],
  ask: [],
  deny: [],
  defaultDecision: 'allow'
}

/** 编程模式默认权限配置 */
export const CODING_DEFAULT_CONFIG: PermissionConfig = {
  allow: [
    // 只读工具 — 始终允许
    { tool: 'file_read' },
    { tool: 'file_list' },
    { tool: 'file_search' },
    { tool: 'project_context' },
    { tool: 'project_index' },
    { tool: 'code_lint' },
    { tool: 'code_format' },
    { tool: 'dependency_check' },
    { tool: 'web_search' },
    { tool: 'web_fetch' },
    { tool: 'todo_write' },
    { tool: 'create_tool' },
    { tool: 'knowledge' },
    // 编程基础写操作 — 直接执行（有 checkpoint 回退保障）
    { tool: 'file_write' },
    { tool: 'file_edit' },
    { tool: 'multi_edit' },
    { tool: 'move_file' },
  ],
  ask: [
    // 需要确认的操作
    { tool: 'terminal_exec' },
    { tool: 'git_operations' },
    { tool: 'code_execute' },
    { tool: 'file_delete' },
  ],
  deny: [
    // 禁止的操作（编程模式不需要）
    { tool: 'act_ui' },
    { tool: 'network_replay' },
    { tool: 'browser_execute_js' },
  ]
}

/**
 * Safe 模式权限配置 — 读操作和常规写操作自动执行，仅拦截系统级危险操作
 * 用于 autoModeLevel === 'safe'：
 *   - allow（defaultDecision）：大部分工具自动执行
 *   - ask：不可逆操作（file_delete）需用户确认
 *   - deny：系统级危险操作禁止执行
 */
export const SAFE_CONFIG: PermissionConfig = {
  allow: [],
  ask: [
    { tool: 'file_delete' },
  ],
  deny: [
    { tool: 'act_ui' },
    { tool: 'network_replay' },
    { tool: 'browser_execute_js' },
  ],
  defaultDecision: 'allow'
}

/** 办公模式默认权限配置 */
export const OFFICE_DEFAULT_CONFIG: PermissionConfig = {
  allow: [
    { tool: 'web_search' },
    { tool: 'web_fetch' },
    { tool: 'web_cache' },
    { tool: 'web_research' },
    { tool: 'file_read' },
    { tool: 'file_list' },
    { tool: 'file_search' },
    { tool: 'todo_write' },
    { tool: 'create_tool' },
    { tool: 'knowledge' },
    { tool: 'theme_design' },
  ],
  ask: [
    { tool: 'terminal_exec' },
    { tool: 'git_operations' },
    { tool: 'file_write' },
    { tool: 'file_edit' },
    { tool: 'multi_edit' },
    { tool: 'file_delete' },
    { tool: 'move_file' },
    { tool: 'act_ui' },
    { tool: 'code_execute' },
    { tool: 'code_format' },
    { tool: 'dependency_check' },
    { tool: 'browser_execute_js' },
    { tool: 'network_replay' },
  ],
  deny: []
}

/**
 * glob 匹配 — 简化版：支持 * 通配符
 */
function matchGlob(pattern: string, text: string): boolean {
  if (!pattern) return true
  // 将 glob 转为正则
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${regexStr}$`, 'i').test(text)
}

/**
 * 匹配单条规则
 */
function matchRule(rule: PermissionRule, toolName: string, subject: string): boolean {
  if (rule.tool !== toolName) return false
  if (!rule.subject) return true
  if (rule.literal) {
    return rule.subject === subject
  }
  return matchGlob(rule.subject, subject)
}

/**
 * 在规则列表中查找匹配
 */
function findMatch(rules: PermissionRule[], toolName: string, subject: string): boolean {
  return rules.some(r => matchRule(r, toolName, subject))
}

/**
 * Evaluate — 评估工具调用的权限决策
 * 优先级：deny > ask > allow > 默认 ask
 */
export function evaluate(
  config: PermissionConfig,
  toolName: string,
  subject: string
): Decision {
  // deny 优先级最高
  if (findMatch(config.deny, toolName, subject)) {
    return 'deny'
  }
  // ask 次之
  if (findMatch(config.ask, toolName, subject)) {
    return 'ask'
  }
  // allow
  if (findMatch(config.allow, toolName, subject)) {
    return 'allow'
  }
  // 默认：根据配置的 defaultDecision 回退（未配置则保守询问）
  return config.defaultDecision ?? 'ask'
}

/**
 * 从工具调用参数中提取 subject（用于更细粒度的权限匹配）
 * 例如 terminal_exec 的 subject 是命令文本
 */
export function extractSubject(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'terminal_exec':
      return (args.command as string) || ''
    case 'git_operations':
      return (args.action as string) || ''
    case 'file_delete':
      return (args.filePath as string) || ''
    default:
      return ''
  }
}

/**
 * 根据模式获取默认权限配置
 */
export function getConfigForMode(mode: string): PermissionConfig {
  switch (mode) {
    case 'coding':
      return CODING_DEFAULT_CONFIG
    case 'office':
      return OFFICE_DEFAULT_CONFIG
    case 'design':
      return OFFICE_DEFAULT_CONFIG // 设计模式与办公模式共用
    default:
      return CODING_DEFAULT_CONFIG
  }
}
