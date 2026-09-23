import { useCallback, useEffect, useRef, useState } from 'react'
import type { AutoModeLevel } from '@shared/types'
import { Check } from 'lucide-react'
import {
  AUTO_MODE_OPTIONS,
  AUTO_MODE_TRIGGER_TONE,
  autoModeOption,
  normalizeAutoMode
} from '@renderer/lib/auto-mode'

/**
 * 自动化等级下拉选择 —— 替代原先"点击循环切换"的 YOLO 胶囊。
 *
 * 为什么改成下拉：
 * 原来一次点击就在 手动 → Safe → YOLO → 手动 之间轮转，
 * 想从「手动」到「完全访问」要连点两次，而且**中间那一下就已经生效**（可能恰好是你最不想要的档）；
 * 三个档位的名字也看不全，用户得靠记忆。下拉把三档一次摊开，点哪档是哪档。
 *
 * 危险档用红色单独标记 —— 「完全访问」会关掉整条确认链路（主进程不再下发确认请求）。
 */
export function AutoModeSelect({
  level,
  onChange
}: {
  level: AutoModeLevel
  onChange: (next: AutoModeLevel) => void
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])

  const current = autoModeOption(level)
  const CurrentIcon = current.icon
  const activeIndex = AUTO_MODE_OPTIONS.findIndex((o) => o.value === current.value)

  /* 点击外部 / Esc 关闭 */
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  /* 展开后把焦点交给当前档位 —— 键盘用户可以立刻用方向键换档 */
  useEffect(() => {
    if (!open) return
    const i = activeIndex >= 0 ? activeIndex : 0
    optionRefs.current[i]?.focus({ preventScroll: true })
  }, [open, activeIndex])

  const pick = useCallback(
    (next: AutoModeLevel): void => {
      onChange(normalizeAutoMode(next))
      setOpen(false)
    },
    [onChange]
  )

  const onOptionKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, i: number): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const dir = e.key === 'ArrowDown' ? 1 : -1
      const next = (i + dir + AUTO_MODE_OPTIONS.length) % AUTO_MODE_OPTIONS.length
      optionRefs.current[next]?.focus({ preventScroll: true })
    } else if (e.key === 'Home') {
      e.preventDefault()
      optionRefs.current[0]?.focus({ preventScroll: true })
    } else if (e.key === 'End') {
      e.preventDefault()
      optionRefs.current[AUTO_MODE_OPTIONS.length - 1]?.focus({ preventScroll: true })
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`自动化等级：${current.label}`}
        title={`自动化等级：${current.label} —— ${current.desc}`}
        className={`chip flex items-center gap-1 px-2 py-0.5 text-caption font-medium transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] duration-fast active:scale-95 ${
          open
            ? 'border-accent/40 text-accent bg-accent/8'
            : AUTO_MODE_TRIGGER_TONE[current.tone]
        }`}
      >
        <CurrentIcon size={11} />
        {current.short}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="自动化等级"
          className="absolute bottom-full left-0 z-30 mb-2 w-[236px] overflow-hidden rounded-panel border border-border-subtle bg-bg-elevated p-1 shadow-glass animate-fade-scale"
        >
          {AUTO_MODE_OPTIONS.map((opt, i) => {
            const Icon = opt.icon
            const selected = opt.value === current.value
            return (
              <button
                key={opt.value}
                ref={(el) => {
                  optionRefs.current[i] = el
                }}
                role="option"
                aria-selected={selected}
                onClick={() => pick(opt.value)}
                onKeyDown={(e) => onOptionKeyDown(e, i)}
                onKeyUp={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    pick(opt.value)
                  }
                }}
                className={`focus-ring flex w-full items-start gap-2 rounded-card px-2 py-1.5 text-left transition-colors duration-fast ${
                  selected ? 'bg-accent/10' : 'hover:bg-bg-hover'
                }`}
              >
                <Icon
                  size={13}
                  className={`mt-0.5 shrink-0 ${
                    opt.tone === 'danger'
                      ? 'text-red-400'
                      : selected
                        ? 'text-accent'
                        : 'text-text-muted'
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-xs font-medium ${
                      selected ? 'text-accent' : 'text-text-primary'
                    }`}
                  >
                    {opt.label}
                  </span>
                  <span className="mt-0.5 block text-caption leading-relaxed text-text-muted">
                    {opt.desc}
                  </span>
                </span>
                {selected && <Check size={13} className="mt-0.5 shrink-0 text-accent" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
