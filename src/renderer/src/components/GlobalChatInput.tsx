import { useEffect, useState, useRef } from 'react'
import { useStore } from '@renderer/store/useStore'
import { SessionTokenStats } from './shared/SessionTokenStats'
import { MODE_PLACEHOLDERS } from './chat-input/constants'
import { ExpertPicker } from './chat-input/ExpertPicker'
import { StylePicker } from './chat-input/StylePicker'
import { ComponentPicker } from './chat-input/ComponentPicker'
import { ChatChips } from './chat-input/ChatChips'
import { FileMentionMenu } from './chat-input/FileMentionMenu'
import { ChatInputActions } from './chat-input/ChatInputActions'
import { ModeToolbars } from './chat-input/ModeToolbars'
import { useChatActions, type SlashCommandEntry } from './chat-input/useChatActions'
import { useEnhancePrompt } from './chat-input/useEnhancePrompt'

export function GlobalChatInput({ emptyState = false }: { emptyState?: boolean }): React.ReactElement {
  const sendMessage = useStore((s) => s.sendMessage)
  const cancelStream = useStore((s) => s.cancelStream)
  const isStreaming = useStore((s) => s.isStreaming)
  const currentMode = useStore((s) => s.currentMode)
  const streamingTokens = useStore((s) => s.streamingTokens)
  const networkSearchOn = useStore((s) => s.networkSearchOn)
  const setNetworkSearchOn = useStore((s) => s.setNetworkSearchOn)
  const autoModeLevel = useStore((s) => s.autoModeLevel)
  const setAutoModeLevel = useStore((s) => s.setAutoModeLevel)
  const projectPath = useStore((s) => s.projectPath)
  const openProject = useStore((s) => s.openProject)
  const setProjectPath = useStore((s) => s.setProjectPath)
  const addAttachedFile = useStore((s) => s.addAttachedFile)
  const attachedFiles = useStore((s) => s.attachedFiles)
  const removeAttachedFile = useStore((s) => s.removeAttachedFile)
  const addPastedImage = useStore((s) => s.addPastedImage)
  const pastedImagePaths = useStore((s) => s.pastedImagePaths)
  const clearPastedImages = useStore((s) => s.clearPastedImages)
  const activeExperts = useStore((s) => s.activeExperts)
  const toggleExpert = useStore((s) => s.toggleExpert)
  const activeStyleId = useStore((s) => s.activeStyleId)
  const setActiveStyleId = useStore((s) => s.setActiveStyleId)
  const selectedComponentIds = useStore((s) => s.selectedComponentIds)
  const toggleComponent = useStore((s) => s.toggleComponent)
  const clearSelectedComponents = useStore((s) => s.clearSelectedComponents)
  const conversation = useStore((s) => s.conversations.find((c) => c.id === s.currentConversationId) ?? null)
  const refreshComputerUseStatus = useStore((s) => s.refreshComputerUseStatus)

  // 办公模式：初始化操控电脑状态
  useEffect(() => {
    if (currentMode === 'office') void refreshComputerUseStatus()
  }, [currentMode, refreshComputerUseStatus])

  const {
    text, setText, textareaRef, showSlashMenu, activeSlashCmd, setActiveSlashCmd,
    slashCommands, hasSkillCommands,
    showFileMention, matchedFiles, selectedMentionIndex, setSelectedMentionIndex,
    insertFileMention, handleMentionKeyDown,
    isDragOver, handleDragOver, handleDragLeave, handleDrop,
    handleSend, handleKeyDown, handleSlashCommand, handleAttachFile,
  } = useChatActions(currentMode, isStreaming, sendMessage, pastedImagePaths, addAttachedFile, addPastedImage, clearPastedImages, projectPath)

  const {
    isEnhancing, enhanceError, originalText,
    handleEnhancePrompt, handleUndoEnhance, clearOriginal,
  } = useEnhancePrompt({ text, setText, conversation, currentMode, projectPath, textareaRef })

  // ---- 语音输入文本回填 ----
  const textRef = useRef(text)
  textRef.current = text
  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<string>).detail
      if (typeof detail !== 'string' || !detail) return
      const current = textRef.current
      const sep = current && !current.endsWith(' ') ? ' ' : ''
      const next = current + sep + detail
      textRef.current = next
      setText(next)
    }
    window.addEventListener('ximo:voice-text', handler)
    return () => window.removeEventListener('ximo:voice-text', handler)
  }, [setText])

  // ---- textarea 自动增高 ----
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`
  }, [text])

  const placeholder = MODE_PLACEHOLDERS[currentMode]

  return (
    <div className={`relative z-10 px-4 ${emptyState ? 'pb-0 pt-4' : 'pb-3 pt-2'}`}>
      {/* 空态下输入框与会话区英雄块同宽（max-w-2xl），否则 896px 的宽条会显得又长又扁 */}
      <div className={`mx-auto ${emptyState ? 'max-w-2xl' : 'max-w-4xl'}`}>
        <ChatChips
          attachedFiles={attachedFiles}
          onRemoveFile={removeAttachedFile}
          currentMode={currentMode}
          activeExperts={activeExperts}
          onToggleExpert={toggleExpert}
          activeStyleId={activeStyleId}
          onClearStyle={() => setActiveStyleId(null)}
          selectedComponentIds={selectedComponentIds}
          onToggleComponent={toggleComponent}
          onClearComponents={clearSelectedComponents}
          activeSlashCmd={activeSlashCmd}
          onClearSlashCmd={() => setActiveSlashCmd(null)}
        />

        <div
          className={`rounded-panel border bg-bg-elevated-soft backdrop-blur-md transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] duration-base ease-out-quart ${
            isStreaming ? 'beam-border border-accent/20'
              : isDragOver ? 'border-accent border-2'
                // 聚焦态刻意**不用强调色**，只做中性边框的深浅变化。
                // 之前这里写 focus-within:border-accent/40，textarea 上又挂了 .focus-ring
                // （2px 描边 + 2px 偏移，正好压在面板边缘上），两者叠加成了一圈很显眼的
                // 蓝色光框 —— 而这个容器本来就很大，光框的视觉重量远超它提供的信息量。
                // 大输入框的焦点指示由光标承担，这里只留一层克制的边框响应。
                : 'border-border-subtle hover:border-border focus-within:border-border'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* 不加 .focus-ring —— 焦点指示由外层容器的边框变化 + 光标承担。
              textarea 上必须显式压掉 base.css 的全局 :focus-visible 兜底，
              否则它仍会在四周画一圈 2px 描边（那正是要去掉的"光框"）。
              这是"有替代的抑制"，不是把焦点可见性整个关掉。 */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => { setText(e.target.value); clearOriginal() }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className="no-drag w-full resize-none bg-transparent px-4 pt-3 pb-1 text-body text-text-primary placeholder:text-text-muted focus:outline-none"
            style={{ maxHeight: '180px' }}
          />

          {enhanceError && (
            <div className="flex items-center gap-1.5 px-4 py-1 text-caption text-red-400">
              <span>⚠</span>
              <span>增强失败：{enhanceError}</span>
            </div>
          )}

          {showFileMention && (
            <FileMentionMenu files={matchedFiles} selectedIndex={selectedMentionIndex} onSelect={insertFileMention} onHover={setSelectedMentionIndex} />
          )}

          <ChatInputActions
            onAttachFile={handleAttachFile}
            onAtSign={() => {
              const ta = textareaRef.current
              if (!ta) return
              const cursorPos = ta.selectionStart
              const newText = text.slice(0, cursorPos) + '@' + text.slice(cursorPos)
              setText(newText)
              requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(cursorPos + 1, cursorPos + 1) })
            }}
            networkSearchOn={networkSearchOn}
            onToggleNetwork={() => setNetworkSearchOn(!networkSearchOn)}
            autoModeLevel={autoModeLevel}
            onAutoModeChange={setAutoModeLevel}
            isStreaming={isStreaming}
            streamingTokens={streamingTokens}
            text={text}
            onSend={handleSend}
            onCancel={cancelStream}
            currentMode={currentMode}
            onEnhancePrompt={() => void handleEnhancePrompt()}
            isEnhancing={isEnhancing}
            onUndoEnhance={handleUndoEnhance}
            canUndo={originalText !== null}
          >
            {currentMode === 'design' ? (<><StylePicker /><ComponentPicker /></>) : (<ExpertPicker />)}
          </ChatInputActions>
        </div>

        <SessionTokenStats conversation={conversation} />

        {showSlashMenu && (
          <div className="glass-strong mt-2 rounded-panel border border-border p-1.5 shadow-glass animate-scale-in">
            {/* 内置命令 */}
            {slashCommands.filter((c) => !c.skillId).map(({ cmd, label, systemHint }) => (
              <button
                key={cmd}
                onClick={() => handleSlashCommand(cmd, systemHint)}
                className="flex w-full items-center gap-2 rounded-panel px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors active:scale-[0.97]"
              >
                <span className="font-mono text-accent">{cmd}</span>
                <span className="text-text-muted">{label}</span>
              </button>
            ))}
            {/* 导入技能命令分区 */}
            {hasSkillCommands && (
              <>
                <div className="mt-1.5 mb-0.5 border-t border-border-subtle pt-1.5 text-caption font-medium text-text-muted px-3">
                  导入技能
                </div>
                {slashCommands.filter((c): c is SlashCommandEntry & { skillId: string } => Boolean(c.skillId)).map(({ cmd, label, description, systemHint }) => (
                  <button
                    key={cmd}
                    onClick={() => handleSlashCommand(cmd, systemHint)}
                    className="flex w-full items-center gap-2 rounded-panel px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors active:scale-[0.97]"
                    title={description}
                  >
                    <span className="font-mono text-accent">{cmd}</span>
                    <span className="truncate text-text-muted">{description || label}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        <div className="mt-1.5">
          <ModeToolbars
            currentMode={currentMode}
            projectPath={projectPath}
            onOpenProject={openProject}
            onClearProject={() => setProjectPath('')}
            onSlashCommand={handleSlashCommand}
          />
        </div>
      </div>
    </div>
  )
}
