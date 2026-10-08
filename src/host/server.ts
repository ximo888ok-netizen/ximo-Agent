/**
 * cockpit-link 服务端 — HTTP（健康/查询）+ WebSocket（控制/事件流）
 *
 * 安全：WS 与 REST 都要求令牌（WS 经 ?token= 或 Authorization 头）；
 * 审批语义 fail-closed：广播 approval.request 后等驾驶舱响应，
 * 超时（config.approvalTimeoutMs）一律视为拒绝。
 * 任务串行执行（runner v1 的 cwd/写白名单是进程级全局），排队任务可取消。
 */
import { createServer } from 'http'
import { randomBytes } from 'crypto'
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { execFile } from 'child_process'
import { join, dirname } from 'path'
import { WebSocketServer, WebSocket } from 'ws'
import { parseClientMsg, HOST_VERSION, HostMsg } from './protocol'
import { DESKTOP_ACTIONS } from '../shared/types/cockpit'
import { runTask, ensureHostSettings } from './agent/task-runner'
import { fork } from 'child_process'
import { DesktopBus } from './desktop/bus'
import { ScreenCapture } from './desktop/screen'
import { HostConfig, loadConfig, tasksDir, workspaceDir, dataDir, ensureToken, ensureWorkspaceSubvolume } from './config'
import { sandboxStatus, prepareTaskSandbox } from './sandbox'
import type { HostTaskRecord, RunnerEvent } from '../shared/types/cockpit'

/** 任务记录 — 与驾驶舱共享的类型（REST /api/tasks 与 WS 增量描述同一实体） */
export type TaskRecord = HostTaskRecord

export interface HostDeps {
  /** 覆盖审批超时（测试用） */
  approvalTimeoutMs?: number
  /** 注入 desktop-bus（测试用 fake 后端）；缺省按 config.display 自建 */
  desktopBus?: DesktopBus
  /** 注入画面采集（测试用 fake）；缺省按 config.display 自建 */
  screen?: ScreenCapture
}

export interface HostServer {
  start: () => Promise<void>
  close: () => Promise<void>
  /** 供测试钩取状态 */
  _tasks: Map<string, { rec: TaskRecord; controller: AbortController }>
}

const execFileP = (cmd: string, args: string[], timeout = 120_000): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 8 << 20 }, (err, stdout) => (err ? reject(err) : resolve(String(stdout))))
  })

/** 判断路径是否在 btrfs 上（btrfs 原生快照优先，能力探测失败即回退） */
async function isBtrfs(path: string): Promise<boolean> {
  try {
    const out = await execFileP('stat', ['-f', '-c', '%T', path], 5000)
    return out.trim() === 'btrfs'
  } catch { return false }
}

/**
 * 打快照（阶段 D5）——两种实现按文件系统能力自动选择：
 *  - btrfs：`btrfs subvolume snapshot -r` 只读快照（近零成本、O(1)、原子）
 *    ⚠ 要求 src 本身是子卷；不是子卷时回退复制（btrfs 上非子卷目录无法快照）
 *  - 其他 fs / 宿主开发态：rsync -a --delete 复制（无 rsync 再退 cp -a + 清空）
 */
async function snapshotDir(src: string, dest: string): Promise<'btrfs' | 'copy'> {
  const srcPath = src.replace(/\/$/, '')
  if (await isBtrfs(srcPath)) {
    try {
      // 先探测 src 是否子卷（btrfs subvolume show 对普通目录非零退出）
      await execFileP('btrfs', ['subvolume', 'show', srcPath], 10_000)
      mkdirSync(dirname(dest), { recursive: true })
      await execFileP('btrfs', ['subvolume', 'snapshot', '-r', srcPath, dest])
      return 'btrfs'
    } catch { /* 非子卷或 btrfs 不可用 → 回退复制 */ }
  }
  mkdirSync(dest, { recursive: true })
  try {
    await execFileP('rsync', ['-a', '--delete', `${srcPath}/`, dest])
    return 'copy'
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    // cp 回退需自行实现 --delete 语义：先清空目标再加源内容，
    // 否则回滚后「快照里没有的文件」会残留（非精确还原）
    const cleaned = dest.replace(/\/$/, '')
    await execFileP('bash', ['-c', `rm -rf -- "${cleaned}"/* "${cleaned}"/.[!.]* 2>/dev/null; cp -a "${srcPath}/." "${cleaned}/"`])
    return 'copy'
  }
}

/**
 * 回滚 —— 与快照实现对应：
 *  - btrfs 快照（只读子卷）：删当前目录 → 用快照内容建可写子卷（保留原快照供再次回滚）
 *  - 复制快照：反向 rsync/cp（精确还原语义）
 */
