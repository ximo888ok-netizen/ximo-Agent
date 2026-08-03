import { readFile, writeFile } from 'fs/promises'
import type { McpServerConfig, McpTransport } from '@shared/types'
import { mcpFile } from './paths'
import { ensureDir } from './ensureDir'

// ---------- MCP 服务器配置持久化 ----------

export async function loadMcpServers(): Promise<McpServerConfig[]> {
  try {
    await ensureDir()
    const raw = await readFile(mcpFile, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    console.error('加载 MCP 配置失败：', e)
  }
  return []
}

export async function saveMcpServers(servers: McpServerConfig[]): Promise<void> {
  try {
    await ensureDir()
    await writeFile(mcpFile, JSON.stringify(servers, null, 2), 'utf-8')
  } catch (e) {
    console.error('保存 MCP 配置失败：', e)
  }
}

// ---------- MCP 配置解析（兼容主流客户端格式） ----------

/**
 * 从标准 mcpServers JSON 配置中解析出 MCP 服务器列表。
 *
 * 兼容格式（Cursor / Claude Code / Cline / Windsurf 等）：
 * {
 *   "mcpServers": {
 *     "server-name": {
 *       "command": "npx",
 *       "args": ["-y", "@some/mcp-server"],
 *       "env": { "KEY": "value" }
 *     }
 *   }
 * }
 *
 * 也支持 SSE/HTTP 传输：
 * {
 *   "mcpServers": {
 *     "server-name": {
 *       "url": "https://example.com/mcp",
 *       "transport": "sse"
 *     }
 *   }
 * }
 *
 * 还支持直接传入单个服务器对象或服务器数组。
 */
export function parseMcpConfig(raw: string): { servers: McpServerConfig[]; error?: string } {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (e) {
    return { servers: [], error: `JSON 解析失败：${(e as Error).message}` }
  }

  // 提取 mcpServers 映射（兼容多种外壳格式）
  let serversMap: Record<string, Record<string, unknown>> | null = null

  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>
    // 标准格式：{ "mcpServers": { ... } }
    if (obj.mcpServers && typeof obj.mcpServers === 'object') {
      serversMap = obj.mcpServers as Record<string, Record<string, unknown>>
    }
  }

  // 如果不是 mcpServers 格式，尝试直接当作单个服务器对象解析
  if (!serversMap) {
    if (json && typeof json === 'object' && ('command' in json || 'url' in json)) {
      serversMap = { 'imported-server': json as Record<string, unknown> }
    } else if (Array.isArray(json)) {
      // 数组格式：每个元素是一个服务器对象
      const servers: McpServerConfig[] = []
      for (let i = 0; i < json.length; i++) {
        const item = json[i]
        if (item && typeof item === 'object' && ('command' in item || 'url' in item)) {
          const parsed = parseSingleServer(`server-${i}`, item as Record<string, unknown>)
          if (parsed) servers.push(parsed)
        }
      }
      if (servers.length > 0) return { servers }
    }
  }

  if (!serversMap || Object.keys(serversMap).length === 0) {
    return { servers: [], error: '未找到有效的 mcpServers 配置。期望格式：{ "mcpServers": { "name": { "command": "...", "args": [...] } } }' }
  }

  const servers: McpServerConfig[] = []
  for (const [name, config] of Object.entries(serversMap)) {
    const parsed = parseSingleServer(name, config)
    if (parsed) {
      servers.push(parsed)
    }
  }

  if (servers.length === 0) {
    return { servers: [], error: '配置中没有有效的 MCP 服务器条目（缺少 command 或 url 字段）' }
  }

  return { servers }
}

/** 解析单个 MCP 服务器配置 */
function parseSingleServer(name: string, config: Record<string, unknown>): McpServerConfig | null {
  if (!config || typeof config !== 'object') return null

  const command = typeof config.command === 'string' ? config.command : undefined
  const url = typeof config.url === 'string' ? config.url : undefined

  // 必须有 command（stdio）或 url（sse/http）
  if (!command && !url) return null

  // 判断传输方式
  let transport: McpTransport = 'stdio'
  if (url) {
    // 如果有 url 字段，根据 transport 字段或默认为 http
    const transportField = typeof config.transport === 'string' ? config.transport.toLowerCase() : ''
    transport = transportField === 'sse' ? 'sse' : 'http'
  }

  // 解析 args
  let args: string[] | undefined
  if (Array.isArray(config.args)) {
    args = config.args.map(String)
  }

  // 解析 env
  let env: Record<string, string> | undefined
  if (config.env && typeof config.env === 'object') {
    env = {}
    for (const [k, v] of Object.entries(config.env as Record<string, unknown>)) {
      env[k] = String(v)
    }
  }

  // 解析 headers
  let headers: Record<string, string> | undefined
  if (config.headers && typeof config.headers === 'object') {
    headers = {}
    for (const [k, v] of Object.entries(config.headers as Record<string, unknown>)) {
      headers[k] = String(v)
    }
  }

  return {
    id: name.toLowerCase().replace(/[^a-z0-9\-_]+/g, '-').replace(/^-+|-+$/g, ''),
    name,
    transport,
    enabled: true,
    importedAt: Date.now(),
    command,
    args,
    env,
    url,
    headers
  }
}
