import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { useStore } from '@renderer/store/useStore'
import { ensureAgentsLoaded } from '@renderer/agents'
import type { Mode } from '@shared/types'
import { useFileMention } from './useFileMention'
import { usePasteAndDrag } from './usePasteAndDrag'
import { getSlashCommands } from './constants'
import { buildSkillCommands, type SkillCommandEntry } from '@renderer/lib/skillCommands'

export interface SlashCommandEntry {
  cmd: string
  label: string
  systemHint: string
  /** 技能命令专属：技能 ID */
  skillId?: string
  /** 技能命令专属：技能描述（菜单展示用） */
  description?: string
}

interface UseChatActionsResult {
  text: string
  setText: (t: string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement>
  showSlashMenu: boolean
  activeSlashCmd: { cmd: string; systemHint: string } | null
  setActiveSlashCmd: (v: { cmd: string; systemHint: string } | null) => void
  /** 合并后的斜杠命令列表（内置 + 技能） */
  slashCommands: SlashCommandEntry[]
  /** 是否有技能命令 */
  hasSkillCommands: boolean
  showFileMention: boolean
  matchedFiles: ReturnType<typeof useFileMention>['matchedFiles']
  selectedMentionIndex: number
  setSelectedMentionIndex: (i: number) => void
  insertFileMention: (filePath: string) => void
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

  // 斜杠命令匹配 — 输入 "/" 时弹出菜单
  useEffect(() => { setShowSlashMenu(text === '/') }, [text])

  // 按需加载专家数据
  const activeExperts = useStore((s) => s.activeExperts)
  useEffect(() => {
    if (activeExperts.length > 0 && !agentsReady) ensureAgentsLoaded().then(() => setAgentsReady(true))
  }, [activeExperts.length, agentsReady])

  // ---- 导入技能斜杠命令 ----
  // 已启用的导入技能动态注册为 /技能名 命令，与内置命令合并展示
  const [skillCommands, setSkillCommands] = useState<SkillCommandEntry[]>([])
  const [hasSkillCommands, setHasSkillCommands] = useState(false)
  useEffect(() => {
    let cancelled = false
    const loadSkillCommands = async (): Promise<void> => {
      try {
        const skills = await window.api.importedSkills.load()
        if (cancelled) return
        const cmds = buildSkillCommands(skills)
        setSkillCommands(cmds)
        setHasSkillCommands(cmds.length > 0)
      } catch { /* 技能加载失败不应影响输入框 */ }
    }
    void loadSkillCommands()
    // 技能在面板中启用/禁用/导入后，输入框菜单应同步刷新
    window.addEventListener('ximo:skills-changed', loadSkillCommands)
    return () => {
      cancelled = true
      window.removeEventListener('ximo:skills-changed', loadSkillCommands)
    }
  }, [])

  // 合并后的斜杠命令列表（内置 + 技能）
  const slashCommands: SlashCommandEntry[] = useMemo(
    () => [...getSlashCommands(currentMode), ...skillCommands],
    [currentMode, skillCommands]
  )

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
    text, setText, textareaRef, showSlashMenu, activeSlashCmd, setActiveSlashCmd,
    slashCommands, hasSkillCommands,
    showFileMention, matchedFiles, selectedMentionIndex, setSelectedMentionIndex,
    insertFileMention, handleMentionKeyDown,
    isDragOver, handleDragOver, handleDragLeave, handleDrop,
    handleSend, handleKeyDown, handleSlashCommand, handleAttachFile,
  }
}
