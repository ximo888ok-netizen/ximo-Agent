import type { StreamChunk, ToolCall, AutoModeLevel } from '@shared/types'
import type { NormalizedUsage } from '@shared/cache'

// ---------- 类型 ----------

export interface StreamHandlers {
  onChunk: (chunk: StreamChunk) => void
  signal?: AbortSignal
  /** 敏感工具执行前的用户确认回调，返回 true=允许执行，false=取消 */
  requestConfirmation?: (toolName: string, message: string) => Promise<boolean>
  /** 请求用户输入（弹窗）— Plan 提问和 Spec 审核使用 */
  requestUserInput?: (type: 'ask' | 'review', title: string, content: string) => Promise<{ confirmed: boolean; response?: string }>
  /**
   * YOLO 模式：跳过所有确认。
   * 历史遗留的布尔字段 —— 现由 `autoModeLevel === 'yolo'` 派生，不再单独存储/读取，
   * 保留字段是为了不影响既有调用点，请勿写入。
   */
  yoloMode?: boolean
  /** Auto Mode 等级 —— 语义见 AutoModeLevel。这是权限判定的**唯一权威** */
  autoModeLevel?: AutoModeLevel
}

/** 单次 API 调用的结果 */
export interface SingleCallResult {
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error' | 'cancelled'
  content: string
  reasoningContent: string
  toolCalls: ToolCall[]
  /** 归一化后的 usage（D3 normaliseUsage 双形态归一化） */
  usage?: NormalizedUsage
  error?: string
  /** C1 emitted 标志 — 是否已有 content/reasoning/tool_call 输出（用于零输出重放决策） */
  emitted?: boolean
}
