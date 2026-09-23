import { useEffect, useState } from 'react'
import { ChevronRight, FileText, Folder, Loader2, X } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import type { FileTreeNode } from '@shared/types'

const PREVIEW_MAX_LINES = 300

/**
 * OfficeFilePanel — 项目文件浏览与预览
 *
 * 走真实通道：`fs:listDir`（主进程 readdir 递归建树，默认 3 层、最多 5 层）
 * 与 `fs:readFileContent`（限 2MB / 指定行数）。未绑定项目目录时给出提示而非空白。
 */
export function OfficeFilePanel(): React.ReactElement {
  const projectPath = useStore((s) => s.projectPath)
  const [tree, setTree] = useState<FileTreeNode[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<{ path: string; content: string; error?: string } | null>(null)
  const [loadingFile, setLoadingFile] = useState(false)

  useEffect(() => {
    if (!projectPath) { setTree(null); setError(null); return }
    let cancelled = false
    setTree(null)
    setError(null)
    setPreview(null)
    void window.api.fs.listDir(projectPath, 3)
      .then((t) => { if (!cancelled) setTree(t) })
      .catch((e) => { if (!cancelled) setError((e as Error).message || '读取目录失败') })
    return () => { cancelled = true }
  }, [projectPath])

  const toggle = (path: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const openFile = async (path: string): Promise<void> => {
    setLoadingFile(true)
    try {
      const r = await window.api.fs.readFileContent(path, PREVIEW_MAX_LINES)
      setPreview(r.success ? { path, content: r.content ?? '' } : { path, content: '', error: r.error })
    } catch (e) {
      setPreview({ path, content: '', error: (e as Error).message })
    } finally {
      setLoadingFile(false)
    }
  }

  // ── 文件预览 ──
  if (preview) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-1.5 border-b border-border-subtle px-3 py-2 shrink-0">
          <button onClick={() => setPreview(null)} className="icon-btn rounded-control p-1" title="返回目录">
            <X size={13} />
          </button>
          <span className="flex-1 truncate text-xs text-text-secondary" title={preview.path}>
            {preview.path.split(/[/\\]/).pop()}
          </span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-3 py-2">
          {preview.error
            ? <p className="text-caption text-red-400">{preview.error}</p>
            : <pre className="whitespace-pre-wrap break-all font-mono text-caption leading-relaxed text-text-secondary">{preview.content}</pre>}
        </div>
      </div>
    )
  }

  // ── 目录树 ──
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border-subtle px-3 py-2 shrink-0">
        <span className="block truncate text-caption text-text-muted" title={projectPath}>
          {projectPath || '未绑定项目目录'}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-1.5 py-2">
        {!projectPath && <p className="px-2 py-1.5 text-caption text-text-muted">先在左侧栏绑定项目目录，再回来浏览文件。</p>}
        {error && <p className="px-2 py-1.5 text-caption text-red-400">{error}</p>}
        {projectPath && !tree && !error && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 text-caption text-text-muted">
            <Loader2 size={11} className="animate-spin" />读取目录…
          </div>
        )}
        {loadingFile && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 text-caption text-text-muted">
            <Loader2 size={11} className="animate-spin" />读取文件…
          </div>
        )}
        {tree?.map((node) => (
          <TreeRow key={node.path} node={node} depth={0} expanded={expanded} onToggle={toggle} onOpenFile={openFile} />
        ))}
      </div>
    </div>
  )
}

function TreeRow({
  node, depth, expanded, onToggle, onOpenFile,
}: {
  node: FileTreeNode
  depth: number
  expanded: Set<string>
  onToggle: (path: string) => void
  onOpenFile: (path: string) => Promise<void>
}): React.ReactElement {
  const isDir = node.type === 'directory'
  const isOpen = expanded.has(node.path)
  return (
    <>
      <button
        onClick={() => { if (isDir) onToggle(node.path); else void onOpenFile(node.path) }}
        className="flex w-full items-center gap-1.5 rounded-control py-1 pr-2 text-left text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary active:scale-[0.97]"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        title={node.path}
      >
        {isDir ? (
          <>
            <ChevronRight size={11} className={`shrink-0 text-text-muted transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            <Folder size={13} className="shrink-0 text-text-muted" />
          </>
        ) : (
          <FileText size={13} className="ml-[15px] shrink-0 text-text-muted" />
        )}
        <span className="flex-1 truncate text-xs">{node.name}</span>
      </button>
      {isDir && isOpen && node.children?.map((child) => (
        <TreeRow key={child.path} node={child} depth={depth + 1} expanded={expanded} onToggle={onToggle} onOpenFile={onOpenFile} />
      ))}
    </>
  )
}
