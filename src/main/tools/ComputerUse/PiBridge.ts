import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { randomUUID } from 'crypto'
import { access, constants as fsConstants, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { app } from 'electron'
import { piHelperDir } from '@main/paths'

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const PROTOCOL_VERSION = 4

/** Helper 命令默认超时（毫秒），可由外部配置覆盖 */
let defaultCommandTimeoutMs = 30_000

/** 设置 Helper 命令默认超时（从 settings 注入） */
export function setDefaultCommandTimeout(seconds: number): void {
  defaultCommandTimeoutMs = seconds * 1000
}

/** Windows Helper 安装路径 */
const HELPER_DIR = piHelperDir
export const WINDOWS_HELPER_PATH = join(HELPER_DIR, 'windows-bridge.exe')

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

interface PendingRequest<T> {
  resolve(value: T): void
  reject(error: Error): void
  timer: NodeJS.Timeout
}

interface HelperResponse {
  protocolVersion: number
  id: string
  ok: boolean
  result?: unknown
  error?: { message: string; code?: string }
}

// ---------------------------------------------------------------------------
// PiComputerUseBridge — 单例，管理与 Windows Helper 的通信
// ---------------------------------------------------------------------------

class PiComputerUseBridge {
  private child?: ChildProcessWithoutNullStreams
  private buffer = ''
  private pending = new Map<string, PendingRequest<unknown>>()
  private _ready = false

  /** Helper 是否已就绪 */
  get ready(): boolean {
    return this._ready && !!this.child && this.child.exitCode === null && !this.child.killed
  }

  /** 确保 Helper 已安装并启动 */
  async ensureReady(): Promise<void> {
    if (this.ready) return

    const exists = await this.isHelperInstalled()
    if (!exists) {
      // 自动部署：从项目 prebuilt 目录复制已编译的 Helper
      const deployed = await this.autoDeployHelper()
      if (!deployed) {
        throw new Error(
          `Windows Helper 未安装且自动部署失败。请手动将 windows-bridge.exe 放置到：${WINDOWS_HELPER_PATH}`
        )
      }
    }

    await this.startHelper()
    this._ready = true
  }

  /** 向 Helper 发送命令并等待响应（公开方法 — 自动确保 Helper 就绪） */
  async command<T>(cmd: string, args: Record<string, unknown> = {}, timeoutMs?: number): Promise<T> {
    await this.ensureReady()
    return this.sendCommand<T>(cmd, args, timeoutMs)
  }

  /** 底层发送 — 不检查就绪状态，供 startHelper 内部 ping 使用，避免 ensureReady ↔ startHelper 循环递归 */
  private sendCommand<T>(cmd: string, args: Record<string, unknown> = {}, timeoutMs?: number): Promise<T> {
    const child = this.child!
    const id = randomUUID()
    const timeout = timeoutMs ?? defaultCommandTimeoutMs

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Helper 命令 '${cmd}' 超时（${timeout}ms）`))
      }, timeout)

      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })

      const payload = JSON.stringify({ protocolVersion: PROTOCOL_VERSION, id, cmd, args })
      child.stdin.write(payload + '\n', (error) => {
        if (error) {
          this.pending.delete(id)
          clearTimeout(timer)
          reject(error)
        }
      })
    })
  }

  /** 关闭 Helper 进程 */
  dispose(): void {
    const error = new Error('Pi Computer Use Helper 会话已关闭。')
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
    this.buffer = ''

    const child = this.child
    this.child = undefined
    this._ready = false
    if (!child) return

    child.stdin.destroy()
    child.stdout.destroy()
    child.stderr.destroy()
    child.kill()
    child.unref()
  }

  // -------------------------------------------------------------------------
  // 内部方法
  // -------------------------------------------------------------------------

  private async isHelperInstalled(): Promise<boolean> {
    try {
      await access(WINDOWS_HELPER_PATH, fsConstants.X_OK)
      return true
    } catch {
      return false
    }
  }

  /**
   * 自动部署 Helper：从项目 prebuilt 目录复制 windows-bridge.exe 到 userData
   */
  private async autoDeployHelper(): Promise<boolean> {
    const { existsSync } = await import('fs')
    const { join, dirname } = await import('path')

    // 从 prebuilt 目录复制已编译的 Helper（主项目自包含，无外部依赖）
    // app.getAppPath() 在开发模式返回项目根目录，打包后返回 app.asar 路径（Electron 的 fs 补丁支持 asar 读取）
    const src = join(app.getAppPath(), 'prebuilt', 'win-x64', 'windows-bridge.exe')
    if (!existsSync(src)) {
      console.warn('[pi-computer-use] 未找到 windows-bridge.exe，自动部署失败。')
      return false
    }

    try {
      await mkdir(dirname(WINDOWS_HELPER_PATH), { recursive: true })
      const { copyFileSync } = await import('fs')
      copyFileSync(src, WINDOWS_HELPER_PATH)
      return true
    } catch (e) {
      console.warn(`[pi-computer-use] 从 ${src} 复制失败：`, (e as Error).message)
      return false
    }
  }

  private async startHelper(): Promise<void> {
    // 如果已有子进程，检查是否真正可用（发送 listRoots 验证）
    if (this.child && this.child.exitCode === null && !this.child.killed) {
      // 子进程存活，但可能上次验证失败 — 重新验证
      try {
        await this.sendCommand('listRoots', {}, 5_000)
        return
      } catch {
        // 验证失败，杀掉旧进程后重新启动
        this.dispose()
      }
    }

    // 确保 Helper 目录存在
    await mkdir(dirname(WINDOWS_HELPER_PATH), { recursive: true })

    const child = spawn(WINDOWS_HELPER_PATH, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdin.setDefaultEncoding('utf8')

    child.stdout.on('data', (chunk: string) => this.onStdout(chunk))
    child.stderr.on('data', (chunk: string) => {
      console.warn('[pi-computer-use] Helper stderr:', chunk.trim())
    })
    child.on('exit', (code) => {
      console.warn(`[pi-computer-use] Helper 退出，code=${code}`)
      if (this.child === child) {
        this.child = undefined
        this._ready = false
      }
    })
    child.on('error', (err) => {
      console.error('[pi-computer-use] Helper 错误:', err)
      if (this.child === child) {
        this.child = undefined
        this._ready = false
      }
    })

    this.child = child
    this.buffer = ''

    // 等待 Helper 就绪（发送 listRoots 验证通信）
    try {
      await this.sendCommand('listRoots', {}, 5_000)
    } catch {
      throw new Error('Windows Helper 启动失败或未响应。')
    }
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk
    for (;;) {
      const newline = this.buffer.indexOf('\n')
      if (newline < 0) return

      const line = this.buffer.slice(0, newline).trim()
      this.buffer = this.buffer.slice(newline + 1)
      if (!line) continue

      let parsed: HelperResponse
      try {
        parsed = JSON.parse(line)
      } catch {
        continue
      }

      const pending = this.pending.get(parsed.id)
      if (!pending) continue
      this.pending.delete(parsed.id)
      clearTimeout(pending.timer)

      if (parsed.protocolVersion !== PROTOCOL_VERSION) {
        pending.reject(new Error(
          `Helper 协议版本不匹配：期望 ${PROTOCOL_VERSION}，收到 ${parsed.protocolVersion ?? 'unknown'}`
        ))
      } else if (parsed.ok === true) {
        pending.resolve(parsed.result)
      } else {
        const err = new Error(parsed.error?.message ?? 'Helper 命令执行失败。') as Error & { code?: string }
        err.code = parsed.error?.code
        pending.reject(err)
      }
    }
  }
}

/** 全局单例 */
export const piBridge = new PiComputerUseBridge()
