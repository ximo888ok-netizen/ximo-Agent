#!/usr/bin/env node
/**
 * ximo-OS 镜像验收 — 阶段 1 达成标准自动化（os/README.md 清单后 4 项）
 *
 * 前置：QEMU 已启动镜像并做端口转发（os/scripts/run-image-tcg.ps1）
 *   cockpit-link: 127.0.0.1:17890 → guest:17890
 *   SSH:          127.0.0.1:12222 → guest:22
 *
 * 用法：node os/scripts/verify-image.mjs [--token <令牌>] [--port 17890]
 *
 * 覆盖的验收项：
 *   [2] 令牌获取（/opt/ximo-host/config/token 经 SSH 或人工提供）
 *   [3] GET /api/health 返回 200
 *   [4] WS 派任务 → done(completed)，产物落在工作区
 *   [5] 审批路径：terminal_exec 任务触发 approval.request
 *   [1] 启动耗时需人工记录（本脚本打印提示）
 *
 * 第 1 项（启动 ≤2min）无法自动判定：起始时刻取决于 QEMU 拉起时间，
 * 脚本在结束时提示人工核对。
 */
import WebSocket from 'ws'
import { execFileSync } from 'child_process'

const args = process.argv.slice(2)
const getArg = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}
const PORT = Number(getArg('port', '17890'))
const SSH_PORT = Number(getArg('ssh-port', '12222'))
let TOKEN = getArg('token', '')

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

/** 尝试从 VM 内读令牌；失败则要求 --token */
function resolveToken() {
  if (TOKEN) return TOKEN
  try {
    // root 已锁死，若镜像已注入密钥则可用；否则只能人工提供
    const out = execFileSync('ssh', [
      '-p', String(SSH_PORT),
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'BatchMode=yes',
      '-o', 'ConnectTimeout=8',
      'ximo-os@127.0.0.1',
      'cat /opt/ximo-host/config/token',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return out
  } catch {
    return ''
  }
}

async function checkHealth(token, { requireDesktop = false } = {}) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/health`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401) return record('[3] /api/health', false, '令牌无效（401）')
    if (!res.ok) return record('[3] /api/health', false, `HTTP ${res.status}`)
    const body = await res.json()
    record('[3] /api/health', body.ok === true, `name=${body.name} version=${body.version} mode=${body.mode}`)
    // 桌面栈就绪（阶段 B1）— CI 传 --require-desktop 时为硬断言；
    // 对旧镜像 / WSL1 形态验收时缺省跳过（不阻塞阶段 1 清单）
    if (requireDesktop) {
      record('[3b] 桌面栈就绪（Xvfb 会话）', body.desktop?.enabled === true,
        body.desktop ? `display=${body.desktop.display}` : '主机未上报 desktop 状态（镜像缺桌面栈）')
      // [3c] 按任务用户沙箱（阶段 D5）— 镜像内应为 uid 级（非 root 或用户池缺失即降级）
      record('[3c] 按任务用户沙箱（uid 级）', body.sandbox?.mode === 'uid',
        body.sandbox ? `mode=${body.sandbox.mode} pool=${body.sandbox.pool}${body.sandbox.reason ? ' — ' + body.sandbox.reason : ''}` : '主机未上报 sandbox 状态')
    } else if (body.desktop) {
      console.log(`ℹ 桌面栈：${body.desktop.enabled ? '已启用' : '未启用'}（display=${body.desktop.display}）— 加 --require-desktop 可作为硬断言`)
    }
  } catch (e) {
    record('[3] /api/health', false, `连接失败：${e.message}`)
  }
}

/** 派任务并等终态；onChunk 可观察 approval.request */
function dispatch(token, id, task, { approveIfAsked = false, timeoutMs = 300_000 } = {}) {
  // 300s：TCG 纯软件模拟下 guest 内 TLS/计算比 KVM 慢一个量级（CI 实测 120s 会假超时）
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${token}`)
    let asked = false
    let toolResults = []
    const timer = setTimeout(() => {
      ws.close()
      resolve({ status: 'timeout', asked, toolResults })
    }, timeoutMs)
    ws.on('open', () => ws.send(JSON.stringify({ t: 'task.dispatch', id, task, mode: 'coding' })))
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw))
      if (m.t === 'approval.request') {
        asked = true
        if (approveIfAsked) {
          ws.send(JSON.stringify({ t: 'approval.respond', reqId: m.reqId, allow: true }))
        }
      }
      if (m.t === 'task.chunk' && m.delta?.type === 'tool_result') {
        toolResults.push({ name: m.delta.name, content: String(m.delta.content ?? ''), success: m.delta.success === true })
      }
      if (m.t === 'task.done') {
        clearTimeout(timer)
        ws.close()
        resolve({ status: m.status, result: m.result, error: m.error, asked, toolResults })
      }
    })
    ws.on('error', () => { clearTimeout(timer); resolve({ status: 'error', asked, toolResults }) })
  })
}

