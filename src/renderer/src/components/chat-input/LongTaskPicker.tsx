import { useEffect, useRef, useState } from 'react'
import { Infinity as InfinityIcon, ChevronUp } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'

/**
 * LongTaskPicker — 长任务模式下拉选择器
 * 标准 / 长任务 两档，按会话独立记忆（Conversation.longTask）。
 * 长任务模式：注入长任务执行协议 + 自动 Ultra 思考强度 + 自动展开任务列表，
 * Agent 持续工作直到任务达到用户需求为止。
 */
const LONG_TASK_OPTIONS = [
  { value: false, label: '标准', desc: '常规问答，快速响应' },
  { value: true, label: '长任务', desc: '复杂任务自动拆解，持续执行直到满足需求' }
] as const

export function LongTaskPicker(): React.ReactElement {
  // 仅订阅当前会话的 longTask 布尔值 — 避免订阅整个 conversations 数组导致重渲染
  const longTask = useStore((s) => s.conversations.find((c) => c.id === s.currentConversationId)?.longTask ?? false)
  const setLongTask = useStore((s) => s.setLongTask)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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
        className={`chip flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium transition-all duration-200 active:scale-95 ${
          longTask
            ? 'border-accent/40 text-accent bg-accent/15 shadow-[0_0_10px_color-mix(in_srgb,var(--theme-color)_30%,transparent)]'
            : 'text-text-muted hover:text-text-secondary'
        }`}
        title="任务模式：标准（常规问答） / 长任务（复杂任务自动拆解，持续执行直到满足需求）"
      >
        {longTask ? <InfinityIcon size={11} className="text-accent" /> : <InfinityIcon size={11} />}
        <span>{longTask ? '长任务' : '标准'}</span>
        <ChevronUp size={10} className={`text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* 向上展开的下拉面板 — 输入框位于底部，向下展开会超出可视区 */}
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1.5 w-44 rounded-b-xl rounded-t-md border border-border-subtle bg-bg-elevated shadow-glass animate-fade-scale">
          <div className="px-3 py-1.5 text-[10px] text-text-muted border-b border-border-subtle">
            任务模式
          </div>
          {LONG_TASK_OPTIONS.map((opt) => (
            <button
              key={String(opt.value)}
              onClick={() => {
                setLongTask(opt.value)
                setOpen(false)
              }}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-bg-hover ${
                longTask === opt.value ? 'text-accent' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <span className="flex flex-col">
                <span className="text-xs font-medium">{opt.label}</span>
                <span className="text-[10px] text-text-muted">{opt.desc}</span>
              </span>
              {longTask === opt.value && (
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
