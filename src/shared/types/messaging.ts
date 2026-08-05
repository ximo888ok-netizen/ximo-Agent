// ====== 消息与会话类型 ======

import type { Mode, ModelId, ReasoningEffort } from './core'
import type { ToolCall, ToolResult, ToolDefinition } from './tools'
import type { CacheDiagnostics } from '../cache/types'

/** 流式输出的单个工作步骤（对应 Agent Loop 的一轮） */
export interface StreamingSegment {
  reasoning: string
  content: string
  toolCalls: { name: string; status: 'thinking' | 'calling' | 'done'; args?: string; result?: string; toolCallId?: string }[]
  /** 子 Agent 工作过程事件（专家团编排时实时追加，按时间顺序） */
  expertEvents?: {
    expertId: string
    expertName: string
    stage: 'started' | 'tool' | 'toolResult' | 'message' | 'finished'
    taskSummary?: string
    detail?: string
    toolArgs?: string
    result?: string
  }[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  reasoningContent?: string
  model?: ModelId
  tokens?: number
  /** 缓存命中 token 数（来自 API prompt_tokens_details.cached_tokens） */
  cacheHitTokens?: number
  timestamp: number
  /** 工具调用记录（assistant 消息可能包含） */
  toolCalls?: ToolCall[]
  /** 工具执行结果（针对 tool 角色的消息） */
  toolResults?: ToolResult[]
  /** 多轮工作步骤（按时间顺序展示思考链、正文和工具调用，仅多轮 Agent Loop 时存在） */
  segments?: StreamingSegment[]
  /** 斜杠命令元数据 — 用于在 UI 中显示胶囊而非完整提示词，systemHint 在 buildApiMessages 时拼接到 content 前面 */
  slashCommand?: { cmd: string; systemHint: string }
}

export interface Conversation {
  id: string
  title: string
  mode: Mode
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
  /** 绑定的项目目录路径（coding 模式专用） */
  projectPath?: string
  /** 会话累计总 token 消耗 */
  totalTokens?: number
  /** 会话累计 prompt token 数（用于计算缓存命中率） */
  promptTokens?: number
  /** 会话累计缓存命中 token — 不随压缩重置（D1） */
  cacheHitTokens?: number
  /** 会话累计缓存未命中 token — 不随压缩重置（D1） */
  cacheMissTokens?: number
  /** 上下文窗口 token 累计 — 每轮 API 调用的 total_tokens 累加值 */
  contextTokens?: number
}

export interface ApiMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
  /** A2 reasoning_content 空 key — DeepSeek thinking 模式下 tool_calls turn 必须带此 key。
   *  与主进程 agent-loop（tool-execution.ts）保持一致，避免重建消息时前缀字节漂移导致缓存全部 miss */
  reasoning_content?: string
}

// 发起聊天请求的参数
export interface ChatRequest {
  mode: Mode
  messages: ApiMessage[]
  model: ModelId
  thinkingMode: boolean
  reasoningEffort: ReasoningEffort
  temperature: number
  maxTokens: number
  /** 可用工具列表 */
  tools?: ToolDefinition[]
  /** 会话 ID（用于 Checkpoint 系统，可选） */
  sessionId?: string
  /** Auto Mode 等级：off=手动确认, safe=读操作自动, yolo=全部自动 */
  autoModeLevel?: 'off' | 'safe' | 'yolo'
  /** 服务商 ID：'deepseek'=内置，其余对应 settings.providers 中的自定义服务商（缺省 deepseek） */
  providerId?: string
}

// 流式传输的数据块
export interface StreamChunk {
  content?: string
  reasoningContent?: string
  done?: boolean
  error?: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    promptCacheHitTokens?: number
    /** D3 normaliseUsage — 缓存未命中 token（派生或直报） */
    promptCacheMissTokens?: number
  }
  /** D2 PrefixShape 哈希诊断 — cache miss 原因归因 */
  cacheDiagnostics?: CacheDiagnostics
  /** 工具调用阶段：LLM 请求调用某个工具 */
  toolCall?: ToolCall
  /** 工具执行阶段：工具执行完毕返回结果 */
  toolResult?: ToolResult
  /** 工具调用状态变更 */
  toolStatus?: 'thinking' | 'calling' | 'done'
  toolName?: string
  /** 子 Agent 工作过程事件 — 专家团编排时实时推送专家的工作进度（阶段/工具调用/中间产出） */
  subAgentEvent?: {
    /** 专家唯一标识 */
    expertId: string
    /** 专家名称（含 emoji，用于展示） */
    expertName: string
    /** 事件阶段：started=开始工作, tool=工具调用, toolResult=工具结果, message=专家中间产出, finished=完成 */
    stage: 'started' | 'tool' | 'toolResult' | 'message' | 'finished'
    /** 当前处理的任务摘要 */
    taskSummary?: string
    /** 阶段详情（工具名/消息内容/结果摘要等） */
    detail?: string
    /** 工具调用参数摘要（可选） */
    toolArgs?: string
    /** 专家工作结果（finished 时携带） */
    result?: string
  }
  /** 监督审查 Agent 反馈（ultra 思考强度专用） */
  supervision?: {
    verdict: 'on_track' | 'lazy' | 'off_track' | 'violation'
    issues: string[]
    correction?: string
    severity: 'low' | 'medium' | 'high'
    round: number
    /** 纠正指令全文 — 主进程已注入 messages 末尾，渲染层需持久化以便重建时保持一致（缓存友好） */
    message?: string
  }
}
