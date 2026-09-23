import type React from 'react'
import { Loader2, Zap } from 'lucide-react'
import { CapToggle, inputCls, type DraftState } from './provider-helpers'

interface ProviderDraftFormProps {
  draft: DraftState
  draftError: string
  fetching: boolean
  fetchMsg: string
  onDraftChange: (d: DraftState) => void
  onCancel: () => void
  onSave: () => void
  onFetchModels: () => void
}

/** 服务商编辑/新增表单 — 名称、Key、URL、模型列表、能力开关 */
export function ProviderDraftForm({
  draft, draftError, fetching, fetchMsg,
  onDraftChange, onCancel, onSave, onFetchModels,
}: ProviderDraftFormProps): React.ReactElement {
  return (
    <div className="mt-2 space-y-3 rounded-panel border border-border bg-bg-elevated p-4">
      <p className="text-sm font-medium text-text-primary">{draft.isNew ? '添加服务商' : '编辑服务商'}</p>

      <div className="grid grid-cols-2 gap-2">
        <input
          value={draft.name}
          onChange={(e) => onDraftChange({ ...draft, name: e.target.value })}
          placeholder="名称，如 OpenRouter"
          className={inputCls}
        />
        <input
          value={draft.apiKey}
          onChange={(e) => onDraftChange({ ...draft, apiKey: e.target.value })}
          placeholder="API Key（sk-...）"
          type="password"
          className={inputCls}
        />
      </div>

      <input
        value={draft.baseUrl}
        onChange={(e) => onDraftChange({ ...draft, baseUrl: e.target.value })}
        placeholder="Base URL，如 https://openrouter.ai/api/v1"
        className={inputCls}
      />

      <textarea
        value={draft.modelsText}
        onChange={(e) => onDraftChange({ ...draft, modelsText: e.target.value })}
        placeholder="模型名列表（逗号分隔）——可点右上「自动获取」从 /models 拉取"
        rows={2}
        className={`${inputCls} resize-none`}
      />

      {/* 模型获取状态 */}
      <div className="-mt-1 flex items-center justify-between">
        <p className={`text-caption ${fetchMsg ? 'text-text-muted' : 'text-transparent'}`}>
          {fetchMsg || '.'}
        </p>
        <button
          onClick={onFetchModels}
          disabled={fetching}
          className="flex shrink-0 items-center gap-1 rounded-control px-2 py-1 text-caption text-accent transition-colors hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {fetching ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
          {fetching ? '获取中...' : '自动获取模型'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          value={draft.contextWindow}
          onChange={(e) => onDraftChange({ ...draft, contextWindow: e.target.value.replace(/[^\d]/g, '') })}
          placeholder="上下文窗口 tokens（缺省 131072）"
          className={inputCls}
        />
        <input
          value={draft.maxOutput}
          onChange={(e) => onDraftChange({ ...draft, maxOutput: e.target.value.replace(/[^\d]/g, '') })}
          placeholder="最大输出 tokens（缺省 8192）"
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <CapToggle
          label="Reasoning 参数"
          desc="发送 enable_thinking 等思考参数"
          value={draft.sendReasoningParams}
          onChange={(v) => onDraftChange({ ...draft, sendReasoningParams: v })}
        />
        <CapToggle
          label="流式 Usage"
          desc="发送 stream_options.include_usage"
          value={draft.sendStreamUsage}
          onChange={(v) => onDraftChange({ ...draft, sendStreamUsage: v })}
        />
      </div>

      {draftError && <p className="text-xs text-red-400">{draftError}</p>}

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-card px-3 py-1.5 text-xs text-text-muted transition-colors hover:text-text-primary active:scale-[0.97]"
        >
          取消
        </button>
        <button
          onClick={onSave}
          className="rounded-card bg-accent/15 px-4 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/25 active:scale-[0.97]"
        >
          保存
        </button>
      </div>
    </div>
  )
}
