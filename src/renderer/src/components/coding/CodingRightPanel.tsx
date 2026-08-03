import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  FileText, SearchCode, GitBranch, CheckCircle, FolderSearch, Bug, FlaskConical,
  FolderTree, Sparkles, Package, FolderOpen, RefreshCw, Loader2, Search,
  ChevronRight, ChevronDown, Folder, FileCode, FileJson, File,
} from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import type { FileTreeNode } from '@shared/types'
import { FileEditorPanel } from './FileEditorPanel'
import { FileTreeContextMenu, type ContextMenuState } from './FileTreeContextMenu'

interface ContextEntry {
  id: string
  label: string
  icon: typeof FileText
  subtitle: string
  prompt: string
}

const CODING_ENTRIES: ContextEntry[] = [
  { id: 'file-read', label: '读取文件', icon: FileText, subtitle: '查看项目文件内容', prompt: '请使用 file_read 工具读取以下文件的内容：[文件路径]' },
  { id: 'file-search', label: '搜索文件', icon: SearchCode, subtitle: '在项目中搜索关键词', prompt: '请使用 file_search 工具搜索项目中包含 [关键词] 的文件。' },
  { id: 'file-list', label: '项目结构', icon: FolderTree, subtitle: '查看项目目录树', prompt: '请使用 file_list 工具列出当前项目的目录结构。' },
  { id: 'git-status', label: 'Git 状态', icon: GitBranch, subtitle: '查看当前分支和变更', prompt: '请使用 git_operations 工具查看当前项目的 Git 状态和最近提交。' },
  { id: 'code-lint', label: '代码检查', icon: CheckCircle, subtitle: '检查代码质量与规范', prompt: '请使用 code_lint 工具检查当前项目的代码质量。' },
  { id: 'code-format', label: '格式化代码', icon: Sparkles, subtitle: 'Prettier + ESLint 自动修复', prompt: '请使用 code_format 工具格式化当前项目的代码（先 prettier 再 eslint --fix）。' },
  { id: 'dep-check', label: '依赖检查', icon: Package, subtitle: '检查缺失依赖并安装', prompt: '请使用 dependency_check 工具检查当前项目的依赖是否完整，并列出缺失的包。' },
  { id: 'bug-fix', label: '修复 Bug', icon: Bug, subtitle: '定位问题并给出修复', prompt: '请帮我检查当前项目中可能存在的 Bug，定位问题并给出修复方案。' },
  { id: 'run-tests', label: '运行测试', icon: FlaskConical, subtitle: '执行单元测试', prompt: '请帮我运行当前项目的单元测试，并报告测试结果。' },
  { id: 'scan-project', label: '扫描项目', icon: FolderSearch, subtitle: '分析项目架构和技术栈', prompt: '请使用 project_context 工具扫描当前项目目录，帮我了解项目架构和技术栈。' },
]

/** 编程模式右侧面板 — 有项目时显示文件树，无项目时显示编码工具入口 */
export function CodingRightPanel({ hasConversation }: { hasConversation: boolean }): React.ReactElement {
  const projectPath = useStore((s) => s.projectPath)
  if (projectPath) return <ProjectFileTreePanel projectPath={projectPath} />
  return <CodingEntriesPanel />
}

/** 无项目时的编码工具入口面板 */
function CodingEntriesPanel(): React.ReactElement {
  const sendMessage = useStore((s) => s.sendMessage)
  return (
    <aside className="flex h-full w-full flex-col border-l border-border-subtle glass">
      <div className="px-4 pt-5 pb-3">
        <h3 className="text-sm font-semibold tracking-tight text-text-primary">编码工具</h3>
        <p className="mt-1 text-xs text-text-muted">快速执行编码操作</p>
      </div>
      <div className="flex-1 px-3 space-y-2 overflow-y-auto pb-3">
        {CODING_ENTRIES.map((entry, idx) => {
          const IconCmp = entry.icon
          return (
            <button
              key={entry.id}
              onClick={() => sendMessage(entry.prompt, { skipNetworkHint: true })}
              className="ios-card group flex w-full items-center gap-3 p-3 text-left animate-slide-up"
              style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'backwards' }}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent transition-all duration-300 group-hover:bg-accent/20 group-hover:shadow-glow group-hover:scale-105">
                <IconCmp size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">{entry.label}</p>
                <p className="text-[11px] text-text-muted">{entry.subtitle}</p>
              </div>
            </button>
          )
        })}
      </div>
      <div className="flex-shrink-0 border-t border-border-subtle px-3 py-2.5">
        <div className="ios-card border-dashed flex items-center gap-2.5 px-3 py-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg text-text-muted"><FolderSearch size={13} /></span>
          <p className="text-[11px] text-text-muted">打开项目后显示文件树</p>
        </div>
      </div>
    </aside>
  )
}

