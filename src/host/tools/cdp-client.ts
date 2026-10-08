/**
 * cdp-client — Chrome DevTools Protocol 直连客户端（阶段 D1）
 *
 * 设计哲学与 electron-shim 一致：最小接缝。不引 playwright/puppeteer——
 * 用 Node 原生 ws 直连 chromium 的 remote-debugging 端口，六个原语足以支撑
 * Agent 的浏览器自动化（navigate/extract/screenshot/click/type/eval）。
 *
 * chromium 由 BrowserTool 确保拉起（--headless=new --remote-debugging-port），
 * tab 复用：一个常驻 page target，navigate 用 Page.navigate 而非 /json/new，
 * 避免每动作泄漏 tab。
 */
import WebSocket from 'ws'
import { spawn, execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, mkdirSync } from 'fs'

const execFileAsync = promisify(execFile)

export interface CdpOptions {
  port: number
  /** chromium 可执行名候选（按序探测） */
  candidates?: string[]
  /** headless 模式（默认 true；有 X 会话时可 false 走 GUI 调试） */
  headless?: boolean
}

const DEFAULT_CANDIDATES = [
  'chromium', '/usr/bin/chromium', '/usr/lib/chromium/chromium',
  'chromium-browser', 'google-chrome', 'google-chrome-stable',
]

export class CdpClient {
  private ws: WebSocket | null = null
  private msgId = 0
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private starting: Promise<void> | null = null
  private chromiumProc: ReturnType<typeof spawn> | null = null

  constructor(private readonly opts: CdpOptions) {}

  get browserRunning(): boolean { return this.chromiumProc !== null && this.chromiumProc.exitCode === null }

  private get base(): string { return `http://127.0.0.1:${this.opts.port}` }

  /** 确保 chromium 在跑（幂等）——端口有响应即视为已就绪 */
  async ensureChromium(): Promise<void> {
    if (await this.portAlive()) return
    if (this.starting) return this.starting
    this.starting = (async () => {
      const bin = await this.findChromium()
      // user-data-dir 按 pid 唯一 —— 并发任务各有 worker/进程，共用同一 profile 会互相锁死
      const userDir = `/tmp/ximo-chromium-${this.opts.port}-${process.pid}`
      if (!existsSync(userDir)) mkdirSync(userDir, { recursive: true })
      // --no-sandbox：appliance 形态（专用用户 + 隔离 VM）下 chromium userns 沙箱
      // 在 Debian 默认 AppArmor 上会被拒——该沙箱由 VM 边界与按任务用户替代
      // 捕获 chromium 的 stderr —— 启动失败时给出可诊断的原因（而非只报「端口未就绪」）
      // 沙箱下 worker 降权到任务用户，HOME/HOME 目录不可写等常见失败都在这里显现
      this.chromiumProc = spawn(bin, [
        '--headless=new',
        `--remote-debugging-port=${this.opts.port}`,
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-first-run',
        // crashpad 在降权用户下无 HOME/可写目录 → 报 "--database is required" 并崩溃
        // （CI 实测）。appliance 内不需要崩溃上报，全部关闭
        '--disable-crash-reporter',
        '--no-crashpad',
        '--disable-breakpad',
        // 沙箱用户无真实 HOME → 显式给可写的临时目录（crashpad/缓存/GPU 落盘都依赖它）
        `--user-data-dir=${userDir}`,
        `--crash-dumps-dir=${userDir}/crashes`,
        'about:blank',
      ], { stdio: ['ignore', 'ignore', 'pipe'], detached: true, env: { ...process.env, HOME: userDir } })
      let stderrBuf = ''
      this.chromiumProc.stderr?.on('data', (d) => { stderrBuf = (stderrBuf + String(d)).slice(-2000) })
      this.chromiumProc.unref()
      for (let i = 0; i < 60; i++) {
        if (await this.portAlive()) return
        if (this.chromiumProc.exitCode !== null) break
        await new Promise((r) => setTimeout(r, 250))
      }
      const hint = stderrBuf.trim() ? `：${stderrBuf.trim().split('\n').slice(-3).join(' | ')}` : ''
      throw new Error(`chromium CDP 端口 ${this.opts.port} 15s 内未就绪（bin=${bin}）${hint}`)
    })().finally(() => { this.starting = null })
    return this.starting
  }

  private async portAlive(): Promise<boolean> {
    try {
      const res = await fetch(`${this.base}/json/version`, { signal: AbortSignal.timeout(1500) })
      return res.ok
    } catch { return false }
  }

  private async findChromium(): Promise<string> {
    for (const bin of this.opts.candidates ?? DEFAULT_CANDIDATES) {
      try { await execFileAsync('which', [bin]); return bin } catch { /* 下一个 */ }
    }
    throw new Error('未找到 chromium——镜像需安装 chromium 包（或设置候选名）')
  }

  /** 连接最新 page target（about:blank 或既有 tab） */
  private async connect(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return this.ws
    await this.ensureChromium()
    const res = await fetch(`${this.base}/json/list`, { signal: AbortSignal.timeout(3000) })
    const targets = (await res.json()) as { type: string; webSocketDebuggerUrl: string; url: string }[]
    const page = targets.filter((t) => t.type === 'page')
      .sort((a, b) => (a.url === 'about:blank' ? 1 : 0) - (b.url === 'about:blank' ? 1 : 0))[0]
    if (!page) throw new Error('CDP targets 中无 page')
    const ws = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve)
      ws.once('error', reject)
    })
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw)) as { id?: number; error?: { message: string }; result?: unknown }
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id)!
        this.pending.delete(m.id)
        if (m.error) p.reject(new Error(`CDP: ${m.error.message}`))
        else p.resolve(m.result)
      }
    })
    this.ws = ws
    return ws
  }

  /** 发送一条 CDP 命令并等结果 */
  async send<T = unknown>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> {
    const ws = await this.connect()
    const id = ++this.msgId
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`CDP ${method} 超时`))
        }
      }, 30_000).unref()
    })
  }

  async close(): Promise<void> {
    this.ws?.close()
    this.ws = null
  }
}
