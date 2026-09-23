import { Paperclip, AtSign, Globe, ArrowUp, Square, Sparkles, Loader2, Undo2 } from 'lucide-react'
import { ModelSelector } from './ModelSelector'
import { ReasoningSlider } from './ReasoningSlider'
import { LongTaskPicker } from './LongTaskPicker'
import { AutoModeSelect } from './AutoModeSelect'
import type { AutoModeLevel } from '@shared/types'

interface ChatInputActionsProps {
  onAttachFile: () => Promise<void>
  onAtSign: () => void
  networkSearchOn: boolean
  onToggleNetwork: () => void
  autoModeLevel: AutoModeLevel
  onAutoModeChange: (next: AutoModeLevel) => void
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
  autoModeLevel, onAutoModeChange,
  isStreaming, streamingTokens,
  text, onSend, onCancel,
  currentMode, onEnhancePrompt, isEnhancing, onUndoEnhance, canUndo,
  children
}: ChatInputActionsProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between px-3 pb-2">
      <div className="flex items-center gap-1">
        <button onClick={() => void onAttachFile()} className="icon-btn p-1.5" title="附加文件"><Paperclip size={13} /></button>
        <button aria-label="@引用文件" onClick={onAtSign} className="icon-btn p-1.5" title="@引用文件"><AtSign size={13} /></button>
        {isEnhancing ? (
          <button aria-label="正在增强..."
            disabled
            className="icon-btn p-1.5 text-accent"
            title="正在增强..."
          >
            <Loader2 size={13} className="animate-spin" />
          </button>
        ) : canUndo ? (
          <button aria-label="撤销增强 — 恢复原始输入"
            onClick={onUndoEnhance}
            className="icon-btn p-1.5 text-accent hover:text-accent transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] duration-fast active:scale-90"
            title="撤销增强 — 恢复原始输入"
          >
            <Undo2 size={13} />
          </button>
        ) : (
          <button aria-label="增强提示词 — AI 根据当前会话和模式优化你的输入"
            onClick={onEnhancePrompt}
            disabled={!text.trim()}
            className={`icon-btn p-1.5 transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] duration-fast ${
              text.trim() ? 'hover:text-accent' : 'opacity-40'
            }`}
            title="增强提示词 — AI 根据当前会话和模式优化你的输入"
          >
            <Sparkles size={13} />
          </button>
        )}
        {children}

        <LongTaskPicker />

        <button aria-label="联网搜索"
          onClick={onToggleNetwork}
          className={`chip flex items-center gap-1 px-2 py-0.5 text-caption transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] duration-fast active:scale-95 ${
            networkSearchOn ? 'border-accent/30 text-accent bg-accent/10' : 'text-text-muted hover:text-text-secondary'
          }`}
          title="联网搜索"
        >
          <Globe size={13} />联网
        </button>

        <AutoModeSelect level={autoModeLevel} onChange={onAutoModeChange} />
      </div>

      <div className="flex items-center gap-2">
        {streamingTokens !== null && isStreaming && (
          <span className="text-caption text-text-muted">{streamingTokens.toLocaleString()} tokens</span>
        )}
        <ModelSelector />
        <ReasoningSlider />
        {isStreaming ? (
          <button aria-label="取消"
            onClick={onCancel}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500 text-white shadow-[0_0_14px_rgba(239,68,68,0.45)] transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] duration-fast hover:bg-red-600 hover:scale-105 active:scale-90 halo-pulse"
            title="取消"
          >
            <Square size={13} />
          </button>
        ) : (
          <button aria-label="发送"
            onClick={onSend}
            disabled={!text.trim()}
            className={`btn-liquid flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] duration-fast disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${
              text.trim() ? 'halo-pulse hover:scale-105 active:scale-90' : ''
            }`}
            title="发送"
          >
            <ArrowUp size={16} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  )
}
