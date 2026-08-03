import { Trash2, Send, Palette, ChevronDown, Layers, Layout, Globe } from 'lucide-react'
import type { CanvasItem } from '@renderer/store/useStore'
import type { StyleEntry, ScenarioEntry } from './types'
import { STYLES, SCENARIOS, SCENARIO_ICONS } from './constants'
import { ScenarioPicker, StylePicker } from './pickers'

interface CanvasToolbarProps {
  canvasItems: CanvasItem[]
  canvasStyleId: string | null
  canvasScenario: string | null
  isStreaming: boolean
  showStylePicker: boolean
  showScenarioPicker: boolean
  onToggleStylePicker: () => void
  onToggleScenarioPicker: () => void
  onSelectStyle: (id: string | null) => void
  onSelectScenario: (id: string | null) => void
  onClearCanvas: () => void
  onSendToAgent: () => void
}

export function CanvasToolbar({
  canvasItems,
  canvasStyleId,
  canvasScenario,
  isStreaming,
  showStylePicker,
  showScenarioPicker,
  onToggleStylePicker,
  onToggleScenarioPicker,
  onSelectStyle,
  onSelectScenario,
  onClearCanvas,
  onSendToAgent
}: CanvasToolbarProps): React.ReactElement {
  const currentScenario = SCENARIOS.find(s => s.id === canvasScenario)
  const appliedStyle = STYLES.find(s => s.id === canvasStyleId)
  const ScenarioIcon = currentScenario ? (SCENARIO_ICONS[currentScenario.icon] || Globe) : null

  return (
    <div className="flex items-center gap-1.5 border-b border-border-subtle px-2.5 py-1.5 shrink-0">
      {/* 场景选择器 */}
      <div className="relative">
        <button
          onClick={onToggleScenarioPicker}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors"
          style={currentScenario ? {
            backgroundColor: 'rgba(99,102,241,0.12)',
            color: '#818cf8',
          } : undefined}
        >
          {ScenarioIcon ? <ScenarioIcon size={11} /> : <Layout size={11} />}
          <span className={currentScenario ? '' : 'text-text-muted'}>
            {currentScenario ? currentScenario.name : '场景'}
          </span>
          <ChevronDown size={10} className="opacity-50" />
        </button>
        {showScenarioPicker && (
          <ScenarioPicker
            scenarios={SCENARIOS}
            selectedId={canvasScenario}
            onSelect={(id) => { onSelectScenario(id); onToggleScenarioPicker() }}
            onClose={onToggleScenarioPicker}
          />
        )}
      </div>

      {/* 风格选择器 */}
      <div className="relative">
        <button
          onClick={onToggleStylePicker}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors"
          style={appliedStyle ? {
            backgroundColor: `${appliedStyle.tokens.accent}15`,
            color: appliedStyle.tokens.accent,
          } : undefined}
        >
          <Palette size={11} />
          <span className={appliedStyle ? '' : 'text-text-muted'}>
            {appliedStyle ? appliedStyle.name : '风格'}
          </span>
          {appliedStyle && (
            <span
              className="ml-0.5 h-2 w-2 rounded-full"
              style={{ backgroundColor: appliedStyle.tokens.accent }}
            />
          )}
          <ChevronDown size={10} className="opacity-50" />
        </button>
        {showStylePicker && (
          <StylePicker
            styles={STYLES}
            selectedId={canvasStyleId}
            onSelect={(id) => { onSelectStyle(id); onToggleStylePicker() }}
            onClose={onToggleStylePicker}
          />
        )}
      </div>

      <div className="flex-1" />

      {/* 已放置数量 */}
      {canvasItems.length > 0 && (
        <span className="flex items-center gap-1 rounded-md bg-bg-elevated px-1.5 py-0.5 text-[10px] text-text-muted">
          <Layers size={9} />
          {canvasItems.length}
        </span>
      )}

      {/* 清空 */}
      {canvasItems.length > 0 && (
        <button
          onClick={onClearCanvas}
          className="icon-btn rounded-lg p-1 text-text-muted hover:text-red-400"
          title="清空画布"
        >
          <Trash2 size={12} />
        </button>
      )}

      {/* 发送给 Agent */}
      <button
        onClick={onSendToAgent}
        disabled={canvasItems.length === 0 || isStreaming}
        className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${
          canvasItems.length > 0 && !isStreaming
            ? 'bg-accent text-white hover:scale-105 active:scale-95'
            : 'bg-bg-elevated text-text-muted cursor-not-allowed'
        }`}
        title="发送给 Agent 开发"
      >
        <Send size={11} />
        发送
      </button>
    </div>
  )
}
