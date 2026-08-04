import { useState, useMemo, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderOpen, FileCode, FileJson, RefreshCw, Loader2, File, Search, FolderSearch } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { FileTreeNode } from '@shared/types'
import { FileEditorPanel } from '../coding/FileEditorPanel'
import { FileTreeContextMenu, type ContextMenuState } from '../coding/FileTreeContextMenu'

/** 有项目时的文件树面板 */
export function ProjectFileTreePanel({ projectPath }: { projectPath: string }): React.ReactElement {
  const conversations = useStore((s) => s.conversations)
  const currentConversationId = useStore((s) => s.currentConversationId)

  const [tree, setTree] = useState<FileTreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const conversation = conversations.find((c) => c.id === currentConversationId)

  // 递归过滤文件树 — 匹配文件名或目录名（含子节点匹配则保留父目录）
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return tree
    const query = searchQuery.toLowerCase()
    const filter = (nodes: FileTreeNode[]): FileTreeNode[] => {
      const result: FileTreeNode[] = []
      for (const node of nodes) {
        if (node.type === 'directory') {
          const filteredChildren = node.children ? filter(node.children) : []
          if (filteredChildren.length > 0 || node.name.toLowerCase().includes(query)) {
            result.push({ ...node, children: filteredChildren, type: 'directory' })
          }
        } else {
          if (node.name.toLowerCase().includes(query)) {
            result.push(node)
          }
        }
      }
      return result
    }
    return filter(tree)
  }, [tree, searchQuery])

  // 监听 agent 文件操作，自动刷新文件树
  const lastFileOpTimestamp = useMemo(() => {
    if (!conversation) return 0
    for (let i = conversation.messages.length - 1; i >= 0; i--) {
      const msg = conversation.messages[i]
      if (msg.role === 'assistant' && msg.toolResults) {
        const hasFileOp = msg.toolResults.some(
          (r) => r.toolName === 'file_write' || r.toolName === 'file_edit' || r.toolName === 'file_delete'
        )
        if (hasFileOp) return msg.timestamp
      }
    }
    return 0
  }, [conversation])

  const fetchTree = useCallback(() => {
    setLoading(true)
    setError(null)
    window.api.fs.listDir(projectPath, 3)
      .then((nodes) => { setTree(nodes); setLoading(false) })
      .catch((err) => { setError(err instanceof Error ? err.message : String(err)); setLoading(false) })
  }, [projectPath])

  // 项目路径变化或 agent 修改文件后自动刷新
  useEffect(() => {
    fetchTree()
  }, [fetchTree, lastFileOpTimestamp])

  const projectName = projectPath.split(/[/\\]/).pop() || projectPath

  const handleFileClick = (filePath: string) => {
    setEditingFile(filePath)
  }

  const handleContextMenu = (e: React.MouseEvent, node: FileTreeNode) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      filePath: node.path,
      isDir: node.type === 'directory'
    })
  }

  return (
    <>
      {/* 文件编辑器 — 打开时完全覆盖文件树 */}
      {editingFile ? (
        <FileEditorPanel
          filePath={editingFile}
          onBack={() => setEditingFile(null)}
          onSaved={fetchTree}
        />
      ) : (
        <aside className="flex h-full w-full flex-col border-l border-border-subtle glass">
          {/* 头部 — 项目名 + 刷新 */}
          <div className="flex items-center justify-between px-3 pt-4 pb-2 border-b border-border-subtle shrink-0">
            <div className="flex min-w-0 items-center gap-2">
              <FolderOpen size={14} className="shrink-0 text-accent" />
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-text-primary" title={projectPath}>{projectName}</p>
                <p className="truncate text-[10px] text-text-muted" title={projectPath}>{projectPath}</p>
              </div>
            </div>
            <button
              onClick={fetchTree}
              disabled={loading}
              className="icon-btn rounded-lg p-1.5 disabled:opacity-30"
              title="刷新文件树"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            </button>
          </div>

          {/* 搜索框 */}
          <div className="px-3 py-2 border-b border-border-subtle shrink-0">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索文件..."
                className="w-full rounded-lg bg-bg-elevated/60 border border-border-subtle pl-7 pr-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/40 focus:bg-bg-elevated"
              />
            </div>
          </div>

          {/* 文件树主体 */}
          <div className="flex-1 overflow-y-auto py-1">
            {error ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-red-400">{error}</p>
                <button onClick={fetchTree} className="btn-ghost mt-2 rounded-lg px-3 py-1 text-[11px]">重试</button>
              </div>
            ) : loading && tree.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-text-muted" />
              </div>
            ) : filteredTree.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-text-muted">{searchQuery.trim() ? '无匹配文件' : '目录为空'}</p>
              </div>
            ) : (
              <FileTreeList nodes={filteredTree} depth={0} onFileClick={handleFileClick} onContextMenu={handleContextMenu} forceExpand={!!searchQuery.trim()} />
            )}
          </div>
        </aside>
      )}

      {/* 右键菜单 */}
      <FileTreeContextMenu
        state={contextMenu}
        onClose={() => setContextMenu(null)}
        onRefresh={fetchTree}
        onEdit={(path) => setEditingFile(path)}
      />
    </>
  )
}

