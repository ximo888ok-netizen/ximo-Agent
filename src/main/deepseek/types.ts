import type { StreamChunk, ToolCall } from '@shared/types'
import type { NormalizedUsage } from '@shared/cache'

// ---------- 类型 ----------

export interface StreamHandlers {
  onChunk: (chunk: StreamChunk) => void
  signal?: AbortSignal
  /** 敏感工具执行前的用户确认回调，返回 true=允许执行，false=取消 */
  requestConfirmation?: (toolName: string, message: string) => Promise<boolean>
  /** 请求用户输入（弹窗）— Plan 提问和 Spec 审核使用 */
  requestUserInput?: (type: 'ask' | 'review', title: string, content: string) => Promise<{ confirmed: boolean; response?: string }>
  /** YOLO 模式：跳过所有确认 */
  yoloMode?: boolean
  /** Auto Mode 等级：off=手动确认, safe=读操作自动, yolo=全部自动 */
  autoModeLevel?: 'off' | 'safe' | 'yolo'
}

/** 单次 API 调用的结果 */
export interface SingleCallResult {
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error'
  content: string
  reasoningContent: string
  toolCalls: ToolCall[]
  /** 归一化后的 usage（D3 normaliseUsage 双形态归一化） */
  usage?: NormalizedUsage
  error?: string
  /** C1 emitted 标志 — 是否已有 content/reasoning/tool_call 输出（用于零输出重放决策） */
  emitted?: boolean
}
