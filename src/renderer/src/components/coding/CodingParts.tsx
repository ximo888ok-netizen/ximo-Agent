import { useState, useEffect, useRef } from 'react'
import { FolderOpen, ChevronDown, ArrowRight, Undo2, RotateCcw, Reply, Copy, Check, GitBranch, MoreHorizontal, ExternalLink } from 'lucide-react'
import type { ChangeRow } from './change-rows'

type SendMessageFn = (text: string, options?: { skipNetworkHint?: boolean }) => Promise<void>

/** 会话计时器 — 独立组件避免父级重渲染 */
export function SessionTimer({ startTime }: { startTime: number }): React.ReactElement {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [])
  const seconds = Math.floor((Date.now() - startTime) / 1000)
  return <>{seconds}s</>
}

export function ErrorBanner({ message }: { message: string }): React.ReactElement {
  return (
    <div className="mx-4 mb-1 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2 text-sm text-red-400 backdrop-blur-sm">
      <span className="text-xs">⚠</span>
      <span className="flex-1">{message}</span>
    </div>
  )
}

/** 变更摘要区块 — 默认收起，点击展开详情表格 */
export function ChangeSummarySection({
  changeRows,
  totalAdditions,
  totalDeletions,
  projectPath,
  sendMessage
}: {
  changeRows: ChangeRow[]
  totalAdditions: number
  totalDeletions: number
  projectPath: string
  sendMessage: SendMessageFn
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-b border-border px-4 py-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-xs transition-colors hover:bg-bg-hover/30 rounded-lg px-1 py-0.5"
      >
        <FolderOpen size={14} className="text-accent shrink-0" />
        <span className="text-text-secondary shrink-0">变更摘要</span>
        <span className="text-text-muted">{changeRows.length} 个文件</span>
        <span className="text-green-400 font-mono">+{totalAdditions}</span>
        <span className="text-red-400 font-mono">-{totalDeletions}</span>
        <span className="ml-auto flex items-center gap-1 text-text-muted shrink-0">
          <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {expanded && (
        <div className="mt-2">
          <div className="overflow-hidden rounded-xl border border-border-subtle shadow-glass">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-bg-elevated">
                  <th className="px-3 py-2 text-left font-medium text-text-secondary">文件</th>
                  <th className="px-3 py-2 text-left font-medium text-text-secondary">变更</th>
                </tr>
              </thead>
              <tbody>
                {changeRows.map((row, idx) => (
                  <tr key={idx} className="border-t border-border/50">
                    <td className="px-3 py-2 text-text-primary font-mono">{row.fileName}</td>
                    <td className="px-3 py-2 text-text-muted">{row.changeDesc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ios-card mt-1.5 flex items-center gap-3 px-4 py-2">
            <span className="text-sm text-text-primary">{changeRows.length} 个文件已更改</span>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm font-medium text-green-400">+{totalAdditions}</span>
              <span className="text-sm font-medium text-red-400">-{totalDeletions}</span>
              <button
                onClick={() => sendMessage(`请使用 git_operations 工具查看当前项目的 diff 详细信息。${projectPath ? `仓库路径：${projectPath}` : ''}`, { skipNetworkHint: true })}
                className="icon-btn rounded-lg p-1"
                title="查看详细 Diff"
              >
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** 编程模式底部操作工具条 */
export function CodingActionBar({
  changeRows,
  projectPath,
  sendMessage
}: {
  changeRows: ChangeRow[]
  projectPath: string
  sendMessage: SendMessageFn
}): React.ReactElement {
  const [showMore, setShowMore] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current)
    }
  }, [])

  const handleUndo = (): void => {
    sendMessage(
      `请使用 git_operations 工具撤销最近的文件更改。${projectPath ? `仓库路径：${projectPath}` : ''}\n\n请先查看 git status，然后用 git checkout 撤销工作区修改。操作前请先确认。`,
      { skipNetworkHint: true }
    )
  }

  const handleRedo = (): void => {
    sendMessage(
      `请使用 git_operations 工具恢复最近撤销的更改。${projectPath ? `仓库路径：${projectPath}` : ''}\n\n请先查看 git stash list，然后用 git stash pop 恢复。`,
      { skipNetworkHint: true }
    )
  }

  const handleReply = (): void => {
    sendMessage('请继续完成当前任务的后续工作。', { skipNetworkHint: true })
  }

  const handleCopyChanges = (): void => {
    const text = changeRows.map((r) => `${r.fileName}: +${r.additions} -${r.deletions}`).join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleCommit = (): void => {
    const fileList = changeRows.map((r) => r.fileName).join(', ')
    sendMessage(
      `请使用 git_operations 工具提交当前更改。${projectPath ? `仓库路径：${projectPath}` : ''}\n\n涉及的文件：${fileList}\n\n请先 git add 这些文件，然后 git commit，提交信息请根据变更内容自动生成。`,
      { skipNetworkHint: true }
    )
  }

  return (
    <div className="border-t border-border-subtle glass px-4 py-2">
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={handleUndo}
          className="icon-btn flex h-8 w-8 items-center justify-center rounded-full border border-border"
          title="撤销更改 (Git checkout)"
        >
          <Undo2 size={14} />
        </button>
        <button
          onClick={handleRedo}
          className="icon-btn flex h-8 w-8 items-center justify-center rounded-full border border-border"
          title="重做 (Git stash pop)"
        >
          <RotateCcw size={14} />
        </button>
        <button
          onClick={handleReply}
          className="icon-btn flex h-8 w-8 items-center justify-center rounded-full border border-border"
          title="继续任务"
        >
          <Reply size={14} />
        </button>
        <button
          onClick={handleCopyChanges}
          className="icon-btn flex h-8 w-8 items-center justify-center rounded-full border border-border"
          title="复制变更列表"
        >
          {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
        </button>
        <button
          onClick={handleCommit}
          className="chip flex h-8 items-center justify-center gap-1 rounded-full border-accent/30 bg-accent/10 px-3 text-accent hover:bg-accent/15 transition-all duration-200 hover:scale-105 active:scale-95"
          title="提交更改 (Git commit)"
        >
          <GitBranch size={13} />
          <span className="text-[11px]">提交</span>
        </button>
        <button
          onClick={() => setShowMore(!showMore)}
          className="icon-btn flex h-8 w-8 items-center justify-center rounded-full border border-border"
          title="更多操作"
        >
          <MoreHorizontal size={14} />
        </button>
        <span className="ml-2 text-[11px] text-text-muted">AI 可能会出错，请核实</span>
      </div>
      {showMore && (
        <div className="mt-2 flex items-center justify-center gap-2 animate-slide-up">
          <button
            onClick={() => {
              sendMessage(`请使用 git_operations 工具查看当前项目的状态。${projectPath ? `仓库路径：${projectPath}` : ''}`, { skipNetworkHint: true })
              setShowMore(false)
            }}
            className="btn-ghost rounded-lg px-2.5 py-1 text-[11px]"
          >
            <GitBranch size={11} /> Git Status
          </button>
          <button
            onClick={() => {
              sendMessage(`请使用 git_operations 工具查看当前项目的 diff。${projectPath ? `仓库路径：${projectPath}` : ''}`, { skipNetworkHint: true })
              setShowMore(false)
            }}
            className="btn-ghost rounded-lg px-2.5 py-1 text-[11px]"
          >
            <ExternalLink size={11} /> Git Diff
          </button>
          <button
            onClick={() => {
              const fileList = changeRows.map((r) => r.fileName).join(', ')
              sendMessage(`请使用 code_lint 工具检查以下文件的代码质量：${fileList}`, { skipNetworkHint: true })
              setShowMore(false)
            }}
            className="btn-ghost rounded-lg px-2.5 py-1 text-[11px]"
          >
            <Check size={11} /> 代码检查
          </button>
        </div>
      )}
    </div>
  )
}
