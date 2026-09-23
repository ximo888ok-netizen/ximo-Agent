import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'

/**
 * FileExplorer — 基于 file_list 工具结果渲染的文件树
 * 接收 file_list/ProjectContext 返回的文件列表，渲染树状结构
 * 支持目录折叠/展开
 */
interface TreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  children?: TreeNode[]
}

interface FileExplorerProps {
  tree: TreeNode[]
  rootPath: string
  onFileClick: (path: string) => void
  onCollapse: () => void
}

export function FileExplorer({ tree, rootPath, onFileClick, onCollapse }: FileExplorerProps): React.ReactElement {
  return (
    <div className="flex w-56 flex-col border-r border-border-subtle glass overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
        <span className="text-xs font-medium text-text-secondary truncate" title={rootPath}>
          📁 {rootPath.split(/[/\\]/).pop() || rootPath}
        </span>
        <button onClick={onCollapse} aria-label="收起文件浏览器" className="icon-btn rounded-control p-0.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        <TreeNodeList nodes={tree} depth={0} onFileClick={onFileClick} />
      </div>
    </div>
  )
}

function TreeNodeList({ nodes, depth, onFileClick }: { nodes: TreeNode[]; depth: number; onFileClick: (p: string) => void }): React.ReactElement {
  const sorted = [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return (
    <>
      {sorted.map((node) => (
        <TreeNodeItem key={node.path} node={node} depth={depth} onFileClick={onFileClick} />
      ))}
    </>
  )
}

function TreeNodeItem({ node, depth, onFileClick }: { node: TreeNode; depth: number; onFileClick: (p: string) => void }): React.ReactElement {
  const paddingLeft = 8 + depth * 12
  const isDir = node.type === 'directory'
  const [expanded, setExpanded] = useState(depth === 0)

  return (
    <>
      <button
        onClick={() => isDir ? setExpanded(!expanded) : onFileClick(node.path)}
        className={`flex w-full items-center gap-1.5 py-1 text-left text-xs transition-colors hover:bg-bg-hover ${
          isDir ? 'cursor-pointer' : 'cursor-pointer'
        }`}
        style={{ paddingLeft: `${paddingLeft}px`, paddingRight: '8px' }}
        title={node.path}
      >
        {isDir ? (
          expanded ? <ChevronDown size={11} className="shrink-0 text-text-muted" /> : <ChevronRight size={11} className="shrink-0 text-text-muted" />
        ) : (
          <span className="w-[11px] shrink-0" />
        )}
        <span className="shrink-0">{isDir ? (expanded ? '📂' : '📁') : '📄'}</span>
        <span className={`truncate ${isDir ? 'text-text-secondary font-medium' : 'text-text-primary'}`}>
          {node.name}
        </span>
      </button>
      {isDir && expanded && node.children && (
        <TreeNodeList nodes={node.children} depth={depth + 1} onFileClick={onFileClick} />
      )}
    </>
  )
}

export type { TreeNode }

/** 将 file_list 工具输出的文本解析为 TreeNode 数组 */
export function parseFileListing(text: string, basePath: string): TreeNode[] {
  const cleanBase = basePath.replace(/[\/\\]+$/, '')
  const lines = text.split('\n').filter((l) => l.startsWith('- ') || l.startsWith('  - '))
  const nodes: TreeNode[] = []
  const stack: TreeNode[] = []

  for (const line of lines) {
    const indent = line.search(/\S/) === -1 ? 0 : line.search(/[^-]/)
    const depth = Math.floor(indent / 2)
    const trimmed = line.replace(/^[\s-]*/, '').trim()
    const isDir = trimmed.startsWith('📁') || trimmed.endsWith('/')
    const name = isDir
      ? trimmed.replace(/^📁\s*/, '').replace(/\/$/, '')
      : trimmed.replace(/^📄\s*/, '').replace(/\s\(.*\)$/, '')

    const node: TreeNode = {
      name,
      path: cleanBase + '/' + name,
      type: isDir ? 'directory' : 'file'
    }

    while (stack.length > depth) stack.pop()

    if (isDir) {
      node.children = []
      if (depth === 0) {
        nodes.push(node)
      } else if (stack.length > 0) {
        const parent = stack[stack.length - 1]
        parent.children = parent.children || []
        parent.children.push(node)
      }
      stack.push(node)
    } else {
      if (depth === 0) {
        nodes.push(node)
      } else if (stack.length > 0) {
        const parent = stack[stack.length - 1]
        parent.children = parent.children || []
        parent.children.push(node)
      }
    }
  }

  return nodes
}
