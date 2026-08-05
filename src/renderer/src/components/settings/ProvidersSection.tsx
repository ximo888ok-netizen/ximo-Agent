import { useState } from 'react'
import {
  Plus, Pencil, Trash2, Zap, Loader2, CheckCircle2, XCircle, Server
} from 'lucide-react'
import type { AppSettings, ProviderConfig, TestResult } from '@shared/types'
import { genId } from '@shared/utils'
import { SectionTitle } from './shared-components'
import { DEEPSEEK_PROVIDER_ID } from '@renderer/lib/providers'

// ====== 编辑草稿 ======

interface DraftState {
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

function toDraft(p?: ProviderConfig): DraftState {
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

function parseModels(text: string): string[] {
  return text.split(/[,，\n]+/).map((s) => s.trim()).filter(Boolean)
}

const inputCls = 'w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none'

// ====== 单行能力开关 ======

function CapToggle({ label, desc, value, onChange }: {
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

// ====== 主组件 ======

export function ProvidersSection({
  local,
  update
}: {
  local: AppSettings
  update: (patch: Partial<AppSettings>) => void
}): React.ReactElement {
  const providers = local.providers ?? []
  const activeId = local.activeProviderId ?? DEEPSEEK_PROVIDER_ID
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [draftError, setDraftError] = useState('')
  const [testing, setTesting] = useState<{ id: string; result: TestResult | null } | null>(null)
  // 自动获取模型列表状态
  const [fetching, setFetching] = useState(false)
  const [fetchMsg, setFetchMsg] = useState('')

  const setActive = (id: string): void => update({ activeProviderId: id })

  /** 从服务商 /models 端点自动拉取模型列表，免手填 */
  const fetchModels = async (): Promise<void> => {
    if (!draft) return
    if (!draft.baseUrl.trim()) {
      setDraftError('请先填写 Base URL 再获取模型')
      return
    }
    setFetching(true)
    setDraftError('')
    setFetchMsg('')
    const r = await window.api.providers.listModels(draft.baseUrl.trim(), draft.apiKey.trim())
    setFetching(false)
    if (r.success && r.models.length > 0) {
      setDraft((d) => (d ? { ...d, modelsText: r.models.join(', ') } : d))
      setFetchMsg(`已获取 ${r.models.length} 个模型，可按需删减`)
    } else {
      setFetchMsg(r.error ?? '未获取到模型，请手动填写')
    }
  }

  const saveDraft = (): void => {
    if (!draft) return
    if (!draft.name.trim() || !draft.baseUrl.trim()) {
      setDraftError('名称与 Base URL 为必填项')
      return
    }
    const models = parseModels(draft.modelsText)
    if (models.length === 0) {
      setDraftError('至少填写一个模型名')
      return
    }
    const entry: ProviderConfig = {
      id: draft.id,
      name: draft.name.trim(),
      baseUrl: draft.baseUrl.trim(),
      apiKey: draft.apiKey.trim(),
      models,
      contextWindowTokens: parseInt(draft.contextWindow, 10) || undefined,
      maxOutputTokens: parseInt(draft.maxOutput, 10) || undefined,
      sendReasoningParams: draft.sendReasoningParams,
      sendStreamUsage: draft.sendStreamUsage
    }
    const next = draft.isNew ? [...providers, entry] : providers.map((p) => (p.id === draft.id ? entry : p))
    update({ providers: next })
    setDraft(null)
    setDraftError('')
    setFetchMsg('')
  }

  const removeProvider = (id: string): void => {
    update({
      providers: providers.filter((p) => p.id !== id),
      // 删除的若是活跃服务商，回退到内置 DeepSeek
      ...(activeId === id ? { activeProviderId: DEEPSEEK_PROVIDER_ID } : {})
    })
  }

  const testProvider = async (p: ProviderConfig): Promise<void> => {
    setTesting({ id: p.id, result: null })
    const result = await window.api.chat.test(p.apiKey, p.baseUrl, p.models[0] ?? '')
    setTesting({ id: p.id, result })
  }

  return (
    <div>
      <SectionTitle
        title="自定义模型服务商"
        desc="接入任意 OpenAI 兼容 API（OpenRouter / GLM / Kimi / Ollama 等），不影响内置 DeepSeek"
      />

      {/* 内置 DeepSeek 行 */}
      <button
        onClick={() => setActive(DEEPSEEK_PROVIDER_ID)}
        className={`mb-2 flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all ${
          activeId === DEEPSEEK_PROVIDER_ID
            ? 'border-accent bg-accent/10'
            : 'border-border-subtle bg-bg-elevated hover:border-border-hover'
        }`}
      >
        <Server size={15} className={activeId === DEEPSEEK_PROVIDER_ID ? 'text-accent' : 'text-text-muted'} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">DeepSeek（内置）</p>
          <p className="text-[10px] text-text-muted">deepseek-v4-pro / deepseek-v4-flash · 1M 上下文 · 密钥在上方配置</p>
        </div>
        {activeId === DEEPSEEK_PROVIDER_ID && <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow" />}
      </button>

      {/* 自定义服务商列表 */}
      {providers.map((p) => {
        const isActive = activeId === p.id
        const t = testing?.id === p.id ? testing : null
        return (
          <div
            key={p.id}
            className={`mb-2 rounded-xl border p-3 transition-all ${
              isActive ? 'border-accent bg-accent/10' : 'border-border-subtle bg-bg-elevated'
            }`}
          >
            <div className="flex items-center gap-3">
              <Server size={15} className={isActive ? 'text-accent' : 'text-text-muted'} />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">{p.name}</p>
                <p className="truncate text-[10px] text-text-muted">
                  {p.baseUrl} · {p.models.length} 个模型
                  {p.contextWindowTokens ? ` · ${(p.contextWindowTokens / 1000).toFixed(0)}K 上下文` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {!isActive && (
                  <button
                    onClick={() => setActive(p.id)}
                    className="rounded-md px-2 py-1 text-[10px] text-accent transition-colors hover:bg-accent/10"
                  >
                    设为活跃
                  </button>
                )}
                <button
                  onClick={() => void testProvider(p)}
                  className="rounded-md p-1.5 text-text-muted transition-colors hover:text-accent"
                  title="测试连接"
                >
                  <Zap size={13} />
                </button>
                <button
                  onClick={() => { setDraft(toDraft(p)); setDraftError(''); setFetchMsg('') }}
                  className="rounded-md p-1.5 text-text-muted transition-colors hover:text-text-primary"
                  title="编辑"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => removeProvider(p.id)}
                  className="rounded-md p-1.5 text-text-muted transition-colors hover:text-red-400"
                  title="删除"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* 测试结果 */}
            {t && (
              <div className="mt-2">
                {!t.result ? (
                  <p className="flex items-center gap-1.5 text-[11px] text-text-muted">
                    <Loader2 size={11} className="animate-spin" /> 测试中...
                  </p>
                ) : (
                  <p className={`flex items-center gap-1.5 text-[11px] ${t.result.success ? 'text-emerald-400' : 'text-red-400'}`}>
                    {t.result.success ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                    {t.result.message}
                    {t.result.latency !== undefined ? ` · ${t.result.latency}ms` : ''}
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* 新增按钮 / 编辑表单 */}
      {!draft && (
        <button
          onClick={() => { setDraft(toDraft()); setDraftError(''); setFetchMsg('') }}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <Plus size={13} />
          添加自定义服务商
        </button>
      )}

      {draft && (
        <div className="mt-2 space-y-3 rounded-xl border border-border bg-bg-elevated p-4">
          <p className="text-sm font-medium text-text-primary">{draft.isNew ? '添加服务商' : '编辑服务商'}</p>

          <div className="grid grid-cols-2 gap-2">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="名称，如 OpenRouter"
              className={inputCls}
            />
            <input
              value={draft.apiKey}
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
              placeholder="API Key（sk-...）"
              type="password"
              className={inputCls}
            />
          </div>

          <input
            value={draft.baseUrl}
            onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
            placeholder="Base URL，如 https://openrouter.ai/api/v1"
            className={inputCls}
          />

          <textarea
            value={draft.modelsText}
            onChange={(e) => setDraft({ ...draft, modelsText: e.target.value })}
            placeholder="模型名列表（逗号分隔）——可点右上「自动获取」从 /models 拉取"
            rows={2}
            className={`${inputCls} resize-none`}
          />

          {/* 模型获取状态 */}
          <div className="-mt-1 flex items-center justify-between">
            <p className={`text-[10px] ${fetchMsg ? 'text-text-muted' : 'text-transparent'}`}>
              {fetchMsg || '.'}
            </p>
            <button
              onClick={() => void fetchModels()}
              disabled={fetching}
              className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] text-accent transition-colors hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {fetching ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
              {fetching ? '获取中...' : '自动获取模型'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              value={draft.contextWindow}
              onChange={(e) => setDraft({ ...draft, contextWindow: e.target.value.replace(/[^\d]/g, '') })}
              placeholder="上下文窗口 tokens（缺省 131072）"
              className={inputCls}
            />
            <input
              value={draft.maxOutput}
              onChange={(e) => setDraft({ ...draft, maxOutput: e.target.value.replace(/[^\d]/g, '') })}
              placeholder="最大输出 tokens（缺省 8192）"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <CapToggle
              label="Reasoning 参数"
              desc="发送 enable_thinking 等思考参数"
              value={draft.sendReasoningParams}
              onChange={(v) => setDraft({ ...draft, sendReasoningParams: v })}
            />
            <CapToggle
              label="流式 Usage"
              desc="发送 stream_options.include_usage"
              value={draft.sendStreamUsage}
              onChange={(v) => setDraft({ ...draft, sendStreamUsage: v })}
            />
          </div>

          {draftError && <p className="text-xs text-red-400">{draftError}</p>}

          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setDraft(null); setDraftError(''); setFetchMsg('') }}
              className="rounded-lg px-3 py-1.5 text-xs text-text-muted transition-colors hover:text-text-primary"
            >
              取消
            </button>
            <button
              onClick={saveDraft}
              className="rounded-lg bg-accent/15 px-4 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/25"
            >
              保存
            </button>
          </div>
        </div>
      )}

      <p className="mt-2 text-[10px] text-text-muted">
        仅支持 OpenAI 兼容协议。切换活跃服务商后，新消息将通过该服务商发送；思考模式在不支持 reasoning 参数的服务商下自动关闭。
      </p>
    </div>
  )
}