async function rollbackDir(snap: string, dest: string): Promise<void> {
  const snapPath = snap.replace(/\/$/, '')
  const destPath = dest.replace(/\/$/, '')
  let isSnapshotSubvol = false
  try {
    await execFileP('btrfs', ['subvolume', 'show', snapPath], 10_000)
    isSnapshotSubvol = true
  } catch { /* 复制快照 */ }

  if (isSnapshotSubvol) {
    // 删除现工作区（可能是子卷 → 需 subvolume delete；普通目录 → rm -rf）
    try { await execFileP('btrfs', ['subvolume', 'delete', destPath]) }
    catch { await execFileP('bash', ['-c', `rm -rf -- "${destPath}"`]) }
    // 从只读快照建可写子卷（快照本身保留，可重复回滚到同一快照点）
    await execFileP('btrfs', ['subvolume', 'snapshot', snapPath, destPath])
    return
  }
  // 复制快照回滚：先清空再加回（--delete 语义）
  mkdirSync(destPath, { recursive: true })
  try {
    await execFileP('rsync', ['-a', '--delete', `${snapPath}/`, destPath])
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    await execFileP('bash', ['-c', `rm -rf -- "${destPath}"/* "${destPath}"/.[!.]* 2>/dev/null; cp -a "${snapPath}/." "${destPath}/"`])
  }
}

