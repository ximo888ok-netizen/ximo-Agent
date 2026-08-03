import { spawn, type ChildProcess } from 'child_process'
import { app } from 'electron'
import type { McpServerConfig } from '@shared/types'
import type { McpToolSchema } from './mcp-session'

// ---------------------------------------------------------------------------
// MCP JSON-RPC 客户端 — 轻量级实现，不依赖 @modelcontextprotocol/sdk
// 支持 stdio 和 http(sse) 两种传输方式
// ---------------------------------------------------------------------------

/** JSON-RPC 2.0 请求 */
interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, unknown>
}

/** JSON-RPC 2.0 响应 */
interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

/**
 * McpClient — 连接单个 MCP 服务器，获取工具列表，转发工具调用
 *
 * 生命周期：
 *   1. connect() — 建立连接（spawn 进程或 HTTP），发送 initialize
 *   2. listTools() — 获取服务器暴露的工具列表
 *   3. callTool(name, args) — 调用工具并返回结果
 *   4. disconnect() — 关闭连接
 */
export class McpClient {
  private server: McpServerConfig
  private proc: ChildProcess | null = null
  private nextId = 1
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private buffer = ''
  private connected = false
  private requestTimeoutMs: number

  constructor(server: McpServerConfig, requestTimeoutMs?: number) {
    this.server = server
    this.requestTimeoutMs = requestTimeoutMs ?? 30000
  }

  /** 建立连接并发送 initialize */
  async connect(): Promise<void> {
    if (this.server.transport === 'stdio') {
      await this.connectStdio()
    } else {
      await this.connectHttp()
    }
    this.connected = true
  }

  /** stdio 传输 — spawn 子进程，通过 stdin/stdout 通信 */
  private async connectStdio(): Promise<void> {
    if (!this.server.command) {
      throw new Error(`MCP 服务器 "${this.server.name}" 缺少 command 字段`)
    }

    this.proc = spawn(this.server.command, this.server.args || [], {
      env: { ...process.env, ...this.server.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })

    // 监听 stdout — 逐行解析 JSON-RPC 响应
    this.proc.stdout?.on('data', (data: Buffer) => {
      this.buffer += data.toString('utf-8')
      this.processBuffer()
    })

    // 监听 stderr — 输出到控制台但不影响协议
    this.proc.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString('utf-8').trim()
      if (msg) console.error(`[MCP:${this.server.name}] stderr:`, msg)
    })

    this.proc.on('error', (err: Error) => {
      console.error(`[MCP:${this.server.name}] 进程错误:`, err)
      // reject 所有 pending 请求
      for (const { reject } of this.pending.values()) {
        reject(new Error(`MCP 进程错误: ${err.message}`))
      }
      this.pending.clear()
    })

    this.proc.on('exit', (code: number | null) => {
      console.warn(`[MCP:${this.server.name}] 进程退出，code=${code}`)
      this.connected = false
      for (const { reject } of this.pending.values()) {
        reject(new Error(`MCP 服务器进程已退出 (code=${code})`))
      }
      this.pending.clear()
    })

