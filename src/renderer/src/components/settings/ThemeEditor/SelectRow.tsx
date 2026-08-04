import { memo, useCallback } from 'react'

/**
 * SelectRow — 选项按钮组编辑器
 *
 * 用于枚举型 CSS 变量（如 flat / preserve-3d）。
 * 用户通过点击选项按钮切换值。
 */
export const SelectRow = memo(function SelectRow({
  label,
  desc,
  value,
  onChange,
  options,
}: {
  label: string
  desc?: string
  value: string
  onChange: (v: string) => void
  options: string[]
}): React.ReactElement {
  const handleClick = useCallback((opt: string): void => {
    onChange(opt)
  }, [onChange])

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-text-primary">{label}</p>
          {desc && <p className="text-[10px] text-text-muted truncate">{desc}</p>}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => handleClick(opt)}
            className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
              value === opt
                ? 'bg-accent/15 text-accent'
                : 'border border-border text-text-muted hover:text-text-secondary'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
})
