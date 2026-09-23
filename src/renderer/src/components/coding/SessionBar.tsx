import { useEffect, useState, useCallback } from 'react'
import { FolderOpen, Loader2, GitBranch, ChevronDown, Play } from 'lucide-react'

interface SessionBarProps {
  projectPath: string
  model: string
  tokenCount: number | null
  sessionStartTime: number
  toolCalls: { name: string; status: string }[]
  onRunProject?: () => void
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function SessionBar({
  projectPath,
  model,
  tokenCount,
  sessionStartTime,
  toolCalls,
  onRunProject
}: SessionBarProps): React.ReactElement {
  const [elapsed, setElapsed] = useState(Date.now() - sessionStartTime)
  const [gitBranch, setGitBranch] = useState<string>('')
  const [branches, setBranches] = useState<string[]>([])
  const [showBranches, setShowBranches] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - sessionStartTime)
    }, 1000)
    return () => clearInterval(interval)
  }, [sessionStartTime])

  // 获取当前 Git 分支
  const fetchGitBranch = useCallback(async () => {
    if (!projectPath) {
      setGitBranch('')
      return
    }
    try {
      const result = await window.api.terminal.execute('git branch --format=%(refname:short)', projectPath)
      const allBranches = result.stdout.split('\n').map(b => b.trim()).filter(Boolean)
      setBranches(allBranches)

      // 获取当前分支
      const currentResult = await window.api.terminal.execute('git rev-parse --abbrev-ref HEAD', projectPath)
      setGitBranch(currentResult.stdout.trim())
    } catch {
      setGitBranch('')
    }
  }, [projectPath])

  useEffect(() => {
    void fetchGitBranch()
  }, [fetchGitBranch])

  const handleSwitchBranch = async (branch: string): Promise<void> => {
    if (!projectPath) return
    try {
      // 转义分支名中的特殊字符，防止命令注入
      const safeBranch = branch.replace(/[^a-zA-Z0-9._\-/]/g, '')
      await window.api.terminal.execute(`git checkout ${safeBranch}`, projectPath)
      setGitBranch(branch)
      setShowBranches(false)
    } catch {
      // 切换失败时重新获取当前分支，保持 UI 与实际状态一致
      void fetchGitBranch()
      setShowBranches(false)
    }
  }

  const activeCalls = toolCalls.filter((tc) => tc.status === 'calling')

  return (
    <div className="flex items-center justify-between border-b border-border-subtle glass px-4 h-8">
      {/* 左侧：项目路径 + Git 分支 */}
      <div className="flex items-center gap-2 min-w-0">
        <FolderOpen size={13} className="text-text-muted shrink-0" />
        <span className="text-xs text-text-secondary truncate">
          {projectPath || '未打开项目'}
        </span>
        {gitBranch && (
          <div className="relative flex items-center">
            <button
              onClick={() => setShowBranches(!showBranches)}
              className="chip flex items-center gap-1 px-1.5 py-0.5 text-caption text-accent hover:border-accent/40 transition-[color,background-color,border-color,opacity,transform,box-shadow,filter]"
            >
              <GitBranch size={11} />
              {gitBranch}
              <ChevronDown size={11} className="text-text-muted" />
            </button>
            {showBranches && branches.length > 0 && (
              <div className="glass-strong absolute left-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-panel border border-border-subtle py-1 shadow-glass animate-scale-in min-w-[120px]">
                {branches.map((b) => (
                  <button
                    key={b}
                    onClick={() => void handleSwitchBranch(b)}
                    className={`flex w-full items-center gap-1.5 px-2 py-1 text-caption hover:bg-bg-hover transition-colors ${
                      b === gitBranch ? 'text-accent font-medium' : 'text-text-secondary'
                    }`}
                  >
                    <GitBranch size={11} />
                    {b}
                    {b === gitBranch && <span className="ml-auto text-green-500">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 右侧：运行 + 模型 + Token + 计时 */}
      <div className="flex items-center gap-3 shrink-0">
        {onRunProject && projectPath && (
          <button aria-label="一键运行项目"
            onClick={onRunProject}
            className="chip flex items-center gap-1 px-2 py-0.5 text-caption text-green-400 hover:border-green-500/40 transition-[color,background-color,border-color,opacity,transform,box-shadow,filter]"
            title="一键运行项目"
          >
            <Play size={11} />
            运行
          </button>
        )}
        {activeCalls.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-accent">
            <Loader2 size={11} className="animate-spin" />
            <span>{activeCalls[0].name}</span>
          </span>
        )}
        <span className="text-xs text-text-muted">{model}</span>
        {tokenCount !== null && (
          <span className="text-xs text-text-muted">
            {tokenCount.toLocaleString()} tokens
          </span>
        )}
        <span className="text-xs text-text-muted">{formatDuration(elapsed)}</span>
      </div>
    </div>
  )
}