export function createHostServer(opts?: {
  config?: Partial<HostConfig>
  token?: string
  deps?: HostDeps
}): HostServer {
  const config = { ...loadConfig(), ...opts?.config }
  const approvalTimeoutMs = opts?.deps?.approvalTimeoutMs ?? config.approvalTimeoutMs
  const token = opts?.token ?? ensureToken().token

  const tasks = new Map<string, { rec: TaskRecord; controller: AbortController }>()
  const pendingApprovals = new Map<string, { resolve: (allow: boolean) => void; timer: NodeJS.Timeout }>()
  const conns = new Set<WebSocket>()

  // 画面采集 — 渲染端数据源（/api/screen/stream 代理 + snapshot 兜底）
  const screen = opts?.deps?.screen ?? new ScreenCapture({ display: config.display })

  // desktop-bus — 桌面 API 总线（阶段 2）；注入优先，否则按 config.display 自建
  const desktopBus = opts?.deps?.desktopBus
    ?? new DesktopBus({ display: config.display, snapshot: () => screen.snapshot() })
  desktopBus.onEvent((e) => broadcast({ t: 'desktop.event', kind: e.kind, data: e.data }))

  const broadcast = (msg: HostMsg): void => {
    const raw = JSON.stringify(msg)
    for (const ws of conns) if (ws.readyState === WebSocket.OPEN) ws.send(raw)
  }

  const persist = (rec: TaskRecord): void => {
    try { writeFileSync(join(tasksDir(), `${rec.id}.json`), JSON.stringify(rec, null, 2)) } catch { /* 磁盘失败不阻断 */ }
  }

  function requestApproval(taskId: string, tool: string, summary: string): Promise<boolean> {
    const reqId = `req_${randomBytes(6).toString('hex')}`
    return new Promise((resolvePromise) => {
      const entry = {
        resolve: (allow: boolean): void => {
          clearTimeout(entry.timer)
          pendingApprovals.delete(reqId)
          const t = tasks.get(taskId)
          if (t && t.rec.status === 'running') broadcast({ t: 'task.status', id: taskId, stage: 'running' })
          resolvePromise(allow)
        },
        timer: null as unknown as NodeJS.Timeout,
      }
      entry.timer = setTimeout(() => entry.resolve(false), approvalTimeoutMs)
      pendingApprovals.set(reqId, entry)
      const t = tasks.get(taskId)
      if (t && t.rec.status === 'running') broadcast({ t: 'task.status', id: taskId, stage: 'awaiting_approval' })
      broadcast({ t: 'approval.request', reqId, id: taskId, tool, summary })
    })
  }

  /** 注册任务（立即返回，可取消排队中的任务） */
  function register(id: string, task: string, mode?: string): { rec: TaskRecord; controller: AbortController } {
    const controller = new AbortController()
    const rec: TaskRecord = { id, task, status: 'queued', chunks: [], result: '', createdAt: Date.now() }
    tasks.set(id, { rec, controller })
    persist(rec)
    return { rec, controller }
  }

  // ---------- 阶段 D2：worker 子进程执行 + 并发调度 ----------
  // 每任务 fork 一个子进程：chdir/写白名单随进程隔离，任务可并发。
  // worker.cjs 缺席（vitest/ESM 环境）时回退进程内执行（行为与 D2 之前一致）。
  const workerPath = join(__dirname, 'worker.cjs')
  const workerAvailable = existsSync(workerPath)
  const pending: (() => void)[] = []
  let running = 0

  function runViaWorker(
    id: string,
    input: { id: string; task: string; mode: string; workspace: string; baseUrl: string; apiKey: string; model: string; desktopBusEnabled: boolean },
    onEvent: (e: RunnerEvent) => void,
    signal: AbortSignal,
  ): Promise<{ status: 'completed' | 'failed' | 'cancelled'; result: string; error?: string }> {
    return new Promise((resolvePromise) => {
      // 按任务用户沙箱（阶段 D5）— 能力不足时 prepareTaskSandbox 返回 {}（仅进程隔离）
      const sandboxIds = prepareTaskSandbox(id, workspaceDir(id))
      const child = fork(workerPath, {
        env: { ...process.env, XIMO_TASK_WORKER: '1' },
        silent: true,
        ...(sandboxIds.uid !== undefined ? { uid: sandboxIds.uid, gid: sandboxIds.gid } : {}),
      })
      let settled = false
      const finish = (out: { status: 'completed' | 'failed' | 'cancelled'; result: string; error?: string }): void => {
        if (settled) return
        settled = true
        running--
        const next = pending.shift()
        if (next) next()
        resolvePromise(out)
      }
      const onAbort = (): void => {
        if (settled) return
        child.send({ t: 'cancel' })
        // 宽限 10s 后强杀（worker 内 abort 级联未退出时兜底）
        setTimeout(() => { if (!settled) child.kill('SIGKILL') }, 10_000).unref()
      }
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
      child.on('message', (m: { t?: string; event?: RunnerEvent; reqId?: string; tool?: string; summary?: string; allow?: boolean; data?: unknown; error?: string; output?: { status: 'completed' | 'failed' | 'cancelled'; result: string; error?: string } }) => {
        if (m?.t === 'event' && m.event) onEvent(m.event)
        else if (m?.t === 'approval' && m.reqId) {
          void requestApproval(id, m.tool ?? '', m.summary ?? '').then((allow) =>
            child.send({ t: 'approval-resp', reqId: m.reqId, allow }),
          )
        } else if (m?.t === 'desktop' && m.reqId) {
          void desktopBus.dispatch((m as unknown as { action: import('../shared/types/cockpit').DesktopAction }).action, (m as unknown as { params?: Record<string, unknown> }).params ?? {})
            .then((data) => child.send({ t: 'desktop-reply', reqId: m.reqId, ok: true, data }))
            .catch((e: unknown) => child.send({ t: 'desktop-reply', reqId: m.reqId, ok: false, error: (e as Error).message.slice(0, 300) }))
        } else if (m?.t === 'result' && m.output) {
          signal.removeEventListener('abort', onAbort)
          child.kill('SIGTERM')
          finish(m.output)
        }
      })
      child.on('exit', (code) => {
        if (!settled) finish({ status: 'failed', result: '', error: `worker 异常退出（code=${code}）` })
      })
      child.send({ t: 'input', input })
    })
  }

/** 任务审计边界（阶段 D5）— best-effort 调 ximo-os-audit（镜像内有；宿主开发态静默跳过） */
function auditBoundary(action: 'start' | 'stop', taskId: string, workspace?: string): void {
  const script = process.env.XIMO_AUDIT_SCRIPT || '/usr/local/sbin/ximo-os-audit.sh'
  if (!existsSync(script)) return
  execFile(script, workspace ? [action, taskId, workspace] : [action, taskId], { timeout: 10_000 }, () => { /* best-effort */ })
}

  function scheduleOrRun(exec: () => void): void {
    if (running < config.maxConcurrentTasks) {
      running++
      exec()
    } else {
      pending.push(() => { running++; exec() })
    }
  }

  /** 实际执行 — 并发上限内调度（每任务 worker 子进程；无 worker 时进程内执行） */
  function dispatchTask(id: string, task: string, mode: string | undefined): void {
    const entry = tasks.get(id)
    if (!entry) return
    const { rec, controller } = entry

    const finish = (out: { status: 'completed' | 'failed' | 'cancelled'; result: string; error?: string }): void => {
      auditBoundary('stop', id)
      rec.status = out.status
      rec.result = out.result
      rec.error = out.error
      rec.finishedAt = Date.now()
      persist(rec)
      broadcast({ t: 'task.done', id, status: out.status, result: out.result, error: out.error })
    }

    scheduleOrRun(() => {
      if (controller.signal.aborted) {
        finish({ status: 'cancelled', result: '' })
        return
      }
      rec.status = 'running'
      persist(rec)
      broadcast({ t: 'task.status', id, stage: 'running' })
      ensureWorkspaceSubvolume(id) // btrfs 上使工作区可被原生快照（非 btrfs 静默跳过）
      auditBoundary('start', id, workspaceDir(id))

      let seq = 0
      const onEvent = (e: RunnerEvent): void => {
        rec.chunks.push(e)
        broadcast({ t: 'task.chunk', id, seq: seq++, delta: e })
        persist(rec)
      }

      if (workerAvailable) {
        void runViaWorker(
          id,
          {
            id, task,
            mode: mode || config.mode,
            workspace: workspaceDir(id),
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            model: config.model,
            desktopBusEnabled: desktopBus.enabled,
          },
          onEvent,
          controller.signal,
        ).then(finish, (e: unknown) => finish({ status: 'failed', result: '', error: (e as Error).message.slice(0, 300) }))
        return
      }

      // 进程内回退（vitest/ESM：worker.cjs 不存在）
      void runTask({
        id, task,
        mode: mode || config.mode,
        workspace: workspaceDir(id),
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        desktopBus,
        signal: controller.signal,
        onEvent,
        approval: (tool, summary) => requestApproval(id, tool, summary),
      }).then(finish, (e: unknown) => finish({ status: 'failed', result: '', error: (e as Error).message.slice(0, 300) }))
    })
  }

  const httpServer = createServer(async (req, res) => {
    const authed = req.headers.authorization === `Bearer ${token}`
    const json = (code: number, body: unknown): void => {
      res.writeHead(code, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (req.url === '/api/health') {
      if (!authed) return json(401, { ok: false, error: '需要 Bearer 令牌' })
      const sandbox = sandboxStatus()
      return json(200, {
        ok: true,
        name: 'ximo-host',
        version: HOST_VERSION,
        mode: config.mode,
        desktop: { enabled: desktopBus.enabled, display: config.display },
        // 沙箱模式（阶段 D5）— 运维/CI 可断言是 uid 级还是仅进程级
        sandbox: { mode: sandbox.mode, pool: sandbox.pool.length, reason: sandbox.reason },
      })
    }
    if (req.url === '/api/tasks') {
      if (!authed) return json(401, { ok: false, error: '需要 Bearer 令牌' })
      const live = [...tasks.values()].map(({ rec }) => rec)
      const onDisk = readdirSync(tasksDir()).filter(f => f.endsWith('.json') && !live.some(r => recFileId(f) === r.id))
      const past = onDisk.slice(-50).map(f => {
        try { return JSON.parse(readFileSync(join(tasksDir(), f), 'utf-8')) as TaskRecord } catch { return null }
      }).filter(Boolean)
      return json(200, { ok: true, tasks: [...live, ...past] })
    }
    // 工作区快照运维（阶段 D5，铁门槛③）— 仅带 Bearer 的本机/运维方调用，
    // 不进 cockpit-link（驾驶舱无回滚语义）。实现：rsync 硬链接快照（空间近零成本）
    if (req.url?.startsWith('/api/workspace/snapshot') || req.url?.startsWith('/api/workspace/rollback')) {
      if (!authed) return json(401, { ok: false, error: '需要 Bearer 令牌' })
      const url = new URL(req.url, 'http://localhost')
      const taskId = url.searchParams.get('task') ?? ''
      if (!/^[A-Za-z0-9_-]+$/.test(taskId)) return json(400, { ok: false, error: 'task 参数非法' })
      const ws = workspaceDir(taskId)
      const snaps = join(dataDir(), 'snapshots', taskId)
      const isRollback = req.url.startsWith('/api/workspace/rollback')
      try {
        if (isRollback) {
          const snapId = url.searchParams.get('snap') ?? ''
          if (!/^[A-Za-z0-9_.-]+$/.test(snapId)) return json(400, { ok: false, error: 'snap 参数非法' })
          const src = join(snaps, snapId)
          if (!existsSync(src)) return json(404, { ok: false, error: `快照不存在: ${snapId}` })
          await rollbackDir(src, ws)
          return json(200, { ok: true, rolledBack: taskId, snap: snapId })
        }
        const snapId = `snap_${Date.now()}`
        const kind = await snapshotDir(ws, join(snaps, snapId))
        return json(200, { ok: true, task: taskId, snap: snapId, kind, path: join(snaps, snapId) })
      } catch (e) {
        return json(500, { ok: false, error: (e as Error).message.slice(0, 200) })
      }
    }
    if (req.url === '/api/screen/snapshot') {
      if (!authed) return json(401, { ok: false, error: '需要 Bearer 令牌' })
      const shot = await screen.snapshot()
      return json(200, shot ? { ok: true, screenshot: shot.dataUrl } : { ok: false, error: '截图失败（桌面会话未就绪）' })
    }
    if (req.url === '/api/screen/stream') {
      if (!authed) {
        res.writeHead(401, { 'Content-Type': 'text/plain' })
        res.end('需要 Bearer 令牌')
        return
      }
      try {
        await screen.ensureStream()
        const upstream = await fetch(screen.upstreamUrl)
        // ffmpeg 恒发 application/octet-stream — Chromium <img> 只认 multipart 才逐帧渲染
        res.writeHead(200, {
          'Content-Type': 'multipart/x-mixed-replace; boundary=ffmpeg',
          'Cache-Control': 'no-store',
        })
        const { Readable } = await import('stream')
        Readable.fromWeb(upstream.body as import('stream/web').ReadableStream).pipe(res)
      } catch (e) {
        res.writeHead(503, { 'Content-Type': 'text/plain' })
        res.end(`画面流未就绪: ${(e as Error).message.slice(0, 200)}`)
      }
      return
    }
    json(404, { ok: false, error: 'not found' })
  })

  const wss = new WebSocketServer({ noServer: true })

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== '/ws') { socket.destroy(); return }
    const provided = url.searchParams.get('token') ?? (req.headers.authorization ?? '').replace(/^Bearer\s+/, '')
    if (!token || provided !== token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      conns.add(ws)
      // hello 附带能力列表 — 驾驶舱据此做动作级降级，而不是靠断连发现版本偏斜
      ws.send(JSON.stringify({ t: 'hello', version: HOST_VERSION, name: 'ximo-host', actions: DESKTOP_ACTIONS }))
      ws.on('message', (raw) => {
        const msg = parseClientMsg(String(raw))
        if (!msg) {
          ws.send(JSON.stringify({ t: 'error', code: 'bad_message', message: '无法解析的消息' }))
          ws.close()
          return
        }
        if (msg.t === 'ping') ws.send(JSON.stringify({ t: 'pong' }))
        else if (msg.t === 'task.dispatch') {
          if (tasks.has(msg.id ?? '')) {
            ws.send(JSON.stringify({ t: 'error', code: 'duplicate_id', message: `任务已存在: ${msg.id}` }))
            return
          }
          const id = msg.id || `task_${Date.now()}_${randomBytes(3).toString('hex')}`
          register(id, msg.task, msg.mode)
          broadcast({ t: 'task.accepted', id })
          dispatchTask(id, msg.task, msg.mode)
        } else if (msg.t === 'task.cancel') {
          tasks.get(msg.id)?.controller.abort()
        } else if (msg.t === 'approval.respond') {
          pendingApprovals.get(msg.reqId)?.resolve(msg.allow)
        } else if (msg.t === 'desktop.request') {
          // desktop-bus — 应答与事件均走本连接/广播（阶段 2）
          void desktopBus.dispatch(msg.action, msg.params ?? {})
            .then((data) => ws.send(JSON.stringify({ t: 'desktop.reply', reqId: msg.reqId, ok: true, data })))
            .catch((e: unknown) => ws.send(JSON.stringify({ t: 'desktop.reply', reqId: msg.reqId, ok: false, error: (e as Error).message.slice(0, 300) })))
        }
      })
      ws.on('close', () => conns.delete(ws))
      ws.on('error', () => conns.delete(ws))
    })
  })

  const recFileId = (f: string): string => f.replace(/\.json$/, '')

  return {
    _tasks: tasks,
    start: () => new Promise((resolvePromise) => {
      // 预写 settings（root 身份）— 否则降权 worker 写共享文件会 EACCES（见 D5 沙箱注释）
      void ensureHostSettings({ baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model })
        .catch((e: unknown) => console.warn('[ximo-host] 预写 settings 失败:', (e as Error).message))
      const [host, port] = config.listen.split(':')
      httpServer.listen(Number(port), host, () => resolvePromise())
    }),
    close: () => new Promise((resolvePromise) => {
      for (const { controller } of tasks.values()) if (!controller.signal.aborted) controller.abort()
      for (const ws of conns) ws.close()
      wss.close()
      httpServer.close(() => resolvePromise())
    }),
  }
}
