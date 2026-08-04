import { Paperclip, AtSign, Globe, ArrowUp, Zap, Square, Sparkles, Loader2, Undo2 } from 'lucide-react'
import { ModelSelector } from './ModelSelector'
import { ReasoningSlider } from './ReasoningSlider'

interface ChatInputActionsProps {
  onAttachFile: () => Promise<void>
  onAtSign: () => void
  networkSearchOn: boolean
  onToggleNetwork: () => void
  autoModeLevel: string
  onCycleAutoMode: () => void
  isStreaming: boolean
  streamingTokens: number | null
  text: string
  onSend: () => void
  onCancel: () => void
  currentMode: string
  onEnhancePrompt: () => void
  isEnhancing: boolean
  onUndoEnhance: () => void
  canUndo: boolean
  children?: React.ReactNode
}

export function ChatInputActions({
  onAttachFile, onAtSign,
  networkSearchOn, onToggleNetwork,
  autoModeLevel, onCycleAutoMode,
  isStreaming, streamingTokens,
  text, onSend, onCancel,
  currentMode, onEnhancePrompt, isEnhancing, onUndoEnhance, canUndo, children
}: ChatInputActionsProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between px-3 pb-2.5">
      <div className="flex items-center gap-1">
        <button onClick={() => void onAttachFile()} className="icon-btn p-1.5" title="附加文件"><Paperclip size={14} /></button>
        <button onClick={onAtSign} className="icon-btn p-1.5" title="@引用文件"><AtSign size={14} /></button>
        {isEnhancing ? (
          <button
            disabled
            className="icon-btn p-1.5 text-accent"
            title="正在增强..."
          >
            <Loader2 size={14} className="animate-spin" />
          </button>
        ) : canUndo ? (
          <button
            onClick={onUndoEnhance}
            className="icon-btn p-1.5 text-accent hover:text-accent transition-all duration-200 active:scale-90"
            title="撤销增强 — 恢复原始输入"
          >
            <Undo2 size={14} />
          </button>
        ) : (
          <button
            onClick={onEnhancePrompt}
            disabled={!text.trim()}
            className={`icon-btn p-1.5 transition-all duration-200 ${
              text.trim() ? 'hover:text-accent' : 'opacity-40'
            }`}
            title="增强提示词 — AI 根据当前会话和模式优化你的输入"
          >
            <Sparkles size={14} />
          </button>
        )}
        {children}

        <button
          onClick={onToggleNetwork}
          className={`chip flex items-center gap-1 px-2 py-0.5 text-[11px] transition-all duration-200 active:scale-95 ${
            networkSearchOn ? 'border-accent/30 text-accent bg-accent/10' : 'text-text-muted hover:text-text-secondary'
          }`}
          title="联网搜索"
        >
          <Globe size={12} />联网
        </button>

        <button
          onClick={onCycleAutoMode}
          className={`chip flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium transition-all duration-200 active:scale-95 ${
            autoModeLevel === 'yolo' ? 'border-red-500/30 text-red-400 bg-red-500/10'
              : autoModeLevel === 'safe' ? 'border-accent/30 text-accent bg-accent/10'
                : 'text-text-muted hover:text-text-secondary'
          }`}
          title={autoModeLevel === 'off' ? '按模式规则：常规操作自动，危险操作需确认' : autoModeLevel === 'safe' ? '安全模式：读操作和常规写操作自动，危险操作需确认' : 'YOLO 模式：全部自动执行'}
        >
          <Zap size={11} />{autoModeLevel === 'off' ? '手动' : autoModeLevel === 'safe' ? 'Safe' : 'YOLO'}
        </button>
      </div>

      <div className="flex items-center gap-2">
        {streamingTokens !== null && isStreaming && (
          <span className="text-[11px] text-text-muted">{streamingTokens.toLocaleString()} tokens</span>
        )}
        <ModelSelector />
        <ReasoningSlider />
        {isStreaming ? (
          <button
            onClick={onCancel}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500 text-white shadow-[0_0_14px_rgba(239,68,68,0.45)] transition-all duration-200 hover:bg-red-600 hover:scale-105 active:scale-90 halo-pulse"
            title="取消"
          >
            <Square size={13} />
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!text.trim()}
            className={`btn-liquid flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${
              text.trim() ? 'halo-pulse hover:scale-105 active:scale-90' : ''
            }`}
            title="发送"
          >
            <ArrowUp size={15} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  )
}
