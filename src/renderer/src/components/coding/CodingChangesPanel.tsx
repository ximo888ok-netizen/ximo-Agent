// ── CodingChangesPanel — 右侧「变更」标签页 ────────────────────────────
// 变更摘要 + 检查点回溯 + Git 操作，从主内容区移入右侧面板（标签页 2）

import { useState, useRef, useEffect, useMemo } from 'react'
import {
  ChevronDown, ArrowRight, Undo2, RotateCcw, Reply, Copy, Check,
  GitBranch, ExternalLink, FileDiff,
} from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { extractChangeRows } from './change-rows'
import { CheckpointViewer } from './CheckpointViewer'

/** 右侧「变更」标签页 — 变更摘要 / 检查点回溯 / Git 操作 */
export function CodingChangesPanel(): React.ReactElement {
  const conversation = useStore((s) => s.conversations.find((c) => c.id === s.currentConversationId) ?? null)
  const currentConversationId = useStore((s) => s.currentConversationId)
  const projectPath = useStore((s) => s.projectPath)
  const sendMessage = useStore((s) => s.sendMessage)

  const changeRows = useMemo(() => {
    if (!conversation?.messages) return []
    return extractChangeRows(conversation.messages)
  }, [conversation?.messages])

  const [showDiffList, setShowDiffList] = useState(true)
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current) }
  }, [])

  const totalAdditions = changeRows.reduce((sum, r) => sum + r.additions, 0)
  const totalDeletions = changeRows.reduce((sum, r) => sum + r.deletions, 0)
  const hasChanges = changeRows.length > 0

  const gitHint = projectPath ? `仓库路径：${projectPath}` : ''

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
    void sendMessage(
      `请使用 git_operations 工具提交当前更改。${gitHint}\n\n涉及的文件：${fileList}\n\n请先 git add 这些文件，然后 git commit，提交信息请根据变更内容自动生成。`,
      { skipNetworkHint: true }
    )
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5 space-y-3">
        {/* ── 变更摘要 ── */}
        <section className="overflow-hidden rounded-xl border border-border-subtle bg-bg-surface/40">
          <button
            onClick={() => setShowDiffList(!showDiffList)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-bg-hover"
          >
            <FileDiff size={13} className="shrink-0 text-accent" />
            <span className="shrink-0 text-xs font-medium text-text-secondary">变更摘要</span>
            {hasChanges && (
              <>
                <span className="shrink-0 text-[10px] text-text-muted">{changeRows.length} 个文件</span>
                <span className="shrink-0 font-mono text-[10px] text-green-400">+{totalAdditions}</span>
                <span className="shrink-0 font-mono text-[10px] text-red-400">-{totalDeletions}</span>
              </>
            )}
            <span className="ml-auto shrink-0 text-text-muted">
              <ChevronDown size={12} className={`transition-transform ${showDiffList ? 'rotate-180' : ''}`} />
            </span>
          </button>

          {showDiffList && (
            <div className="border-t border-border-subtle/50">
              {hasChanges ? (
                <ul className="max-h-52 overflow-y-auto py-1">
                  {changeRows.map((row, idx) => (
                    <li
                      key={idx}
                      className="flex items-center gap-2 px-3 py-1 text-[11px] transition-colors hover:bg-bg-hover"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-text-primary" title={row.fileName}>{row.fileName}</span>
                      <span className="shrink-0 text-[10px] text-text-muted">{row.changeDesc}</span>
                      <span className="shrink-0 font-mono text-[10px] text-green-400">+{row.additions}</span>
                      <span className="shrink-0 font-mono text-[10px] text-red-400">-{row.deletions}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-3 py-4 text-center text-[11px] text-text-muted">暂无文件变更</div>
              )}
              {hasChanges && (
                <div className="border-t border-border-subtle/50 px-3 py-1.5">
                  <button
                    onClick={() => void sendMessage(`请使用 git_operations 工具查看当前项目的 diff 详细信息。${gitHint}`, { skipNetworkHint: true })}
                    className="flex w-full items-center justify-center gap-1 rounded-lg py-1 text-[11px] text-accent transition-colors hover:bg-accent/10"
                  >
                    <ArrowRight size={11} />
                    查看详细 Diff
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── 检查点回溯 ── */}
        {currentConversationId && <CheckpointViewer sessionId={currentConversationId} />}
      </div>

      {/* ── Git 操作区 ── */}
      {hasChanges && (
        <div className="shrink-0 space-y-2 border-t border-border-subtle px-3 py-2.5">
          <div className="grid grid-cols-4 gap-1.5">
            <ActionIconBtn title="撤销更改 (Git checkout)" onClick={() => void sendMessage(`请使用 git_operations 工具撤销最近的文件更改。${gitHint}\n\n请先查看 git status，然后用 git checkout 撤销工作区修改。操作前请先确认。`, { skipNetworkHint: true })}>
              <Undo2 size={13} />
            </ActionIconBtn>
            <ActionIconBtn title="重做 (Git stash pop)" onClick={() => void sendMessage(`请使用 git_operations 工具恢复最近撤销的更改。${gitHint}\n\n请先查看 git stash list，然后用 git stash pop 恢复。`, { skipNetworkHint: true })}>
              <RotateCcw size={13} />
            </ActionIconBtn>
            <ActionIconBtn title="继续任务" onClick={() => void sendMessage('请继续完成当前任务的后续工作。', { skipNetworkHint: true })}>
              <Reply size={13} />
            </ActionIconBtn>
            <ActionIconBtn title="复制变更列表" onClick={handleCopyChanges}>
              {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
            </ActionIconBtn>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <ActionSmallBtn onClick={() => void sendMessage(`请使用 git_operations 工具查看当前项目的状态。${gitHint}`, { skipNetworkHint: true })}>
              <GitBranch size={11} /> 状态
            </ActionSmallBtn>
            <ActionSmallBtn onClick={() => void sendMessage(`请使用 git_operations 工具查看当前项目的 diff。${gitHint}`, { skipNetworkHint: true })}>
              <ExternalLink size={11} /> Diff
            </ActionSmallBtn>
            <ActionSmallBtn onClick={() => {
              const fileList = changeRows.map((r) => r.fileName).join(', ')
              void sendMessage(`请使用 code_lint 工具检查以下文件的代码质量：${fileList}`, { skipNetworkHint: true })
            }}>
              <Check size={11} /> 检查
            </ActionSmallBtn>
          </div>
          <button
            onClick={handleCommit}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 py-1.5 text-[11px] font-medium text-accent transition-all duration-200 hover:bg-accent/15 active:scale-[0.98]"
            title="提交更改 (Git commit)"
          >
            <GitBranch size={12} />
            提交更改
          </button>
        </div>
      )}
    </div>
  )
}

/** 方形图标操作按钮 */
function ActionIconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }): React.ReactElement {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-8 items-center justify-center rounded-lg border border-border bg-bg-surface/60 text-text-secondary transition-all duration-200 hover:bg-bg-hover hover:text-text-primary active:scale-95"
    >
      {children}
    </button>
  )
}

/** 小型文字操作按钮 */
function ActionSmallBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-1 rounded-lg border border-border bg-bg-surface/60 py-1 text-[10px] text-text-muted transition-all duration-200 hover:bg-bg-hover hover:text-text-primary active:scale-95"
    >
      {children}
    </button>
  )
}