/** 有项目时的文件树面板 */
function ProjectFileTreePanel({ projectPath }: { projectPath: string }): React.ReactElement {
  const conversations = useStore((s) => s.conversations)
  const currentConversationId = useStore((s) => s.currentConversationId)
  const [tree, setTree] = useState<FileTreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const conversation = conversations.find((c) => c.id === currentConversationId)

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
          if (node.name.toLowerCase().includes(query)) result.push(node)
        }
      }
      return result
    }
    return filter(tree)
  }, [tree, searchQuery])

  const lastFileOpTimestamp = useMemo(() => {
    if (!conversation) return 0
    for (let i = conversation.messages.length - 1; i >= 0; i--) {
      const msg = conversation.messages[i]
      if (msg.role === 'assistant' && msg.toolResults) {
        const hasFileOp = msg.toolResults.some((r) => r.toolName === 'file_write' || r.toolName === 'file_edit' || r.toolName === 'file_delete')
        if (hasFileOp) return msg.timestamp
      }
    }
    return 0
  }, [conversation])

  const fetchTree = useCallback(() => {
    setLoading(true); setError(null)
    window.api.fs.listDir(projectPath, 3)
      .then((nodes) => { setTree(nodes); setLoading(false) })
      .catch((err) => { setError(err instanceof Error ? err.message : String(err)); setLoading(false) })
  }, [projectPath])

  useEffect(() => { fetchTree() }, [fetchTree, lastFileOpTimestamp])

  const projectName = projectPath.split(/[/\\]/).pop() || projectPath

  const handleFileClick = (filePath: string) => setEditingFile(filePath)
  const handleContextMenu = (e: React.MouseEvent, node: FileTreeNode) => {
    e.preventDefault(); e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, filePath: node.path, isDir: node.type === 'directory' })
  }

  return (
    <>
      {editingFile ? (
        <FileEditorPanel filePath={editingFile} onBack={() => setEditingFile(null)} onSaved={fetchTree} />
      ) : (
        <aside className="flex h-full w-full flex-col border-l border-border-subtle glass">
          <div className="flex items-center justify-between px-3 pt-4 pb-2 border-b border-border-subtle shrink-0">
            <div className="flex min-w-0 items-center gap-2">
              <FolderOpen size={14} className="shrink-0 text-accent" />
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-text-primary" title={projectPath}>{projectName}</p>
                <p className="truncate text-[10px] text-text-muted" title={projectPath}>{projectPath}</p>
              </div>
            </div>
            <button onClick={fetchTree} disabled={loading} className="icon-btn rounded-lg p-1.5 disabled:opacity-30" title="刷新文件树">
              {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            </button>
          </div>

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

          <div className="flex-1 overflow-y-auto py-1">
            {error ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-red-400">{error}</p>
                <button onClick={fetchTree} className="btn-ghost mt-2 rounded-lg px-3 py-1 text-[11px]">重试</button>
              </div>
            ) : loading && tree.length === 0 ? (
              <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-text-muted" /></div>
            ) : filteredTree.length === 0 ? (
              <div className="px-4 py-8 text-center"><p className="text-xs text-text-muted">{searchQuery.trim() ? '无匹配文件' : '目录为空'}</p></div>
            ) : (
              <FileTreeList nodes={filteredTree} depth={0} onFileClick={handleFileClick} onContextMenu={handleContextMenu} forceExpand={!!searchQuery.trim()} />
            )}
          </div>
        </aside>
      )}

      <FileTreeContextMenu state={contextMenu} onClose={() => setContextMenu(null)} onRefresh={fetchTree} onEdit={(path) => setEditingFile(path)} />
    </>
  )
}

/** 递归文件树列表 */
function FileTreeList({ nodes, depth, onFileClick, onContextMenu, forceExpand = false }: {
  nodes: FileTreeNode[]
  depth: number
  onFileClick: (path: string) => void
  onContextMenu?: (e: React.MouseEvent, node: FileTreeNode) => void
  forceExpand?: boolean
}): React.ReactElement {
  return (
    <>{nodes.map((node) => (
      <FileTreeItem key={node.path} node={node} depth={depth} onFileClick={onFileClick} onContextMenu={onContextMenu} forceExpand={forceExpand} />
    ))}</>
  )
}

/** 单个文件树节点 */
function FileTreeItem({ node, depth, onFileClick, onContextMenu, forceExpand = false }: {
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
        {isDir ? (expanded ? <ChevronDown size={11} className="shrink-0 text-text-muted" /> : <ChevronRight size={11} className="shrink-0 text-text-muted" />) : <span className="w-[11px] shrink-0" />}
        {isDir ? (expanded ? <FolderOpen size={13} className="shrink-0 text-accent" /> : <Folder size={13} className="shrink-0 text-accent" />) : <FileIcon size={13} className="shrink-0 text-text-muted" />}
        <span className={`truncate ${isDir ? 'text-text-secondary font-medium' : 'text-text-primary'}`}>{node.name}</span>
        {!isDir && node.size !== undefined && node.size > 0 && (
          <span className="ml-auto shrink-0 text-[9px] text-text-muted">{node.size > 1024 ? `${(node.size / 1024).toFixed(1)}K` : `${node.size}B`}</span>
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
