import { useState, useEffect, useRef } from 'react'
import { Cpu, Bolt, ChevronDown, Server } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { DEEPSEEK_PROVIDER_ID } from '@renderer/lib/providers'
import type { ModelId } from '@shared/types'

/** 内置 DeepSeek 模型选项 */
const DEEPSEEK_OPTIONS: { id: ModelId; label: string; shortLabel: string; icon: typeof Cpu; desc: string }[] = [
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', shortLabel: 'V4 Pro', icon: Cpu, desc: '旗舰版 · 深度推理' },
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', shortLabel: 'V4 Flash', icon: Bolt, desc: '轻量版 · 快速响应' }
]

/**
 * 模型选择器 — 两级结构：内置 DeepSeek + 自定义服务商的预设模型。
 * 选中后同时写入 activeProviderId 与 model。
 */
export function ModelSelector(): React.ReactElement {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const activeProviderId = settings?.activeProviderId ?? DEEPSEEK_PROVIDER_ID
  const model = settings?.model ?? 'deepseek-v4-pro'
  const providers = settings?.providers ?? []
  const activeProvider = activeProviderId === DEEPSEEK_PROVIDER_ID
    ? undefined
    : providers.find((p) => p.id === activeProviderId)

  // 当前展示标签：自定义服务商下用模型名，内置用短标签
  const dsOption = DEEPSEEK_OPTIONS.find((o) => o.id === model)
  const displayLabel = activeProvider ? model : (dsOption?.shortLabel ?? 'V4 Pro')
  const Icon = activeProvider ? Server : (dsOption?.icon ?? Cpu)

  const select = (providerId: string, modelId: ModelId): void => {
    void updateSettings({ activeProviderId: providerId, model: modelId })
    setOpen(false)
  }

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      {/* 触发按钮 */}
      <button
        onClick={() => setOpen(!open)}
        className={`chip flex cursor-pointer items-center gap-1 px-2 py-1 text-[11px] transition-all duration-200 active:scale-95 ${
          open ? 'border-accent/40 text-accent bg-accent/8' : 'text-text-secondary hover:text-text-primary hover:border-border-hover'
        }`}
      >
        <Icon size={11} />
        <span className="max-w-[120px] truncate">{displayLabel}</span>
        <ChevronDown size={10} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* 下拉面板 */}
      {open && (
        <div className="absolute bottom-full right-0 mb-2 min-w-[220px] max-h-[320px] overflow-y-auto rounded-xl border border-border-subtle bg-bg-elevated shadow-glass animate-fade-scale">
          {/* DeepSeek 内置 */}
          <div className="px-3 py-1.5 text-[10px] text-text-muted border-b border-border-subtle">
            DeepSeek（内置）
          </div>
          {DEEPSEEK_OPTIONS.map((opt) => {
            const OptIcon = opt.icon
            const isActive = activeProviderId === DEEPSEEK_PROVIDER_ID && opt.id === model
            return (
              <button
                key={opt.id}
                onClick={() => select(DEEPSEEK_PROVIDER_ID, opt.id)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                  isActive ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                }`}
              >
                <OptIcon size={13} className={isActive ? 'text-accent' : 'text-text-muted'} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium leading-tight">{opt.label}</p>
                  <p className="text-[10px] leading-tight text-text-muted">{opt.desc}</p>
                </div>
                {isActive && <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow" />}
              </button>
            )
          })}

          {/* 自定义服务商 */}
          {providers.map((p) => (
            <div key={p.id}>
              <div className="px-3 py-1.5 text-[10px] text-text-muted border-y border-border-subtle bg-bg-hover/40">
                {p.name}
              </div>
              {p.models.map((m) => {
                const isActive = activeProviderId === p.id && m === model
                return (
                  <button
                    key={`${p.id}:${m}`}
                    onClick={() => select(p.id, m)}
                    className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
                      isActive ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                    }`}
                  >
                    <Server size={12} className={isActive ? 'text-accent' : 'text-text-muted'} />
                    <p className="flex-1 truncate text-[12px] font-medium leading-tight">{m}</p>
                    {isActive && <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow" />}
                  </button>
                )
              })}
            </div>
          ))}

          {providers.length === 0 && (
            <p className="px-3 py-2 text-[10px] text-text-muted">
              可在 设置 → API 中添加自定义服务商
            </p>
          )}
        </div>
      )}
    </div>
  )
}
