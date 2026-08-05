// ====== 工具系统类型 ======

import type { ReasoningEffort, Mode } from './core'

/** JSON Schema 属性定义 */
export interface ToolParamProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description?: string
  enum?: (string | number)[]
  default?: unknown
  items?: ToolParamProperty
  properties?: Record<string, ToolParamProperty>
  required?: string[]
  /** JSON Schema 标准字段：object 类型的任意键值约束 */
  additionalProperties?: ToolParamProperty
}

/** 工具定义 — 注册时使用 */
export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, ToolParamProperty>
    required?: string[]
  }
}

/** LLM 返回的工具调用请求 */
export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

/** 工具执行结果 */
export interface ToolResult {
  toolCallId: string
  toolName: string
  content: string
  success: boolean
  error?: string
  /** 是否需要在 UI 中特殊渲染（如 UI 代码预览） */
  displayType?: 'text' | 'code' | 'html' | 'search-results'
  metadata?: Record<string, unknown>
  /** 是否需要用户确认后执行 */
  requiresConfirmation?: boolean
  /** 确认提示信息 */
  confirmationMessage?: string
  /** 截图 base64（用于预览） */
  screenshot?: string
}

/** 权限级别：0=只读, 1=可逆写, 2=不可逆操作, 3=系统级 */
export type PermissionLevel = 0 | 1 | 2 | 3

/** 工具执行上下文 — 传递 API 配置给需要发起子调用的工具 */
export interface ToolContext {
  apiKey: string
  baseUrl: string
  model: string
  reasoningEffort: ReasoningEffort
  /** 子 Agent 模型 */
  subAgentModel?: string
  /** 子 Agent 最大 token */
  subAgentMaxTokens?: number
  /** 子 Agent 温度 */
  subAgentTemperature?: number
  /** 子 Agent 超时秒数 */
  subAgentTimeout?: number
  /** 子 Agent 思考强度 */
  subAgentReasoningEffort?: ReasoningEffort
  /** 终端命令默认超时（秒） */
  terminalTimeout?: number
  /** 代码执行默认超时（秒） */
  codeExecTimeout?: number
  /** 终端输出截断长度 */
  terminalOutputLimit?: number
  /** 浏览器无头模式 */
  browserHeadless?: boolean
  /** 浏览器空闲超时（分钟） */
  browserIdleTimeout?: number
  /** 浏览器视口宽度 */
  browserViewportWidth?: number
  /** 浏览器视口高度 */
  browserViewportHeight?: number
  /** 默认搜索引擎 */
  defaultSearchEngine?: string
  /** 搜索结果默认数量 */
  searchResultsCount?: number
  /** 网页抓取内容上限 */
  webFetchMaxLength?: number
  /** 网页缓存开关 */
  webCacheEnabled?: boolean
  /** 网页缓存最大大小（MB） */
  webCacheMaxSizeMB?: number
  /** pi-computer-use Helper 命令超时（秒） */
  helperCommandTimeout?: number
  /** MCP 服务器连接超时（秒） */
  mcpConnectTimeout?: number

  // ---- 视觉模型（Agnes 2.5 Flash）----
  /** 视觉模型 API Key */
  visionApiKey?: string
  /** 视觉模型 Base URL */
  visionBaseUrl?: string
  /** 视觉模型名称 */
  visionModel?: string

  // ---- 模式 ----
  /** 当前会话模式 — 记忆工具用于定位对应模式的记忆文件 */
  mode?: Mode

  /** 请求用户输入（弹窗）— Plan 提问和 Spec 审核使用 */
  requestUserInput?: (type: 'ask' | 'review', title: string, content: string) => Promise<{ confirmed: boolean; response?: string }>
}
