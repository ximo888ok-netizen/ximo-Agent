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

export function GlobalChatInput(): React.ReactElement {
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
  const browserOpen = useStore((s) => s.browserOpen)
  const toggleBrowser = useStore((s) => s.toggleBrowser)
  const isBrowserRecording = useStore((s) => s.isBrowserRecording)
  const toggleBrowserRecording = useStore((s) => s.toggleBrowserRecording)
  const computerUseRunning = useStore((s) => s.computerUseRunning)
  const toggleComputerUse = useStore((s) => s.toggleComputerUse)
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
    <div className="relative z-10 px-4 pb-3 pt-2">
      <div className="mx-auto max-w-4xl">
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
          className={`rounded-2xl border bg-bg-elevated/60 backdrop-blur-md transition-all duration-300 ease-out-quart ${
            isStreaming ? 'beam-border border-accent/20'
              : isDragOver ? 'border-accent border-2'
                : 'border-border-subtle hover:border-border focus-within:border-accent/40'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => { setText(e.target.value); clearOriginal() }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className="no-drag w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[15px] text-text-primary placeholder:text-text-muted focus:outline-none"
            style={{ maxHeight: '180px' }}
          />

          {enhanceError && (
            <div className="flex items-center gap-1.5 px-4 py-1 text-[11px] text-red-400">
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
            onCycleAutoMode={() => { const next = autoModeLevel === 'off' ? 'safe' : autoModeLevel === 'safe' ? 'yolo' : 'off'; setAutoModeLevel(next) }}
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
          <div className="glass-strong mt-2 rounded-2xl border border-border p-1.5 shadow-glass animate-scale-in">
            {/* 内置命令 */}
            {slashCommands.filter((c) => !c.skillId).map(({ cmd, label, systemHint }) => (
              <button
                key={cmd}
                onClick={() => handleSlashCommand(cmd, systemHint)}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              >
                <span className="font-mono text-accent">{cmd}</span>
                <span className="text-text-muted">{label}</span>
              </button>
            ))}
            {/* 导入技能命令分区 */}
            {hasSkillCommands && (
              <>
                <div className="mt-1.5 mb-0.5 border-t border-border-subtle pt-1.5 text-[10px] font-medium text-text-muted/70 px-3">
                  导入技能
                </div>
                {slashCommands.filter((c): c is SlashCommandEntry & { skillId: string } => Boolean(c.skillId)).map(({ cmd, label, description, systemHint }) => (
                  <button
                    key={cmd}
                    onClick={() => handleSlashCommand(cmd, systemHint)}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
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
            browserOpen={browserOpen}
            onToggleBrowser={() => {
              if (browserOpen && isBrowserRecording) window.dispatchEvent(new CustomEvent('ximo:stop-recording'))
              else toggleBrowser()
            }}
            isBrowserRecording={isBrowserRecording}
            onToggleRecording={() => {
              if (isBrowserRecording) window.dispatchEvent(new CustomEvent('ximo:stop-recording'))
              else toggleBrowserRecording()
            }}
            computerUseRunning={computerUseRunning}
            onToggleComputerUse={toggleComputerUse}
            onSlashCommand={handleSlashCommand}
          />
        </div>
      </div>
    </div>
  )
}
