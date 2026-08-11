import { spawn, type ChildProcess } from 'child_process'
import { resolveOfficeCliInfo, locateOfficeCli } from './OfficeCliManager'

/**
 * OfficeCliRunner — OfficeCLI 进程封装
 *
 * - 单次调用：spawn 执行并等待退出，返回 { stdout, stderr, exitCode }
 * - UTF-8 输出：Windows 上通过环境变量强制，避免 GBK 乱码（本项目已知坑）
 * - 超时控制：默认 60s，超时 kill 进程树（Windows 用 taskkill /T）
 * - 版本缓存：--version 只检测一次，避免每次调用额外开销
 */

export interface CliRunResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

export interface RunOptions {
  /** 超时秒数，默认 60 */
  timeout?: number
  /** 中止信号 */
  signal?: AbortSignal
}

let cachedVersion: string | null | undefined

/** 检测 OfficeCLI 版本（带缓存，只检测一次） */
export async function getOfficeCliVersion(): Promise<string | null> {
  if (cachedVersion !== undefined) return cachedVersion
  const bin = locateOfficeCli()
  if (!bin) {
    cachedVersion = null
    return null
  }
  try {
    const { stdout } = await runCli(['--version'], { timeout: 15 })
    cachedVersion = (stdout.trim().split('\n')[0] ?? '').trim() || null
  } catch {
    cachedVersion = null
  }
  return cachedVersion
}

/**
 * 执行 OfficeCLI 命令（参数数组形式，避免 shell 注入）。
 * @param args 命令行参数（不含二进制路径）
 * @param options 超时/中止
 */
export function runCli(args: string[], options: RunOptions = {}): Promise<CliRunResult> {
  const bin = locateOfficeCli()
  if (!bin) {
    return Promise.reject(new Error('未检测到 OfficeCLI 二进制，请先安装（见 OfficeCliManager.buildInstallHint()）'))
  }

  const timeoutSec = Math.min(options.timeout ?? 60, 300)
  const signal = options.signal

  return new Promise<CliRunResult>((resolve, reject) => {
    const isWin = process.platform === 'win32'
    let stdout = ''
    let stderr = ''
    let finished = false

    // Windows: 强制 UTF-8 输出；OfficeCLI 是单二进制，直接 spawn（不走 shell）
    const env = {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
      PYTHONIOENCODING: 'utf-8',
      LANG: 'en_US.UTF-8',
      ...(isWin ? { 'OFFICECLI_OUTPUT_ENCODING': 'utf-8' } : {})
    }

    let child: ChildProcess
    try {
      child = spawn(bin, args, {
        windowsHide: true,
        env,
        // 不通过 shell，避免引号/注入问题
        shell: false
      })
    } catch (e) {
      reject(new Error(`启动 OfficeCLI 失败: ${(e as Error).message}`))
      return
    }

    const timeoutHandle = setTimeout(() => {
      if (finished) return
      finished = true
      try { child.kill('SIGTERM') } catch { /* 忽略 */ }
      if (isWin && child.pid) {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
      }
      reject(new Error(`OfficeCLI 执行超时（${timeoutSec}s）`))
    }, timeoutSec * 1000)

    const onAbort = (): void => {
      if (finished) return
      finished = true
      clearTimeout(timeoutHandle)
      try { child.kill('SIGTERM') } catch { /* 忽略 */ }
      if (isWin && child.pid) {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
      }
      reject(new Error('OfficeCLI 执行已中止'))
    }

    if (signal) {
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }

    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString('utf-8') })
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString('utf-8') })

    child.on('error', (err) => {
      if (finished) return
      finished = true
      clearTimeout(timeoutHandle)
      reject(new Error(`OfficeCLI 启动失败: ${err.message}`))
    })

    child.on('close', (code) => {
      if (finished) return
      finished = true
      clearTimeout(timeoutHandle)
      if (signal) signal.removeEventListener('abort', onAbort)
      resolve({ stdout, stderr, exitCode: code })
    })
  })
}

/**
 * 尝试将 stdout 解析为 JSON。
 * OfficeCLI 的 --json 输出可能是纯 JSON 或带前缀文本。
 * 解析失败返回 null（不抛错）。
 */
export function tryParseJson<T = unknown>(stdout: string): T | null {
  if (!stdout) return null
  const trimmed = stdout.trim()
  try {
    return JSON.parse(trimmed) as T
  } catch {
    // 尝试提取第一个 { 或 [ 开始的最长 JSON 片段
    try {
      const start = trimmed.search(/[[{]/)
      if (start === -1) return null
      const candidate = trimmed.slice(start)
      // 找配对的结尾：依次尝试长度递减的切片
      for (let end = candidate.length; end > start + 1; end--) {
        const slice = candidate.slice(0, end)
        try {
          return JSON.parse(slice) as T
        } catch {
          continue
        }
      }
      return null
    } catch {
      return null
    }
  }
}

/** 检查 OfficeCLI 是否可用（供工具入口一次性检测） */
export async function ensureOfficeCli(): Promise<{ ok: boolean; hint?: string }> {
  const info = await resolveOfficeCliInfo()
  if (!info.installed) {
    return { ok: false, hint: info.hint ?? 'OfficeCLI 未安装' }
  }
  return { ok: true }
}
