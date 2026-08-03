import { useState, useEffect, useMemo, useCallback } from 'react'
import type { FileTreeNode, Mode } from '@shared/types'

/** 扁平化文件树为路径列表 */
function flattenTree(nodes: FileTreeNode[], prefix = ''): string[] {
  const result: string[] = []
  for (const node of nodes) {
    const fullPath = prefix ? `${prefix}/${node.name}` : node.name
    if (node.type === 'file') result.push(fullPath)
    if (node.children && node.children.length > 0) result.push(...flattenTree(node.children, fullPath))
  }
  return result
}

/** @file 引用 hook — 检测 @ 触发文件列表，键盘导航 */
export function useFileMention(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  text: string,
  setText: (t: string) => void,
  currentMode: Mode,
  projectPath: string,
): {
  showFileMention: boolean
  matchedFiles: string[]
  selectedMentionIndex: number
  setSelectedMentionIndex: React.Dispatch<React.SetStateAction<number>>
  insertFileMention: (filePath: string) => void
  handleMentionKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean
} {
  const [showFileMention, setShowFileMention] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [projectFiles, setProjectFiles] = useState<string[]>([])
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)

  useEffect(() => {
    if (currentMode !== 'coding' || !projectPath) { setProjectFiles([]); return }
    let cancelled = false
    const loadFiles = async (): Promise<void> => {
      try {
        const tree = await window.api.fs.listDir(projectPath)
        if (!cancelled && tree) setProjectFiles(flattenTree(tree))
      } catch { /* 静默处理 */ }
    }
    void loadFiles()
    return () => { cancelled = true }
  }, [projectPath, currentMode])

  useEffect(() => {
    if (currentMode !== 'coding' || !projectPath) { setShowFileMention(false); return }
    const ta = textareaRef.current
    if (!ta) return
    const cursorPos = ta.selectionStart
    const beforeCursor = text.slice(0, cursorPos)
    const atMatch = beforeCursor.match(/@([^\s@]*)$/)
    if (atMatch) {
      setMentionQuery(atMatch[1])
      setShowFileMention(true)
      setSelectedMentionIndex(0)
    } else {
      setShowFileMention(false)
    }
  }, [text, currentMode, projectPath, textareaRef])

  const matchedFiles = useMemo(() => {
    if (!mentionQuery) return projectFiles.slice(0, 10)
    const lower = mentionQuery.toLowerCase()
    return projectFiles.filter((f) => f.toLowerCase().includes(lower)).slice(0, 10)
  }, [mentionQuery, projectFiles])

  const insertFileMention = useCallback((filePath: string): void => {
    const ta = textareaRef.current
    if (!ta) return
    const cursorPos = ta.selectionStart
    const beforeCursor = text.slice(0, cursorPos)
    const afterCursor = text.slice(cursorPos)
    const newText = beforeCursor.replace(/@([^\s@]*)$/, `@${filePath} `) + afterCursor
    setText(newText)
    setShowFileMention(false)
    requestAnimationFrame(() => {
      ta.focus()
      const newPos = beforeCursor.replace(/@([^\s@]*)$/, `@${filePath} `).length
      ta.setSelectionRange(newPos, newPos)
    })
  }, [text, textareaRef, setText])

  const handleMentionKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (showFileMention && matchedFiles.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedMentionIndex((prev) => (prev + 1) % matchedFiles.length); return true }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedMentionIndex((prev) => (prev - 1 + matchedFiles.length) % matchedFiles.length); return true }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertFileMention(matchedFiles[selectedMentionIndex]); return true }
      if (e.key === 'Escape') { e.preventDefault(); setShowFileMention(false); return true }
    }
    return false
  }, [showFileMention, matchedFiles, selectedMentionIndex, insertFileMention])

  return { showFileMention, matchedFiles, selectedMentionIndex, setSelectedMentionIndex, insertFileMention, handleMentionKeyDown }
}
