import { useState, useEffect, useCallback, useRef } from 'react'
import { History, ChevronDown, RotateCcw, Clock, AlertCircle } from 'lucide-react'
import { formatRelativeTime } from '@shared/utils'

interface CheckpointInfo {
  turn: number
  time: number
  prompt: string
  paths: string[]
}

interface CheckpointViewerProps {
  sessionId: string
  onRestore?: (turn: number) => void
}

/**
 * CheckpointViewer — 版本回退浏览器
 * 参考 Reasonix 的 checkpoint picker：按用户轮次列出检查点，支持一键回退代码
 */
export function CheckpointViewer({ sessionId, onRestore }: CheckpointViewerProps): React.ReactElement | null {
  const [checkpoints, setCheckpoints] = useState<CheckpointInfo[]>([])
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState<number | null>(null)
  const [restoreResult, setRestoreResult] = useState<string | null>(null)
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (restoreTimerRef.current !== null) clearTimeout(restoreTimerRef.current)
    }
  }, [])

  const loadCheckpoints = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const result = await window.api.checkpoint.list(sessionId)
      if (result.success) {
        setCheckpoints(result.checkpoints)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    if (expanded && sessionId) {
      void loadCheckpoints()
    }
  }, [expanded, sessionId, loadCheckpoints])

  const handleRestore = async (turn: number): Promise<void> => {
    setRestoring(turn)
    setRestoreResult(null)
    try {
      const result = await window.api.checkpoint.restore(sessionId, turn)
      if (result.success) {
        const msg = `已回退到轮次 ${turn}：恢复 ${result.written.length} 个文件，删除 ${result.deleted.length} 个文件`
        setRestoreResult(msg)
        onRestore?.(turn)
        // 刷新列表
        await loadCheckpoints()
      }
    } catch (e) {
      setRestoreResult(`回退失败：${(e as Error).message}`)
    } finally {
      setRestoring(null)
      if (restoreTimerRef.current !== null) clearTimeout(restoreTimerRef.current)
      restoreTimerRef.current = setTimeout(() => setRestoreResult(null), 5000)
    }
  }

  if (!sessionId) return null

  return (
    <div className="rounded-panel border border-border-subtle bg-bg-surface-soft overflow-hidden">
      {/* 标题栏 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-bg-hover active:scale-[0.97]"
      >
        <History size={13} className="text-text-muted shrink-0" />
        <span className="text-xs font-medium text-text-secondary">检查点</span>
        {checkpoints.length > 0 && (
          <span className="text-caption text-text-muted bg-bg-hover rounded-full px-1.5 py-0.5">
            {checkpoints.length}
          </span>
        )}
        <span className="ml-auto">
          <ChevronDown size={13} className={`text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {/* 检查点列表 */}
      {expanded && (
        <div className="border-t border-border-subtle-soft max-h-64 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-4 text-center text-xs text-text-muted">加载中...</div>
          ) : checkpoints.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-text-muted">暂无检查点</div>
          ) : (
            <div className="py-1">
              {[...checkpoints].reverse().map((cp) => {
                const timeStr = formatRelativeTime(cp.time)
                const isRestoring = restoring === cp.turn
                const fileCount = cp.paths.length
                const promptPreview = cp.prompt.slice(0, 60) + (cp.prompt.length > 60 ? '...' : '')

                return (
                  <div
                    key={cp.turn}
                    className="px-3 py-1.5 hover:bg-bg-hover transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <Clock size={11} className="text-text-tertiary shrink-0" />
                      <span className="text-caption text-text-muted shrink-0">T{cp.turn}</span>
                      <span className="text-caption text-text-secondary truncate flex-1 font-mono">
                        {promptPreview || '(空)'}
                      </span>
                      <span className="text-caption text-text-muted shrink-0">{timeStr}</span>
                      <button
                        onClick={() => void handleRestore(cp.turn)}
                        disabled={isRestoring}
                        className="opacity-0 group-hover:opacity-100 text-caption px-1.5 py-0.5 rounded-control text-orange-400/80 hover:text-orange-400 hover:bg-orange-500/10 transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] duration-fast active:scale-95 disabled:opacity-50 flex items-center gap-1"
                        title={`回退到轮次 ${cp.turn}`}
                      >
                        {isRestoring ? '...' : <><RotateCcw size={11} /> 回退</>}
                      </button>
                    </div>
                    {fileCount > 0 && (
                      <div className="ml-7 mt-0.5 text-caption text-text-tertiary">
                        {cp.paths.slice(0, 3).map(p => p.split(/[/\\]/).pop()).join(', ')}
                        {fileCount > 3 && ` 等${fileCount}项`}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {/* 回退结果提示 */}
          {restoreResult && (
            <div className="border-t border-border-subtle-soft px-3 py-1.5 flex items-center gap-1.5">
              <AlertCircle size={11} className="text-orange-400 shrink-0" />
              <span className="text-caption text-text-muted">{restoreResult}</span>
            </div>
          )}
          {/* 底部提示 */}
          {checkpoints.length > 0 && (
            <div className="border-t border-border-subtle-soft px-3 py-1.5">
              <p className="text-caption text-text-tertiary">
                检查点在每次用户消息时自动创建，记录文件修改前的状态。回退将恢复代码到该轮次开始时的状态。
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
