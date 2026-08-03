import type { ToolDefinition, ToolCall, ToolResult, StreamChunk, ToolContext } from '@shared/types'

/**
 * 工具抽象接口 — 所有工具必须实现此接口
 * 参考 Reasonix 的工具合约设计，每个工具 = 定义 + 执行
 */
export interface Tool {
  /** 工具元数据定义（名称、描述、参数 schema） */
  readonly definition: ToolDefinition

  /**
   * 执行工具
   * @param toolCall LLM 传入的工具调用请求
   * @param onChunk  可选：执行过程中发送中间状态给前端
   * @param signal   可选：中止信号
   * @param context  可选：工具执行上下文（API 配置等，供需要发起子调用的工具使用）
   */
  execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
    context?: ToolContext
  ): Promise<ToolResult>
}
