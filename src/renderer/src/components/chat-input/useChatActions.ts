import { useRef, useState, useEffect, useCallback } from 'react'
import { useStore } from '@renderer/store/useStore'
import { ensureAgentsLoaded } from '@renderer/agents'
import type { Mode } from '@shared/types'
import { useFileMention } from './useFileMention'
import { usePasteAndDrag } from './usePasteAndDrag'

interface UseChatActionsResult {
  text: string
  setText: (t: string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  showSlashMenu: boolean
  activeSlashCmd: { cmd: string; systemHint: string } | null
  showFileMention: boolean
  matchedFiles: ReturnType<typeof useFileMention>['matchedFiles']
  selectedMentionIndex: number
  setSelectedMentionIndex: (i: number) => void
  insertFileMention: () => void
  handleMentionKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean
  isDragOver: boolean
  handleDragOver: ReturnType<typeof usePasteAndDrag>['handleDragOver']
  handleDragLeave: ReturnType<typeof usePasteAndDrag>['handleDragLeave']
  handleDrop: ReturnType<typeof usePasteAndDrag>['handleDrop']
  handleSend: () => void
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  handleSlashCommand: (cmd: string, systemHint: string) => void
  handleAttachFile: () => Promise<void>
}

/** GlobalChatInput 的所有状态与事件逻辑 */
export function useChatActions(
  currentMode: Mode,
  isStreaming: boolean,
  sendMessage: (text: string, opts?: { slashCommand?: { cmd: string; systemHint: string } }) => void,
  pastedImagePaths: string[],
  addAttachedFile: (f: string) => void,
  addPastedImage: (f: string) => void,
  clearPastedImages: () => void,
  projectPath: string,
): UseChatActionsResult {
  const [textByMode, setTextByMode] = useState<Record<Mode, string>>({ office: '', coding: '', design: '' })
  const text = textByMode[currentMode]
  const setText = useCallback((t: string): void => setTextByMode((prev) => ({ ...prev, [currentMode]: t })), [currentMode])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [agentsReady, setAgentsReady] = useState(false)
  const [activeSlashCmd, setActiveSlashCmd] = useState<{ cmd: string; systemHint: string } | null>(null)

  const { showFileMention, matchedFiles, selectedMentionIndex, setSelectedMentionIndex, insertFileMention, handleMentionKeyDown } =
    useFileMention(textareaRef, text, setText, currentMode, projectPath)
  const { isDragOver, handleDragOver, handleDragLeave, handleDrop } =
    usePasteAndDrag(isStreaming, pastedImagePaths, addAttachedFile, addPastedImage, clearPastedImages)

  // textarea 自适应高度
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 180) + 'px'
  }, [text])

  // 拾取 pendingDraft
  const pendingDraft = useStore((s) => s.pendingDraft)
  const clearDraft = useStore((s) => s.clearDraft)
  useEffect(() => {
    if (pendingDraft !== null) {
      setText(pendingDraft.text)
      setActiveSlashCmd(pendingDraft.slashCommand ?? null)
      clearDraft()
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }, [pendingDraft, clearDraft, setText])

  // 斜杠命令匹配
  useEffect(() => { setShowSlashMenu(text === '/') }, [text])

  // 按需加载专家数据
  const activeExperts = useStore((s) => s.activeExperts)
  useEffect(() => {
    if (activeExperts.length > 0 && !agentsReady) ensureAgentsLoaded().then(() => setAgentsReady(true))
  }, [activeExperts.length, agentsReady])

  const handleSend = useCallback((): void => {
    if (isStreaming) return
    const trimmed = text.trim()
    if (!trimmed) return
    sendMessage(trimmed, activeSlashCmd ? { slashCommand: activeSlashCmd } : undefined)
    setText(''); setActiveSlashCmd(null); setShowSlashMenu(false)
  }, [isStreaming, text, activeSlashCmd, sendMessage, setText])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (handleMentionKeyDown(e)) return
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }, [handleMentionKeyDown, handleSend])

  const handleSlashCommand = useCallback((cmd: string, systemHint: string): void => {
    setActiveSlashCmd({ cmd, systemHint }); setText(''); setShowSlashMenu(false); textareaRef.current?.focus()
  }, [setText])

  const handleAttachFile = useCallback(async (): Promise<void> => {
    try {
      const filters = [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] },
        { name: 'All Files', extensions: ['*'] },
      ]
      const files = await window.api.dialog.openFile(filters)
      if (!files || !Array.isArray(files)) return
      for (const f of files) addAttachedFile(f)
    } catch { /* 用户取消或 IPC 异常 */ }
  }, [addAttachedFile])

  return {
    text, setText, textareaRef, showSlashMenu, activeSlashCmd,
    showFileMention, matchedFiles, selectedMentionIndex, setSelectedMentionIndex,
    insertFileMention, handleMentionKeyDown,
    isDragOver, handleDragOver, handleDragLeave, handleDrop,
    handleSend, handleKeyDown, handleSlashCommand, handleAttachFile,
  }
}