/** 递归文件树列表 */
function FileTreeList({
  nodes,
  depth,
  onFileClick,
  onContextMenu,
  forceExpand = false
}: {
  nodes: FileTreeNode[]
  depth: number
  onFileClick: (path: string) => void
  onContextMenu?: (e: React.MouseEvent, node: FileTreeNode) => void
  forceExpand?: boolean
}): React.ReactElement {
  return (
    <>
      {nodes.map((node) => (
        <FileTreeItem key={node.path} node={node} depth={depth} onFileClick={onFileClick} onContextMenu={onContextMenu} forceExpand={forceExpand} />
      ))}
    </>
  )
}

/** 单个文件树节点 */
function FileTreeItem({
  node,
  depth,
  onFileClick,
  onContextMenu,
  forceExpand = false
}: {
  node: FileTreeNode
  depth: number
  onFileClick: (path: string) => void
  onContextMenu?: (e: React.MouseEvent, node: FileTreeNode) => void
  forceExpand?: boolean
}): React.ReactElement {
  const [expanded, setExpanded] = useState(depth === 0 || forceExpand)
  const isDir = node.type === 'directory'
  const paddingLeft = 8 + depth * 14

  const FileIcon = getFileIcon(node.name)

  return (
    <>
      <button
        onClick={() => (isDir ? setExpanded(!expanded) : onFileClick(node.path))}
        onContextMenu={(e) => onContextMenu?.(e, node)}
        className="flex w-full items-center gap-1.5 py-[3px] text-left text-xs transition-colors hover:bg-bg-hover"
        style={{ paddingLeft: `${paddingLeft}px`, paddingRight: '8px' }}
        title={node.path}
      >
        {isDir ? (
          expanded ? (
            <ChevronDown size={11} className="shrink-0 text-text-muted" />
          ) : (
            <ChevronRight size={11} className="shrink-0 text-text-muted" />
          )
        ) : (
          <span className="w-[11px] shrink-0" />
        )}
        {isDir ? (
          expanded ? (
            <FolderOpen size={13} className="shrink-0 text-accent" />
          ) : (
            <Folder size={13} className="shrink-0 text-accent" />
          )
        ) : (
          <FileIcon size={13} className="shrink-0 text-text-muted" />
        )}
        <span className={`truncate ${isDir ? 'text-text-secondary font-medium' : 'text-text-primary'}`}>
          {node.name}
        </span>
        {!isDir && node.size !== undefined && node.size > 0 && (
          <span className="ml-auto shrink-0 text-[9px] text-text-muted">
            {node.size > 1024 ? `${(node.size / 1024).toFixed(1)}K` : `${node.size}B`}
          </span>
        )}
      </button>
      {isDir && expanded && node.children && node.children.length > 0 && (
        <FileTreeList nodes={node.children} depth={depth + 1} onFileClick={onFileClick} onContextMenu={onContextMenu} forceExpand={forceExpand} />
      )}
    </>
  )
}

/** 根据文件扩展名返回对应图标 */
function getFileIcon(fileName: string): typeof File {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const codeExts = ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'cs', 'rb', 'php', 'swift', 'kt', 'vue', 'svelte', 'html', 'css', 'scss', 'less']
  if (codeExts.includes(ext)) return FileCode
  if (ext === 'json') return FileJson
  return File
}