async function main() {
  console.log('=== ximo-OS 镜像验收（阶段 1 清单）===\n')
  console.log('[1] 启动耗时 ≤2min —— 需人工核对 QEMU 拉起至 health 可用的时长\n')

  const token = resolveToken()
  if (!token) {
    record('[2] 获取访问令牌', false, 'SSH 不可达或未注入密钥 —— 用 --token <令牌> 提供（VM 控制台 cat /opt/ximo-host/config/token）')
    console.log('\n无法继续：缺少令牌。')
    process.exit(1)
  }
  record('[2] 获取访问令牌', true, `长度 ${token.length}`)

  await checkHealth(token, { requireDesktop: process.argv.includes('--require-desktop') })

  // [4] 派任务 → completed
  console.log('\n派发验收任务（创建工作区文件）…')
  const t4 = await dispatch(token, `verify_ws_${Date.now()}`, '在工作区创建 hello.txt，内容写 "ximo-os ok"，然后确认文件存在。')
  record('[4] WS 派任务 → done(completed)',
    t4.status === 'completed',
    t4.status === 'completed' ? `调用了 ${t4.toolResults.length} 次工具` : `status=${t4.status} err=${(t4.error ?? '').slice(0, 80)}`)

  // [5] 审批路径
  console.log('\n派发审批路径任务（terminal_exec）…')
  const t5 = await dispatch(token, `verify_appr_${Date.now()}`, '用 terminal_exec 执行 `echo approval-path-ok` 并把输出告诉我。', { approveIfAsked: true })
  record('[5] 审批路径触发 approval.request',
    t5.asked,
    t5.asked ? `任务终态 ${t5.status}（已自动批准）` : '未收到 approval.request')

  // [6] 桌面栈在环（阶段 B1 / 铁门槛①）— 仅 --require-desktop 时为硬断言
  if (process.argv.includes('--require-desktop')) {
    console.log('\n派发桌面工具任务（desktop window.list）…')
    const t6 = await dispatch(token, `verify_desk_${Date.now()}`,
      '调用 desktop 工具的 window.list 动作，然后把返回的窗口列表原样转述给我（窗口数为 0 也如实说明）。')
    const desktopOk = t6.toolResults.some((r) => r.name === 'desktop' && r.success)
    record('[6] 桌面工具在环（desktop.window.list 成功）', desktopOk,
      desktopOk ? `任务终态 ${t6.status}` : `status=${t6.status} tools=${t6.toolResults.map((r) => r.name + (r.success ? '✓' : '✗')).join(',') || '无'} err=${(t6.error ?? '').slice(0, 80)}`)
    if (!desktopOk) {
      for (const r of t6.toolResults) console.log(`    [${r.name}] ${String(r.content).slice(0, 300)}`)
    }
  }

  // [7] 浏览器语义化 API（阶段 D1 / 铁门槛④）— 仅 --require-desktop 时检查
  if (process.argv.includes('--require-desktop')) {
    console.log('\n派发浏览器任务（browser navigate + extract）…')
    const t7 = await dispatch(token, `verify_browser_${Date.now()}`,
      '用 browser 工具：action=navigate 打开 https://example.com ，然后 action=extract 取出页面标题与正文前 100 字，把标题告诉我。', { timeoutMs: 420_000 })
    const browserOk = t7.toolResults.some((r) => r.name === 'browser' && r.success)
    record('[7] 浏览器语义化 API 在环（browser navigate/extract 成功）', browserOk,
      browserOk ? `任务终态 ${t7.status}` : `status=${t7.status} tools=${t7.toolResults.map((r) => r.name + (r.success ? '✓' : '✗')).join(',') || '无'} err=${(t7.error ?? '').slice(0, 100)}`)
    if (!browserOk) {
      for (const r of t7.toolResults) console.log(`    [${r.name}] ${String(r.content).slice(0, 300)}`)
    }
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n=== 结果：${results.length - failed.length}/${results.length} 项通过 ===`)
  console.log('[1] 请人工核对 QEMU 启动耗时是否 ≤2 分钟，并确认 os/README.md 清单全部勾选。')
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((e) => { console.error('验收脚本异常：', e.message); process.exit(1) })
