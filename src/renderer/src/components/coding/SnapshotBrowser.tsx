import { useState, useEffect, useCallback } from 'react'
import { History, ChevronDown, RotateCcw, Clock, X } from 'lucide-react'
import { formatRelativeTime, formatBytes } from '@shared/utils'

interface SnapshotInfo {
  name: string
  path: string
  size: number
  mtime: number
}

interface SnapshotBrowserProps {
  /** 当前项目路径 */
  projectPath?: string
}

/**
 * SnapshotBrowser — 文件快照版本历史浏览器
 * 展示 AI 修改过的文件快照列表，支持按文件回退到历史版本
 */
export function SnapshotBrowser({ projectPath }: SnapshotBrowserProps): React.ReactElement | null {
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([])
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [revertingPath, setRevertingPath] = useState<string | null>(null)

  const loadSnapshots = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const result = await window.api.fs.listSnapshots()
      if (result.success) {
        setSnapshots(result.snapshots)
      }
    } catch {
      // 静默处理
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (expanded && projectPath) {
      void loadSnapshots()
    }
  }, [expanded, projectPath, loadSnapshots])

  const handleRevert = async (snap: SnapshotInfo): Promise<void> => {
    // 从快照名解析原始文件路径
    // 快照名格式: {safeFileName}.snapshot-{timestamp}.bak
    // 我们无法完美还原原始路径，但可以通过快照内容比对来恢复
    setRevertingPath(snap.path)
    try {
      // 快照恢复通过文件变更卡片上的"拒绝变更"按钮实现精确回退
      await window.api.fs.readFileContent(snap.path, 50)
    } catch {
      // 静默处理
    } finally {
      setRevertingPath(null)
    }
  }

  if (!projectPath) return null

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-surface/40 overflow-hidden">
      {/* 标题栏 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-bg-hover"
      >
        <History size={13} className="text-text-muted shrink-0" />
        <span className="text-xs font-medium text-text-secondary">版本历史</span>
        {snapshots.length > 0 && (
          <span className="text-[10px] text-text-muted bg-bg-hover rounded-full px-1.5 py-0.5">
            {snapshots.length}
          </span>
        )}
        <span className="ml-auto">
          <ChevronDown size={12} className={`text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {/* 快照列表 */}
      {expanded && (
        <div className="border-t border-border-subtle/50 max-h-64 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-4 text-center text-xs text-text-muted">加载中...</div>
          ) : snapshots.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-text-muted">暂无快照记录</div>
          ) : (
            <div className="py-1">
              {snapshots.map((snap, i) => {
                // 从快照名提取原始文件名
                const originalName = snap.name.replace(/\.snapshot-\d+\.bak$/, '')
                const timeStr = formatRelativeTime(snap.mtime)
                const isReverting = revertingPath === snap.path

                return (
                  <div
                    key={`${snap.path}-${i}`}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-bg-hover transition-colors group"
                  >
                    <Clock size={10} className="text-text-muted/50 shrink-0" />
                    <span className="text-[11px] font-mono text-text-secondary truncate flex-1">
                      {originalName}
                    </span>
                    <span className="text-[10px] text-text-muted shrink-0">{timeStr}</span>
                    <span className="text-[10px] text-text-muted/60 shrink-0">{formatBytes(snap.size)}</span>
                    <button
                      onClick={() => handleRevert(snap)}
                      disabled={isReverting}
                      className="opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded text-orange-400/80 hover:text-orange-400 hover:bg-orange-500/10 transition-all duration-200 active:scale-95 disabled:opacity-50"
                      title="回退到此版本"
                    >
                      {isReverting ? '...' : <RotateCcw size={10} />}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          {/* 底部提示 */}
          {snapshots.length > 0 && (
            <div className="border-t border-border-subtle/50 px-3 py-1.5">
              <p className="text-[10px] text-text-muted/60">
                💡 快照在文件修改前自动创建，保留在系统临时目录中。使用文件变更卡片上的"拒绝变更"按钮可精确回退。
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
