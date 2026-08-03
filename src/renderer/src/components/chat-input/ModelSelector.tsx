import { useState, useEffect, useRef } from 'react'
import { Cpu, Bolt, ChevronDown } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import type { ModelId } from '@shared/types'

/** 自定义模型选择器 — 毛玻璃风格下拉面板 */
const MODEL_OPTIONS: { id: ModelId; label: string; shortLabel: string; icon: typeof Cpu; desc: string }[] = [
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', shortLabel: 'V4 Pro', icon: Cpu, desc: '旗舰版 · 深度推理' },
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', shortLabel: 'V4 Flash', icon: Bolt, desc: '轻量版 · 快速响应' }
]

export function ModelSelector(): React.ReactElement {
  const model = useStore((s) => s.settings?.model ?? 'deepseek-v4-pro')
  const updateSettings = useStore((s) => s.updateSettings)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const current = MODEL_OPTIONS.find((o) => o.id === model) ?? MODEL_OPTIONS[0]
  const Icon = current.icon

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
        <span>{current.shortLabel}</span>
        <ChevronDown size={10} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* 下拉面板 */}
      {open && (
        <div className="absolute bottom-full right-0 mb-2 min-w-[200px] rounded-xl border border-border-subtle bg-bg-elevated shadow-glass animate-fade-scale overflow-hidden">
          <div className="px-3 py-1.5 text-[10px] text-text-muted border-b border-border-subtle">
            选择模型
          </div>
          {MODEL_OPTIONS.map((opt) => {
            const OptIcon = opt.icon
            const isActive = opt.id === model
            return (
              <button
                key={opt.id}
                onClick={() => {
                  void updateSettings({ model: opt.id })
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                }`}
              >
                <OptIcon size={13} className={isActive ? 'text-accent' : 'text-text-muted'} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium leading-tight">{opt.label}</p>
                  <p className="text-[10px] leading-tight text-text-muted">{opt.desc}</p>
                </div>
                {isActive && (
                  <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
