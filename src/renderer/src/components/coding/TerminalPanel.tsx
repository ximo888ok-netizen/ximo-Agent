import { useState, useRef, useEffect } from 'react'

interface TerminalPanelProps {
  command: string
  output: string
  cwd?: string
}

interface HistoryEntry {
  command: string
  output: string
  exitCode: number
}

/**
 * TerminalPanel — 交互式终端面板
 * 底部固定高度，支持用户手动输入命令执行
 */
export function TerminalPanel({ command: agentCommand, output: agentOutput, cwd }: TerminalPanelProps): React.ReactElement {
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [cmdHistory, setCmdHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const [running, setRunning] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [history, agentOutput])

  const handleExecute = async (): Promise<void> => {
    const cmd = input.trim()
    if (!cmd || running) return

    setRunning(true)
    setInput('')

    try {
      const result = await window.api.terminal.execute(cmd, cwd)
      setHistory(prev => [...prev, { command: cmd, output: result.stdout + (result.stderr ? '\n' + result.stderr : ''), exitCode: result.exitCode }])
      setCmdHistory(prev => [...prev, cmd])
      setHistoryIdx(-1)
    } catch (e) {
      setHistory(prev => [...prev, { command: cmd, output: `Error: ${(e as Error).message}`, exitCode: 1 }])
    } finally {
      setRunning(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleExecute()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (cmdHistory.length > 0) {
        const newIdx = historyIdx === -1 ? cmdHistory.length - 1 : Math.max(0, historyIdx - 1)
        setHistoryIdx(newIdx)
        setInput(cmdHistory[newIdx])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIdx !== -1) {
        const newIdx = historyIdx + 1
        if (newIdx >= cmdHistory.length) {
          setHistoryIdx(-1)
          setInput('')
        } else {
          setHistoryIdx(newIdx)
          setInput(cmdHistory[newIdx])
        }
      }
    }
  }

  return (
    <div className="border-t border-border-subtle shrink-0 glass">
      <div className="bg-[#0d1117]/95">
        {/* 终端标题栏 */}
        <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-border-subtle-soft">
          <span className="h-2 w-2 rounded-full bg-red-500/80" />
          <span className="h-2 w-2 rounded-full bg-yellow-500/80" />
          <span className="h-2 w-2 rounded-full bg-green-500/80" />
          <span className="ml-2 text-caption text-text-muted">终端</span>
          {agentCommand && <span className="ml-3 text-caption text-text-muted font-mono truncate">$ {agentCommand}</span>}
        </div>
        {/* 终端输出 */}
        <div ref={scrollRef} className="p-3 font-mono text-xs h-40 overflow-y-auto">
          {/* Agent 执行的命令输出 */}
          {agentOutput && (
            <div className="mb-2">
              <div className="text-text-muted text-caption">[Agent]</div>
              <pre className="whitespace-pre-wrap break-all text-green-400">{agentOutput}</pre>
            </div>
          )}
          {/* 用户手动执行的命令历史 */}
          {history.map((entry, i) => (
            <div key={i} className="mb-1">
              <div className="text-blue-400">
                <span className="text-text-muted">$</span> {entry.command}
              </div>
              {entry.output && (
                <pre className={`whitespace-pre-wrap break-all ${entry.exitCode === 0 ? 'text-text-secondary' : 'text-red-400'}`}>
                  {entry.output}
                </pre>
              )}
            </div>
          ))}
          {/* 输入行 */}
          <div className="flex items-center gap-1.5">
            <span className="text-text-muted">$</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={running}
              placeholder={running ? '执行中...' : '输入命令并按 Enter 执行'}
              className="flex-1 bg-transparent text-text-primary font-mono outline-none placeholder:text-text-tertiary disabled:opacity-50"
              autoFocus
            />
          </div>
        </div>
      </div>
    </div>
  )
}
