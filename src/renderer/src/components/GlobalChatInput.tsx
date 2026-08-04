import { useEffect, useState, useCallback } from 'react'
import { FolderOpen, X } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { SessionTokenStats } from './shared/SessionTokenStats'
import { MODE_PLACEHOLDERS, getSlashCommands } from './chat-input/constants'
import { ExpertPicker } from './chat-input/ExpertPicker'
import { StylePicker } from './chat-input/StylePicker'
import { ComponentPicker } from './chat-input/ComponentPicker'
import { ChatChips } from './chat-input/ChatChips'
import { FileMentionMenu } from './chat-input/FileMentionMenu'
import { OfficeToolbar } from './chat-input/OfficeToolbar'
import { ChatInputActions } from './chat-input/ChatInputActions'
import { useChatActions } from './chat-input/useChatActions'

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
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [enhanceError, setEnhanceError] = useState<string | null>(null)
  const [originalText, setOriginalText] = useState<string | null>(null)

  // 办公模式：初始化操控电脑状态
  useEffect(() => {
    if (currentMode === 'office') void refreshComputerUseStatus()
  }, [currentMode, refreshComputerUseStatus])

  const {
    text, setText, textareaRef, showSlashMenu, activeSlashCmd,
    showFileMention, matchedFiles, selectedMentionIndex, setSelectedMentionIndex,
    insertFileMention, handleMentionKeyDown,
    isDragOver, handleDragOver, handleDragLeave, handleDrop,
    handleSend, handleKeyDown, handleSlashCommand, handleAttachFile,
  } = useChatActions(currentMode, isStreaming, sendMessage, pastedImagePaths, addAttachedFile, addPastedImage, clearPastedImages, projectPath)

  const placeholder = MODE_PLACEHOLDERS[currentMode]

  const handleEnhancePrompt = useCallback(async (): Promise<void> => {
    const trimmed = text.trim()
    if (!trimmed) return
    setIsEnhancing(true)
    setEnhanceError(null)
    try {
      // 提取最近 3 轮对话作为上下文
      let recentContext: string | undefined
      if (conversation?.messages && conversation.messages.length > 0) {
        const recent = conversation.messages.slice(-6)
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => `[${m.role === 'user' ? '用户' : '助手'}] ${m.content.slice(0, 300)}`)
          .join('\n')
        if (recent) recentContext = recent
      }

      const result = await window.api.chat.enhancePrompt({
        text: trimmed,
        mode: currentMode,
        recentContext,
        projectPath: projectPath || undefined,
      })

      if (result.success && result.enhancedText) {
        setOriginalText(trimmed)
        setText(result.enhancedText)
        requestAnimationFrame(() => textareaRef.current?.focus())
      } else {
        const errMsg = result.error || '增强失败'
        setEnhanceError(errMsg)
        console.error('[enhance-prompt] 失败:', errMsg)
        setTimeout(() => setEnhanceError(null), 4000)
      }
    } catch (e) {
      const errMsg = (e as Error).message || '增强异常'
      setEnhanceError(errMsg)
      console.error('[enhance-prompt] 异常:', e)
      setTimeout(() => setEnhanceError(null), 4000)
    } finally {
      setIsEnhancing(false)
    }
  }, [text, setText, conversation, currentMode, projectPath, textareaRef])

  const handleUndoEnhance = useCallback((): void => {
    if (originalText !== null) {
      setText(originalText)
      setOriginalText(null)
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }, [originalText, setText, textareaRef])

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
            onChange={(e) => {
              setText(e.target.value)
              if (originalText !== null) setOriginalText(null)
            }}
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
            {getSlashCommands(currentMode).map(({ cmd, label, systemHint }) => (
              <button
                key={cmd}
                onClick={() => handleSlashCommand(cmd, systemHint)}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              >
                <span className="font-mono text-accent">{cmd}</span>
                <span className="text-text-muted">{label}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-1.5">
          {currentMode === 'office' && (
            <OfficeToolbar
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
            />
          )}

          {currentMode === 'coding' && (
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={openProject}
                className="chip flex items-center gap-1 px-2 py-0.5 text-[11px] border-accent/25 text-accent hover:bg-accent/10 transition-all duration-200 active:scale-95"
              >
                <FolderOpen size={10} />
                {projectPath ? projectPath.split(/[/\\]/).pop() : '打开项目'}
              </button>
              {projectPath && (
                <button onClick={() => setProjectPath('')} className="text-[11px] text-text-muted hover:text-red-400 transition-colors" title="解除项目绑定">
                  <X size={9} />
                </button>
              )}
              <span className="mx-1 text-text-muted/30">|</span>
              {getSlashCommands(currentMode).map(({ cmd, label }) => (
                <button
                  key={cmd}
                  onClick={() => {
                    const found = getSlashCommands(currentMode).find(c => c.cmd === cmd)
                    if (found) handleSlashCommand(cmd, found.systemHint)
                  }}
                  className="chip px-2 py-0.5 text-[11px] text-text-muted hover:text-accent hover:border-accent/30 hover:bg-accent/5 transition-all duration-200 active:scale-95"
                >
                  {cmd}
                </button>
              ))}
            </div>
          )}

          {currentMode === 'design' && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-text-muted">试试：生成一个登录页面、设计一套颜色系统、审查 UI · 点击「风格」绑定设计风格 · 点击「组件」多选 UI 组件</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
