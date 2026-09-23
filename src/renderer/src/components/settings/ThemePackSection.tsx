import { useState, useEffect, useCallback, useRef } from 'react'
import { Package, Upload, Trash2, Check, AlertCircle } from 'lucide-react'
import { CollapsibleSection } from './shared-components'
import { SpinnerBlock } from '@renderer/components/shared/Spinner'

interface ThemePack {
  id: string
  name: string
  description?: string
  author?: string
  light?: Record<string, string>
  dark?: Record<string, string>
}

/**
 * ThemePackSection — 自定义主题包管理区域
 *
 * 用户可导入 JSON 主题包文件，每个主题包定义浅色/深色模式下的 CSS 变量覆盖。
 * 导入后存储在 userData/themes/ 目录，跨会话持久化。
 */
export function ThemePackSection({
  activePackId,
  onApply,
}: {
  activePackId?: string
  onApply: (packId: string | undefined) => void
}): React.ReactElement {
  const [packs, setPacks] = useState<ThemePack[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadPacks = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.api.themePack.list()
      setPacks(list)
    } catch (e) {
      setError(`加载失败: ${(e as Error).message}`)
    }
    setLoading(false)
  }, [])

  useEffect(() => { void loadPacks() }, [loadPacks])

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // 允许重复导入同一文件
    try {
      const text = await file.text()
      const pack = await window.api.themePack.import(text)
      setPacks((prev) => {
        const filtered = prev.filter((p) => p.id !== pack.id)
        return [...filtered, pack].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      })
      setError(null)
    } catch (e) {
      setError(`导入失败: ${(e as Error).message}`)
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    if (!confirm(`确认删除主题包？`)) return
    await window.api.themePack.delete(id)
    setPacks((prev) => prev.filter((p) => p.id !== id))
    if (activePackId === id) onApply(undefined)
  }

  return (
    <CollapsibleSection
      icon={<Package size={16} />}
      title="自定义主题包"
      desc="导入 JSON 主题包，覆盖默认 UI 配色"
    >
      {/* 导入按钮 + 格式提示 */}
      <div className="flex items-center justify-between py-1">
        <p className="text-xs text-text-muted">
          {packs.length > 0 ? `已导入 ${packs.length} 个主题包` : '暂无自定义主题包'}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 rounded-control border border-border bg-bg-elevated px-3 py-1 text-caption text-text-secondary transition-colors hover:border-accent hover:text-accent active:scale-[0.97]"
          >
            <Upload size={13} /> 导入主题包
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          onChange={(e) => void handleImport(e)}
          className="hidden"
        />
      </div>

      {error && (
        <div className="mt-2 flex items-center gap-2 rounded-card bg-red-500/10 p-2 text-caption text-red-400">
          <AlertCircle size={13} /> {error}
        </div>
      )}

      {/* 主题包网格 */}
      {loading ? (
        <SpinnerBlock size="sm" className="py-4" />
      ) : (
        <div className="mt-2 space-y-2">
          {/* 默认主题选项 */}
          <button
            onClick={() => onApply(undefined)}
            className={`w-full rounded-card border p-2.5 text-left transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] ${
              !activePackId ? 'border-accent bg-accent/10' : 'border-border bg-bg-elevated hover:border-border-hover'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold ${!activePackId ? 'text-accent' : 'text-text-primary'}`}>
                默认主题
              </span>
              {!activePackId && <Check size={13} className="text-accent" />}
            </div>
            <p className="text-caption text-text-muted">使用内置配色，跟随主题颜色选择</p>
          </button>

          {/* 已导入的主题包 */}
          {packs.map((pack) => {
            const isActive = activePackId === pack.id
            // 从主题包提取预览色（优先用 dark 模式的变量）
            const previewVars = pack.dark || pack.light || {}
            const colors = ['--theme-color', '--bg-base', '--text-primary']
              .map((k) => previewVars[k])
              .filter(Boolean) as string[]

            return (
              <div
                key={pack.id}
                className={`group rounded-card border p-2.5 transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] ${
                  isActive ? 'border-accent bg-accent/10' : 'border-border bg-bg-elevated hover:border-border-hover'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {/* 颜色预览 */}
                      <div className="flex gap-0.5">
                        {colors.length > 0 ? colors.slice(0, 3).map((c, i) => (
                          <div
                            key={i}
                            className="h-3 w-3 rounded-full ring-1 ring-white/20"
                            style={{ backgroundColor: c }}
                          />
                        )) : (
                          <div className="h-3 w-3 rounded-full bg-border" />
                        )}
                      </div>
                      <span className={`text-xs font-semibold ${isActive ? 'text-accent' : 'text-text-primary'}`}>
                        {pack.name}
                      </span>
                    </div>
                    {pack.description && (
                      <p className="mt-0.5 text-caption text-text-muted">{pack.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => onApply(isActive ? undefined : pack.id)}
                      className={`rounded-control p-1 text-text-muted transition-colors hover:text-accent ${isActive ? 'text-accent' : ''}`}
                      title={isActive ? '取消应用' : '应用此主题'}
                    >
                      <Check size={13} />
                    </button>
                    <button
                      onClick={() => void handleDelete(pack.id)}
                      className="rounded-control p-1 text-text-muted opacity-0 transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] hover:text-red-400 group-hover:opacity-100 active:scale-[0.97]"
                      title="删除"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 格式说明 */}
      <details className="mt-2">
        <summary className="cursor-pointer text-caption text-text-muted hover:text-text-secondary">
          主题包 JSON 格式说明
        </summary>
        <pre className="mt-1 overflow-x-auto rounded-card bg-bg-input p-2 text-caption leading-relaxed text-text-secondary" style={{ fontFamily: 'inherit' }}>{`{
  "id": "midnight-aurora",
  "name": "午夜极光",
  "description": "深蓝紫调极光主题",
  "light": {
    "--theme-color": "#6366f1",
    "--bg-base": "#f0f2f8",
    "--text-primary": "#1a1a2e"
  },
  "dark": {
    "--theme-color": "#818cf8",
    "--bg-base": "#0a0a18",
    "--text-primary": "#e8e8f0"
  }
}`}</pre>
        <p className="mt-1 text-caption text-text-muted">
          只需指定要覆盖的 CSS 变量，未指定的变量保持默认值。light/dark 至少需要一个。
        </p>
      </details>
    </CollapsibleSection>
  )
}

export default ThemePackSection
