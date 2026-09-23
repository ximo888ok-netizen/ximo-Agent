import { useEffect, useRef, useState } from 'react'
import { Play, Trash2, Loader2 } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'

interface Entry {
  id: number
  command: string
  stdout: string
  stderr: string
  exitCode: number
}

/**
 * OfficeTerminalPanel — 命令执行台
 *
 * 走真实的 `terminal:execute`（主进程 spawn powershell / sh，30s 超时，一次性返回 stdout/stderr/exitCode）。
 * 注意：这是**一次性命令执行**，不是交互式 PTY —— 不支持 stdin、不支持 cd 保持、不支持长驻进程。
 */
export function OfficeTerminalPanel(): React.ReactElement {
  const projectPath = useStore((s) => s.projectPath)
  const [command, setCommand] = useState('')
  const [running, setRunning] = useState(false)
  const [entries, setEntries] = useState<Entry[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [entries, running])

  const run = async (): Promise<void> => {
    const cmd = command.trim()
    if (!cmd || running) return
    setRunning(true)
    setCommand('')
    try {
      const result = await window.api.terminal.execute(cmd, projectPath || undefined)
      setEntries((prev) => [...prev, { id: Date.now(), command: cmd, ...result }])
    } catch (e) {
      setEntries((prev) => [...prev, { id: Date.now(), command: cmd, stdout: '', stderr: (e as Error).message, exitCode: -1 }])
    } finally {
      setRunning(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2 shrink-0">
        <span className="truncate text-caption text-text-muted" title={projectPath || '未绑定项目目录'}>
          {projectPath || '未绑定项目目录 — 命令将在默认目录执行'}
        </span>
        {entries.length > 0 && (
          <button onClick={() => setEntries([])} className="icon-btn rounded-control p-1" title="清空">
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* 输出 */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 font-mono text-caption leading-relaxed">
        {entries.length === 0 && !running && (
          <p className="text-text-muted">
            一次性命令执行（无交互式 stdin）。试试 <span className="text-text-secondary">git status</span> 或{' '}
            <span className="text-text-secondary">npm run build</span>。
          </p>
        )}
        {entries.map((e) => (
          <div key={e.id} className="mb-2">
            <div className="text-accent">
              <span className="text-text-muted">$ </span>{e.command}
            </div>
            {e.stdout && <pre className="whitespace-pre-wrap break-all text-text-secondary">{e.stdout}</pre>}
            {e.stderr && <pre className="whitespace-pre-wrap break-all text-red-400">{e.stderr}</pre>}
            {e.exitCode !== 0 && <div className="text-caption text-text-muted">exit {e.exitCode}</div>}
          </div>
        ))}
        {running && (
          <div className="flex items-center gap-1.5 text-text-muted">
            <Loader2 size={11} className="animate-spin" />执行中…
          </div>
        )}
      </div>

      {/* 输入 */}
      <div className="flex items-center gap-1.5 border-t border-border-subtle px-2 py-2 shrink-0">
        <span className="font-mono text-caption text-text-muted">$</span>
        <input
          ref={inputRef}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void run() }}
          placeholder="输入命令后回车"
          spellCheck={false}
          className="flex-1 bg-transparent font-mono text-caption text-text-primary placeholder:text-text-muted focus-ring"
        />
        <button
          onClick={() => void run()}
          disabled={!command.trim() || running}
          className="chip flex items-center gap-1 px-2 py-0.5 text-caption text-text-secondary transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] hover:text-accent disabled:opacity-40"
          title="执行"
        >
          <Play size={11} />
        </button>
      </div>
    </div>
  )
}
