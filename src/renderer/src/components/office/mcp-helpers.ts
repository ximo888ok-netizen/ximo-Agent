import type { McpServerConfig } from '@shared/types'

/** 将 McpServerConfig 格式化为标准 mcpServers 格式（用于详情展示） */
export function formatServerConfig(server: McpServerConfig): Record<string, unknown> {
  const config: Record<string, unknown> = {}

  if (server.transport === 'stdio') {
    if (server.command) config.command = server.command
    if (server.args) config.args = server.args
    if (server.env) config.env = server.env
  } else {
    if (server.url) config.url = server.url
    config.transport = server.transport
    if (server.headers) config.headers = server.headers
  }

  return { [server.name]: config }
}
