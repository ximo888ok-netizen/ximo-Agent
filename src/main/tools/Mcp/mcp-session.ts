/**
 * MCP 工具适配器与会话管理 — 从 McpClient.ts 提取
 */

import type { ToolDefinition, ToolCall, ToolResult, StreamChunk, ToolContext, ToolParamProperty } from '@shared/types'
import type { Tool } from '@main/tools/Tool'
import { McpClient } from './McpClient'

/** MCP 工具 schema（来自 tools/list 响应） */
export interface McpToolSchema {
  name: string
  description?: string
  inputSchema?: {
    type: string
    properties?: Record<string, unknown>
    required?: string[]
  }
}

/**
 * McpToolAdapter — 将单个 MCP 工具包装为项目 Tool 接口
 *
 * Agent 调用 execute() 时，通过 McpClient 转发请求到 MCP 服务器，
 * 并将返回的 content 转换为 ToolResult。
 */
export class McpToolAdapter implements Tool {
  readonly definition: ToolDefinition
  private client: McpClient
  private toolName: string

  constructor(client: McpClient, schema: McpToolSchema) {
    this.client = client
    this.toolName = schema.name

    const properties: Record<string, ToolParamProperty> = {}
    if (schema.inputSchema?.properties) {
      for (const [key, value] of Object.entries(schema.inputSchema.properties)) {
        properties[key] = value as ToolParamProperty
      }
    }

    this.definition = {
      name: `mcp__${schema.name}`,
      description: schema.description || `MCP 工具: ${schema.name}`,
      parameters: { type: 'object', properties, required: schema.inputSchema?.required || [] }
    }
  }

  async execute(toolCall: ToolCall, _onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal, _context?: ToolContext): Promise<ToolResult> {
    try {
      const result = await this.client.callTool(this.toolName, toolCall.arguments)

      let contentStr = ''
      if (typeof result.content === 'string') {
        contentStr = result.content
      } else if (Array.isArray(result.content)) {
        const texts: string[] = []
        for (const item of result.content as Array<Record<string, unknown>>) {
          if (item.type === 'text' && typeof item.text === 'string') {
            texts.push(item.text)
          } else if (item.type === 'image' && typeof item.data === 'string') {
            texts.push(`[图片: ${item.mimeType || 'image'}]`)
          } else {
            texts.push(JSON.stringify(item))
          }
        }
        contentStr = texts.join('\n')
      } else {
        contentStr = JSON.stringify(result.content, null, 2)
      }

      return { toolCallId: toolCall.id, toolName: this.definition.name, content: contentStr, success: !result.isError }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { toolCallId: toolCall.id, toolName: this.definition.name, content: `MCP 工具调用失败: ${msg}`, success: false, error: msg }
    }
  }
}

/**
 * MCP 会话 — 管理一次 Agent 会话中所有 MCP 连接
 */
export class McpSession {
  private clients: McpClient[] = []
  private tools: McpToolAdapter[] = []
  private serverNames: string[] = []
  private requestTimeoutMs: number

  constructor(requestTimeoutMs?: number) {
    this.requestTimeoutMs = requestTimeoutMs ?? 30000
  }

  /** 连接所有启用的 MCP 服务器并收集工具 */
  async connectAll(): Promise<{ toolCount: number; errors: string[] }> {
    const { loadMcpServers } = await import('@main/McpStore')
    const servers = await loadMcpServers()
    const enabled = servers.filter(s => s.enabled)
    const errors: string[] = []

    for (const server of enabled) {
      try {
        const client = new McpClient(server, this.requestTimeoutMs)
        await client.connect()
        const toolSchemas = await client.listTools()
        const adapters = toolSchemas.map(schema => new McpToolAdapter(client, schema))
        this.clients.push(client)
        this.tools.push(...adapters)
        this.serverNames.push(server.name)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        errors.push(`"${server.name}": ${msg}`)
        console.error(`[MCP] 连接 "${server.name}" 失败:`, msg)
      }
    }

    return { toolCount: this.tools.length, errors }
  }

  getToolDefinitions(): ToolDefinition[] { return this.tools.map(t => t.definition) }
  getTools(): McpToolAdapter[] { return this.tools }

  async disconnectAll(): Promise<void> {
    await Promise.allSettled(this.clients.map(c => c.disconnect()))
    this.clients = []
    this.tools = []
  }
}
