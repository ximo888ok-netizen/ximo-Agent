import { useState, useEffect, useRef, useCallback } from 'react'
import { Copy, Scissors, Trash2, Edit3, Clipboard, FolderInput, FilePlus, FolderPlus, Terminal } from 'lucide-react'

export interface ContextMenuState {
  x: number
  y: number
  filePath: string
  isDir: boolean
}

interface FileTreeContextMenuProps {
  state: ContextMenuState | null
  onClose: () => void
  onRefresh: () => void
  onEdit?: (filePath: string) => void
}

/** 剪贴板状态 — 在模块级别共享，支持跨实例粘贴 */
interface ClipboardData {
  path: string
  isCut: boolean
}
let clipboardData: ClipboardData | null = null

/** 文件树右键菜单 — 复制/剪切/删除/重命名/复制路径 */
export function FileTreeContextMenu({ state, onClose, onRefresh, onEdit }: FileTreeContextMenuProps): React.ReactElement | null {
  const menuRef = useRef<HTMLDivElement>(null)
  const [renameMode, setRenameMode] = useState(false)
  const [newName, setNewName] = useState('')
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const inputRef = useRef<HTMLInputElement>(null)

  // 调整菜单位置 — 防止超出屏幕边界
  useEffect(() => {
    if (!state) return
    const menuWidth = 180
    const menuHeight = 220
    const x = Math.min(state.x, window.innerWidth - menuWidth - 8)
    const y = Math.min(state.y, window.innerHeight - menuHeight - 8)
    setPos({ x, y })
    setRenameMode(false)
  }, [state])

  // 点击外部关闭
  useEffect(() => {
    if (!state) return
    const handleClick = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    // 延迟绑定，避免触发右键的事件立即关闭菜单
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleEsc)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [state, onClose])

  // 重命名模式自动聚焦
  useEffect(() => {
    if (renameMode && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [renameMode])

  const copyPath = useCallback(async () => {
    if (!state) return
    await navigator.clipboard.writeText(state.filePath)
    onClose()
  }, [state, onClose])

  const handleCopy = useCallback(() => {
    if (!state) return
    clipboardData = { path: state.filePath, isCut: false }
    onClose()
  }, [state, onClose])

  const handleCut = useCallback(() => {
    if (!state) return
    clipboardData = { path: state.filePath, isCut: true }
    onClose()
  }, [state, onClose])

  const handlePaste = useCallback(async () => {
    if (!state || !clipboardData) return
    const srcPath = clipboardData.path
    const fileName = srcPath.split(/[/\\]/).pop() || srcPath
    // 粘贴到目标目录（如果右键的是文件，粘贴到同级目录）
    const destDir = state.isDir ? state.filePath : state.filePath.split(/[/\\]/).slice(0, -1).join('/')
    const destPath = `${destDir}/${fileName}`

    if (clipboardData.isCut) {
      const result = await window.api.fs.renameFile(srcPath, destPath)
      if (!result.success) {
        alert(result.error)
      }
      clipboardData = null
    } else {
      const result = await window.api.fs.copyFile(srcPath, destPath)
      if (!result.success) {
        alert(result.error)
      }
    }
    onRefresh()
    onClose()
  }, [state, onClose, onRefresh])

  const handleDelete = useCallback(async () => {
    if (!state) return
    const fileName = state.filePath.split(/[/\\]/).pop() || state.filePath
    if (!confirm(`确定删除「${fileName}」？${state.isDir ? '该目录下所有内容将被删除。' : ''}`)) {
      onClose()
      return
    }
    const result = await window.api.fs.deleteFile(state.filePath)
    if (!result.success) {
      alert(result.error)
    }
    onRefresh()
    onClose()
  }, [state, onClose, onRefresh])

  const startRename = useCallback(() => {
    if (!state) return
    const fileName = state.filePath.split(/[/\\]/).pop() || ''
    setNewName(fileName)
    setRenameMode(true)
  }, [state])

  const confirmRename = useCallback(async () => {
    if (!state || !newName.trim()) {
      setRenameMode(false)
      onClose()
      return
    }
    const parts = state.filePath.split(/[/\\]/)
    parts[parts.length - 1] = newName.trim()
    const newPath = parts.join('/')
    if (newPath !== state.filePath) {
      const result = await window.api.fs.renameFile(state.filePath, newPath)
      if (!result.success) {
        alert(result.error)
      }
      onRefresh()
    }
    setRenameMode(false)
    onClose()
  }, [state, newName, onClose, onRefresh])

  const [createMode, setCreateMode] = useState<'file' | 'folder' | null>(null)
  const [createName, setCreateName] = useState('')
  const createInputRef = useRef<HTMLInputElement>(null)

  const startCreate = useCallback((mode: 'file' | 'folder') => {
    setCreateMode(mode)
    setCreateName('')
    // 延迟聚焦等待渲染
    setTimeout(() => {
      createInputRef.current?.focus()
    }, 0)
  }, [])

  const confirmCreate = useCallback(async () => {
    if (!state || !createName.trim() || !createMode) {
      setCreateMode(null)
      return
    }
    const destDir = state.isDir ? state.filePath : state.filePath.split(/[/\\]/).slice(0, -1).join('/')
    const newPath = `${destDir}/${createName.trim()}`
    try {
      if (createMode === 'file') {
        const result = await window.api.fs.writeFile(newPath, '')
        if (!result.success) {
          alert(result.error)
        }
      } else {
        const result = await window.api.fs.createDir(newPath)
        if (!result.success) {
          alert(result.error)
        }
      }
      onRefresh()
    } catch (e) {
      alert(`创建失败：${(e as Error).message}`)
    }
    setCreateMode(null)
    onClose()
  }, [state, createName, createMode, onClose, onRefresh])

  const openInTerminal = useCallback(async () => {
    if (!state) return
    const dir = state.isDir ? state.filePath : state.filePath.split(/[/\\]/).slice(0, -1).join('/')
    // 复制目录路径到剪贴板 — 用户可在终端粘贴
    await navigator.clipboard.writeText(dir)
    onClose()
  }, [state, onClose])

  if (!state) return null

  const fileName = state.filePath.split(/[/\\]/).pop() || state.filePath
  const hasClipboard = !!clipboardData

  return (
    <div
      ref={menuRef}
      className="fixed z-[300] min-w-[180px] rounded-panel border border-border-subtle bg-bg-elevated py-1 shadow-2xl"
      style={{ left: pos.x, top: pos.y }}
    >
      {/* 文件名标题 */}
      <div className="truncate px-3 py-1.5 text-caption text-text-muted border-b border-border-subtle mb-1">
        {fileName}
      </div>

      {/* 编辑选项 — 仅文件 */}
      {!state.isDir && onEdit && (
        <MenuItem icon={Edit3} label="编辑文件" onClick={() => { onEdit(state.filePath); onClose() }} />
      )}

      {/* 新建文件/文件夹 — 目录时显示 */}
      {state.isDir && (
        <>
          {createMode === 'file' ? (
            <div className="px-3 py-1.5">
              <input
                ref={createInputRef}
                type="text"
                value={createName}
                placeholder="文件名"
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmCreate()
                  if (e.key === 'Escape') { setCreateMode(null); onClose() }
                }}
                onBlur={confirmCreate}
                className="w-full rounded-control border border-accent/40 bg-bg-base px-2 py-1 text-xs text-text-primary outline-none"
              />
            </div>
          ) : (
            <MenuItem icon={FilePlus} label="新建文件" onClick={() => startCreate('file')} />
          )}
          {createMode === 'folder' ? (
            <div className="px-3 py-1.5">
              <input
                ref={createInputRef}
                type="text"
                value={createName}
                placeholder="文件夹名"
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmCreate()
                  if (e.key === 'Escape') { setCreateMode(null); onClose() }
                }}
                onBlur={confirmCreate}
                className="w-full rounded-control border border-accent/40 bg-bg-base px-2 py-1 text-xs text-text-primary outline-none"
              />
            </div>
          ) : (
            <MenuItem icon={FolderPlus} label="新建文件夹" onClick={() => startCreate('folder')} />
          )}
          <div className="my-1 border-t border-border-subtle" />
        </>
      )}

      <MenuItem icon={Copy} label="复制" onClick={handleCopy} />
      <MenuItem icon={Scissors} label="剪切" onClick={handleCut} />
      <MenuItem icon={FolderInput} label="粘贴" onClick={handlePaste} disabled={!hasClipboard} />
      <div className="my-1 border-t border-border-subtle" />
      <MenuItem icon={Clipboard} label="复制路径" onClick={copyPath} />
      <MenuItem icon={Terminal} label="复制目录路径" onClick={openInTerminal} />

      {renameMode ? (
        <div className="px-3 py-1.5">
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmRename()
              if (e.key === 'Escape') { setRenameMode(false); onClose() }
            }}
            onBlur={confirmRename}
            className="w-full rounded-control border border-accent/40 bg-bg-base px-2 py-1 text-xs text-text-primary outline-none"
          />
        </div>
      ) : (
        <MenuItem icon={Edit3} label="重命名" onClick={startRename} />
      )}

      <div className="my-1 border-t border-border-subtle" />
      <MenuItem icon={Trash2} label="删除" onClick={handleDelete} danger />
    </div>
  )
}

/** 菜单项 */
function MenuItem({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  danger = false
}: {
  icon: typeof Copy
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed ${
        danger ? 'text-red-400 hover:bg-red-500/10' : 'text-text-primary'
      }`}
    >
      <Icon size={13} className="shrink-0" />
      {label}
    </button>
  )
}
