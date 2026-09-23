import { useMemo } from 'react'
import { Send, Sparkles } from 'lucide-react'
import { getDefaultVars } from './theme-schema'

type Mode = 'light' | 'dark'

/**
 * ThemePreview — 实时迷你 UI 预览
 *
 * 将正在编辑的变量直接注入到预览容器的 style 上，
 * 所有 var() 引用会读取预览本地的值，而非 document 全局。
 * 这样即使用户未开启"启用自定义主题"，或正在编辑的模式和 APP 当前模式不一致，
 * 预览都能实时反映编辑结果。
 */
export function ThemePreview({
  mode,
  customVars,
}: {
  mode: Mode
  customVars: Record<string, string>
}): React.ReactElement {
  // 合并默认值 + 用户自定义，作为预览容器的 CSS 变量
  const cssVars = useMemo(() => {
    const defaults = getDefaultVars(mode)
    return { ...defaults, ...customVars }
  }, [mode, customVars])

  return (
    <div
      className="rounded-panel border border-border overflow-hidden"
      style={{ ...cssVars, backgroundColor: 'var(--bg-base)' } as React.CSSProperties}
    >
      {/* 标题栏 */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle"
        style={{ backgroundColor: 'var(--glass-bg)' }}
      >
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--accent-DEFAULT)' }} />
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--text-muted)' }} />
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--text-muted)' }} />
        </div>
        <span className="text-caption font-medium" style={{ color: 'var(--text-secondary)' }}>
          {mode === 'light' ? '浅色预览' : '深色预览'}
        </span>
      </div>

      {/* 内容区 */}
      <div className="space-y-2 p-3" style={{ minHeight: '180px' }}>
        {/* AI 消息 */}
        <div className="flex gap-2">
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: 'var(--accent-fill, var(--theme-color))' }}
          >
            <Sparkles size={13} style={{ color: 'var(--accent-on-fill, #fff)' }} />
          </div>
          <div
            className="rounded-panel rounded-tl-control px-3 py-2 max-w-[80%]"
            style={{
              backgroundColor: 'var(--glass-bg)',
              border: '1px solid var(--glass-border)',
              color: 'var(--text-primary)',
              boxShadow: 'var(--glass-shadow)',
            }}
          >
            <p className="text-caption leading-relaxed">你好！主题修改会实时反映在这里。</p>
          </div>
        </div>

        {/* 用户消息 */}
        <div className="flex justify-end">
          <div
            className="rounded-panel rounded-tr-control px-3 py-2 max-w-[80%]"
            style={{
              backgroundColor: 'var(--accent-DEFAULT)',
              color: '#fff',
            }}
          >
            <p className="text-caption leading-relaxed">收到，看起来不错！</p>
          </div>
        </div>

        {/* 卡片 + 按钮 */}
        <div
          className="rounded-card p-2.5"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-DEFAULT)',
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-caption font-medium" style={{ color: 'var(--text-primary)' }}>
                设置卡片
              </p>
              <p className="text-caption" style={{ color: 'var(--text-muted)' }}>
                描述文字
              </p>
            </div>
            <button
              className="rounded-control px-3 py-1 text-caption font-medium text-white transition-colors"
              style={{
                backgroundColor: 'var(--accent-DEFAULT)',
                boxShadow: '0 0 12px -2px var(--glow-color)',
              }}
            >
              按钮
            </button>
          </div>
        </div>

        {/* 输入框 */}
        <div
          className="flex items-center gap-2 rounded-card px-3 py-1.5"
          style={{
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-DEFAULT)',
          }}
        >
          <input
            readOnly
            placeholder="输入消息..."
            className="flex-1 bg-transparent text-caption focus-ring"
            style={{ color: 'var(--text-primary)' }}
          />
          <div
            className="flex h-5 w-5 items-center justify-center rounded-control"
            style={{ backgroundColor: 'var(--accent-fill, var(--theme-color))' }}
          >
            <Send size={11} style={{ color: 'var(--accent-on-fill, #fff)' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
