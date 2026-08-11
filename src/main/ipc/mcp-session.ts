import { toolRegistry } from '@main/tools'

// ── MCP 全局单例 ──
// 避免每次 chat:start 都重新连接所有 MCP 服务器（减少连接延迟和开销）
let _mcpSession: import('@main/tools/Mcp/McpClient').McpSession | null = null
let _mcpConnected = false

/** 获取（或创建并连接）MCP 会话单例 — 连接后自动将 MCP 工具注册到 toolRegistry */
export async function getMcpSession(timeoutMs: number): Promise<import('@main/tools/Mcp/McpClient').McpSession> {
  const { McpSession } = await import('@main/tools/Mcp/McpClient')
  if (!_mcpSession) {
    _mcpSession = new McpSession(timeoutMs)
    _mcpConnected = false
  }
  if (!_mcpConnected) {
    const result = await _mcpSession.connectAll()
    if (result.errors.length > 0) {
      console.warn('[MCP] 部分服务器连接失败:', result.errors)
    }
    _mcpConnected = true
    // 将 MCP 工具动态注册到 toolRegistry
    for (const tool of _mcpSession.getTools()) {
      if (!toolRegistry.has(tool.definition.name)) {
        toolRegistry.register(tool)
      }
    }
  }
  return _mcpSession
}

/** MCP 设置变更时调用，强制下次重连 */
export function invalidateMcpSession(): void {
  if (_mcpSession) {
    _mcpSession.disconnectAll().catch(() => {})
    _mcpSession = null
    _mcpConnected = false
  }
}