    // 发送 initialize
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'ximo-agent', version: app.getVersion() }
    })

    // 发送 initialized 通知
    this.sendNotification('notifications/initialized', {})
  }

  /** HTTP/SSE 传输 — 通过 fetch 发送 JSON-RPC 请求 */
  private async connectHttp(): Promise<void> {
    if (!this.server.url) {
      throw new Error(`MCP 服务器 "${this.server.name}" 缺少 url 字段`)
    }

    // 发送 initialize
    await this.sendHttpRequest({
      jsonrpc: '2.0',
      id: this.nextId++,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'ximo-agent', version: app.getVersion() }
      }
    })

    // 发送 initialized 通知（HTTP 模式下也是 POST，但不需要响应）
    try {
      await this.sendHttpRequest({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {}
      })
    } catch { /* notification 不需要响应，忽略错误 */ }
  }

  /** 处理 stdout 缓冲区 — 按换行分割 JSON-RPC 消息 */
  private processBuffer(): void {
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const msg = JSON.parse(trimmed) as JsonRpcResponse
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)!
          this.pending.delete(msg.id)
          if (msg.error) {
            reject(new Error(msg.error.message || `MCP 错误 (code=${msg.error.code})`))
          } else {
            resolve(msg.result)
          }
        }
      } catch {
        // 非 JSON 行，忽略
      }
    }
  }

  /** 发送 JSON-RPC 请求（stdio 模式） */
  private sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.proc || !this.proc.stdin) {
        reject(new Error('MCP 进程未启动'))
        return
      }

      const id = this.nextId++
      const msg: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }
      this.pending.set(id, { resolve, reject })

      // 超时保护
      const timeout = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`MCP 请求超时: ${method}`))
        }
      }, this.requestTimeoutMs)

      // 成功后清除超时
      const originalResolve = this.pending.get(id)!.resolve
      this.pending.get(id)!.resolve = (v: unknown) => {
        clearTimeout(timeout)
        originalResolve(v)
      }

      this.proc.stdin.write(JSON.stringify(msg) + '\n')
    })
  }

  /** 发送 JSON-RPC 通知（不需要响应） */
  private sendNotification(method: string, params: Record<string, unknown>): void {
    if (!this.proc || !this.proc.stdin) return
    const msg = { jsonrpc: '2.0' as const, method, params }
    this.proc.stdin.write(JSON.stringify(msg) + '\n')
  }

  /** 发送 HTTP JSON-RPC 请求 */
  private async sendHttpRequest(msg: JsonRpcRequest | { jsonrpc: '2.0'; method: string; params: Record<string, unknown> }): Promise<unknown> {
    const resp = await fetch(this.server.url!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.server.headers || {}) },
      body: JSON.stringify(msg)
    })

    if (!resp.ok) {
      throw new Error(`MCP HTTP 请求失败: ${resp.status} ${resp.statusText}`)
    }

    // 如果是通知（无 id），服务器可能返回 202 或空 body
    if (!('id' in msg)) return null

    const json = await resp.json() as JsonRpcResponse
    if (json.error) {
      throw new Error(json.error.message || `MCP 错误 (code=${json.error.code})`)
    }
    return json.result
  }

  /** 调用 HTTP JSON-RPC 请求 */
  private async sendHttpRequestWithId(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++
    return this.sendHttpRequest({ jsonrpc: '2.0', id, method, params })
  }

  /** 获取工具列表 */
  async listTools(): Promise<McpToolSchema[]> {
    let result: unknown
    if (this.server.transport === 'stdio') {
      result = await this.sendRequest('tools/list', {})
    } else {
      result = await this.sendHttpRequestWithId('tools/list', {})
    }

    const toolsResult = result as { tools?: McpToolSchema[] } | null
    return toolsResult?.tools || []
  }

  /** 调用工具 */
  async callTool(name: string, args: Record<string, unknown>): Promise<{ content: unknown; isError?: boolean }> {
    let result: unknown
    if (this.server.transport === 'stdio') {
      result = await this.sendRequest('tools/call', { name, arguments: args })
    } else {
      result = await this.sendHttpRequestWithId('tools/call', { name, arguments: args })
    }

    return result as { content: unknown; isError?: boolean }
  }

  /** 断开连接 */
  async disconnect(): Promise<void> {
    this.connected = false
    if (this.proc) {
      try {
        this.proc.stdin?.end()
        this.proc.kill('SIGTERM')
        // 给进程 2 秒优雅退出
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            this.proc?.kill('SIGKILL')
            resolve()
          }, 2000)
          this.proc?.on('exit', () => { clearTimeout(timer); resolve() })
        })
      } catch { /* ignore */ }
      this.proc = null
    }
    this.pending.clear()
  }

  get isConnected(): boolean {
    return this.connected
  }
}

// McpToolAdapter 和 McpSession 已提取到 ./mcp-session.ts
export { McpToolAdapter, McpSession, type McpToolSchema } from './mcp-session'
