import type React from 'react'
import type { ProviderConfig } from '@shared/types'
import { genId } from '@shared/utils'

// ====== 编辑草稿 ======

export interface DraftState {
  id: string
  isNew: boolean
  name: string
  baseUrl: string
  apiKey: string
  /** 逗号/换行分隔的模型名 */
  modelsText: string
  contextWindow: string
  maxOutput: string
  sendReasoningParams: boolean
  sendStreamUsage: boolean
}

export function toDraft(p?: ProviderConfig): DraftState {
  return {
    id: p?.id ?? genId(),
    isNew: !p,
    name: p?.name ?? '',
    baseUrl: p?.baseUrl ?? '',
    apiKey: p?.apiKey ?? '',
    modelsText: (p?.models ?? []).join(', '),
    contextWindow: p?.contextWindowTokens ? String(p.contextWindowTokens) : '',
    maxOutput: p?.maxOutputTokens ? String(p.maxOutputTokens) : '',
    sendReasoningParams: p?.sendReasoningParams ?? true,
    sendStreamUsage: p?.sendStreamUsage ?? true
  }
}

export function parseModels(text: string): string[] {
  return text.split(/[,，\n]+/).map((s) => s.trim()).filter(Boolean)
}

export const inputCls = 'w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none'

// ====== 单行能力开关 ======

export function CapToggle({ label, desc, value, onChange }: {
  label: string; desc: string; value: boolean; onChange: (v: boolean) => void
}): React.ReactElement {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-left transition-colors hover:border-border-hover"
    >
      <div className="min-w-0 pr-3">
        <p className="text-xs font-medium text-text-primary">{label}</p>
        <p className="text-[10px] text-text-muted">{desc}</p>
      </div>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${value ? 'bg-accent' : 'bg-border'}`}>
        <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${value ? 'translate-x-4' : ''}`} />
      </span>
    </button>
  )
}
