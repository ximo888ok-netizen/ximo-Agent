/**
 * sandbox — 按任务用户沙箱（阶段 D5）
 *
 * 目标：每任务以**专用系统用户**运行 worker，使任务间在工作区所有权层面隔离
 * （进程隔离 + 文件系统所有权双层；chdir/写白名单之外的第二道墙）。
 *
 * 权限模型（重要，勿误解）：
 *   切换 uid 需要 CAP_SETUID/CAP_SETGID/CAP_CHOWN。为避免全权 root，镜像中
 *   agent-hostd 以 root 启动但用 systemd `CapabilityBoundingSet=` **只保留这三个
 *   能力**（其余能力全部丢弃），且 ProtectSystem=strict 等加固仍在。这是「最小能力
 *   监督者 + 非特权 worker」的常规形态（类同 CI runner / systemd DynamicUser 思路）。
 *
 * 诚实降级：能力不足（宿主开发态 / WSL1 / 非 root）时不静默假装隔离成功——
 * 返回 mode='process'（仅进程隔离）并由 /api/health 上报，调用方可断言。
 */
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'

export interface SandboxStatus {
  /** 'uid' = 每任务专用用户；'process' = 仅进程隔离（能力不足，已降级） */
  mode: 'uid' | 'process'
  /** 参与调度的系统用户池（mode=uid 时） */
  pool: string[]
  /** 降级原因（mode=process 时） */
  reason?: string
}

/** 任务用户池 — 镜像由 postinstall 创建（ximo-t1..N）；env 可覆盖（逗号分隔 uid 列表） */
function poolFromEnv(): string[] {
  const raw = process.env.XIMO_TASK_USERS
  if (raw) return raw.split(',').map((s) => s.trim()).filter(Boolean)
  return ['ximo-t1', 'ximo-t2', 'ximo-t3', 'ximo-t4']
}

let cachedStatus: SandboxStatus | null = null

/** 探测沙箱能力（幂等缓存）—— 不需要 root 也能安全调用 */
export function sandboxStatus(): SandboxStatus {
  if (cachedStatus) return cachedStatus
  if (process.env.XIMO_SANDBOX === '0') {
    return (cachedStatus = { mode: 'process', pool: [], reason: 'XIMO_SANDBOX=0（显式禁用）' })
  }
  // 能力探测：非 root 时无法 setuid（getuid 在 Windows 开发态抛错）
  let isRoot = false
  try { isRoot = process.getuid?.() === 0 } catch { isRoot = false }
  if (!isRoot) {
    return (cachedStatus = { mode: 'process', pool: [], reason: '非 root（无 CAP_SETUID）— 仅进程隔离' })
  }
  const pool = poolFromEnv().filter((u) => userExists(u))
  if (pool.length === 0) {
    return (cachedStatus = { mode: 'process', pool: [], reason: '任务用户池为空（镜像需 postinstall 建 ximo-t1..t4）' })
  }
  return (cachedStatus = { mode: 'uid', pool })
}

function userExists(name: string): boolean {
  try {
    execFileSync('id', ['-u', name], { stdio: 'ignore', timeout: 5000 })
    return true
  } catch { return false }
}

function lookupIds(name: string): { uid: number; gid: number } | null {
  try {
    const out = execFileSync('id', ['-u', name], { encoding: 'utf-8', timeout: 5000 }).trim()
    const uid = Number(out)
    const gid = Number(execFileSync('id', ['-g', name], { encoding: 'utf-8', timeout: 5000 }).trim())
    return Number.isFinite(uid) && Number.isFinite(gid) ? { uid, gid } : null
  } catch { return null }
}

/** 稳定分配 — 同一任务 id 恒得同一用户（重试/续跑时工作区所有权一致） */
function hashTask(taskId: string): number {
  let h = 0
  for (let i = 0; i < taskId.length; i++) h = (h * 31 + taskId.charCodeAt(i)) >>> 0
  return h
}

/**
 * 为任务准备沙箱：返回 fork 用的 uid/gid（无需沙箱时返回 undefined）。
 * 副作用：把工作区所有权交给任务用户（仅 mode=uid 时）。
 */
export function prepareTaskSandbox(taskId: string, workspace: string): { uid?: number; gid?: number } {
  const st = sandboxStatus()
  if (st.mode !== 'uid') return {}
  const user = st.pool[hashTask(taskId) % st.pool.length]
  const ids = lookupIds(user)
  if (!ids) return {}
  if (existsSync(workspace)) {
    try {
      // 工作区归任务用户；父进程需 CAP_CHOWN（CapabilityBoundingSet 已含）
      execFileSync('chown', ['-R', `${ids.uid}:${ids.gid}`, workspace], { stdio: 'ignore', timeout: 30_000 })
    } catch { /* 所有权失败不阻断（worker 内仍受 security-guard 白名单约束） */ }
  }
  return ids
}

/** 测试/脚手架用 — 清缓存（env 变化后重新探测） */
export function resetSandboxCache(): void { cachedStatus = null }
