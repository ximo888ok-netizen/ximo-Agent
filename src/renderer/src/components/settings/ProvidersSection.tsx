import { useState } from 'react'
import {
  Plus, Pencil, Trash2, Zap, Loader2, CheckCircle2, XCircle, Server
} from 'lucide-react'
import type { AppSettings, ProviderConfig, TestResult } from '@shared/types'
import { SectionTitle } from './shared-components'
import { DEEPSEEK_PROVIDER_ID } from '@renderer/lib/providers'
import { toDraft, parseModels, type DraftState } from './provider-helpers'
import { ProviderDraftForm } from './ProviderDraftForm'

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
        className={`mb-2 flex w-full items-center gap-3 rounded-panel border p-3 text-left transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] ${
          activeId === DEEPSEEK_PROVIDER_ID
            ? 'border-accent bg-accent/10'
            : 'border-border-subtle bg-bg-elevated hover:border-border-hover'
        }`}
      >
        <Server size={16} className={activeId === DEEPSEEK_PROVIDER_ID ? 'text-accent' : 'text-text-muted'} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">DeepSeek（内置）</p>
          <p className="text-caption text-text-muted">deepseek-v4-pro / deepseek-flash · 1M 上下文 · 密钥在上方配置</p>
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
            className={`mb-2 rounded-panel border p-3 transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] ${
              isActive ? 'border-accent bg-accent/10' : 'border-border-subtle bg-bg-elevated'
            }`}
          >
            <div className="flex items-center gap-3">
              <Server size={16} className={isActive ? 'text-accent' : 'text-text-muted'} />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">{p.name}</p>
                <p className="truncate text-caption text-text-muted">
                  {p.baseUrl} · {p.models.length} 个模型
                  {p.contextWindowTokens ? ` · ${(p.contextWindowTokens / 1000).toFixed(0)}K 上下文` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {!isActive && (
                  <button
                    onClick={() => setActive(p.id)}
                    className="rounded-control px-2 py-1 text-caption text-accent transition-colors hover:bg-accent/10 active:scale-[0.97]"
                  >
                    设为活跃
                  </button>
                )}
                <button
                  onClick={() => void testProvider(p)}
                  className="rounded-control p-1.5 text-text-muted transition-colors hover:text-accent active:scale-[0.97]"
                  title="测试连接"
                >
                  <Zap size={13} />
                </button>
                <button
                  onClick={() => { setDraft(toDraft(p)); setDraftError(''); setFetchMsg('') }}
                  className="rounded-control p-1.5 text-text-muted transition-colors hover:text-text-primary active:scale-[0.97]"
                  title="编辑"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => removeProvider(p.id)}
                  className="rounded-control p-1.5 text-text-muted transition-colors hover:text-red-400 active:scale-[0.97]"
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
                  <p className="flex items-center gap-1.5 text-caption text-text-muted">
                    <Loader2 size={11} className="animate-spin" /> 测试中...
                  </p>
                ) : (
                  <p className={`flex items-center gap-1.5 text-caption ${t.result.success ? 'text-emerald-400' : 'text-red-400'}`}>
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
          className="flex w-full items-center justify-center gap-1.5 rounded-panel border border-dashed border-border py-2 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent active:scale-[0.97]"
        >
          <Plus size={13} />
          添加自定义服务商
        </button>
      )}

      {draft && (
        <ProviderDraftForm
          draft={draft}
          draftError={draftError}
          fetching={fetching}
          fetchMsg={fetchMsg}
          onDraftChange={setDraft}
          onCancel={() => { setDraft(null); setDraftError(''); setFetchMsg('') }}
          onSave={saveDraft}
          onFetchModels={fetchModels}
        />
      )}

      <p className="mt-2 text-caption text-text-muted">
        仅支持 OpenAI 兼容协议。切换活跃服务商后，新消息将通过该服务商发送；思考模式在不支持 reasoning 参数的服务商下自动关闭。
      </p>
    </div>
  )
}
