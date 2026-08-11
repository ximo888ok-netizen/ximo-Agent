import * as os from 'os'

/**
 * 运行环境信息构建 — 注入为 system 消息（前缀位置），让 Agent 知道 OS、Shell 等。
 * 仅包含日期（不含时分秒），确保同一会话内前缀稳定，不破坏 prompt 缓存。
 * Agent 如需精确时间可用 terminal_exec 执行 date 命令。
 */

// 缓存静态部分 — OS/Shell/CPU/内存等在同一进程内不变，避免每次请求重复调用 os API
const _envStatic = (() => {
  const isWin = process.platform === 'win32'
  const isMac = process.platform === 'darwin'
  const platformName = isWin ? 'Windows' : isMac ? 'macOS' : 'Linux'
  const shellName = isWin ? 'PowerShell' : isMac ? 'zsh' : 'bash'
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const lines: string[] = [
    `💻 操作系统：${platformName} ${process.arch}`,
    `🔧 终端 Shell：${shellName}${isWin ? '（PowerShell 语法，如 $env:PATH）' : '（Bash 语法）'}`,
    `📦 Node.js：${process.version}`,
    `👤 用户：${os.userInfo().username}@${os.hostname()}`,
    `🧠 CPU 核心：${os.cpus().length}　💾 内存：${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB`,
  ]
  const pathHint = isWin
    ? 'Windows 路径用反斜杠 \\(如 C:\\Users\\xxx)'
    : 'Unix 路径用正斜杠 /(如 /home/xxx)'
  return { tz, isWin, lines, pathHint }
})()

export function buildEnvInfo(): string {
  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const weekday = weekdays[now.getDay()]

  const dateLine = `⏰ 当前日期：${dateStr} 星期${weekday} (${_envStatic.tz})`
  return `--- 运行环境 ---\n${dateLine}\n${_envStatic.lines.join('\n')}\n\n⚠️ 请基于以上信息使用正确的命令语法和路径格式（${_envStatic.pathHint}）。联网搜索时，上述日期即为"今天"，搜索最新信息时无需再询问用户当前日期。如需精确时间可用 terminal_exec 执行 date 命令。`
}
