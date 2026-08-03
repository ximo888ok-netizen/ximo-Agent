import { useState, useMemo, useCallback } from 'react'
import { Sun, Moon, RotateCcw, Download, Sparkles, ChevronDown } from 'lucide-react'
import { CollapsibleSection } from '@renderer/components/settings/shared-components'
import { THEME_SCHEMA, getDefaultVars, type ThemeVarMeta } from './theme-schema'
import { THEME_PRESETS, type ThemePreset } from './theme-presets'
import { VarRow } from './VarRow'
import { ThemePreview } from './ThemePreview'
import { BackgroundSection } from './BackgroundSection'
import type { AppSettings, BackgroundImageConfig } from '@shared/types'

type Mode = 'light' | 'dark'

/**
 * ThemeEditor — 可视化主题编辑器主组件
 *
 * 编排层：管理浅色/深色 Tab 切换、预设选择、变量编辑、自定义 CSS、导出。
 */
export function ThemeEditor({
  settings,
  update,
}: {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
}): React.ReactElement {
  const [mode, setMode] = useState<Mode>(settings.theme ?? 'dark')
  const [presetOpen, setPresetOpen] = useState(false)

  const enabled = settings.customThemeEnabled ?? false
  const varsLight = settings.customThemeVarsLight ?? {}
  const varsDark = settings.customThemeVarsDark ?? {}
  const customCss = settings.customCss ?? ''
  const bgConfig = settings.backgroundImage ?? { type: 'none' as const }

  const currentVars = mode === 'light' ? varsLight : varsDark
  const defaultVars = useMemo(() => getDefaultVars(mode), [mode])

  // 单个变量值变更
  const handleVarChange = useCallback((key: string, value: string) => {
    const field = mode === 'light' ? 'customThemeVarsLight' : 'customThemeVarsDark'
    const updated = { ...(mode === 'light' ? varsLight : varsDark), [key]: value }
    update({ [field]: updated } as Partial<AppSettings>)
  }, [mode, varsLight, varsDark, update])

  // 单个变量重置
  const handleVarReset = useCallback((key: string) => {
    const field = mode === 'light' ? 'customThemeVarsLight' : 'customThemeVarsDark'
    const current = { ...(mode === 'light' ? varsLight : varsDark) }
    delete current[key]
    update({ [field]: current } as Partial<AppSettings>)
  }, [mode, varsLight, varsDark, update])

  // 整个分类重置
  const handleCategoryReset = useCallback((catVars: ThemeVarMeta[]) => {
    const field = mode === 'light' ? 'customThemeVarsLight' : 'customThemeVarsDark'
    const current = { ...(mode === 'light' ? varsLight : varsDark) }
    for (const v of catVars) delete current[v.key]
    update({ [field]: current } as Partial<AppSettings>)
  }, [mode, varsLight, varsDark, update])

  // 全部重置
  const handleResetAll = useCallback(() => {
    update({
      customThemeVarsLight: undefined,
      customThemeVarsDark: undefined,
      customCss: '',
      customThemeEnabled: false,
    })
  }, [update])

  // 应用预设
  const handleApplyPreset = useCallback((preset: ThemePreset) => {
    update({
      customThemeEnabled: true,
      customThemeVarsLight: { ...preset.light },
      customThemeVarsDark: { ...preset.dark },
    })
    setPresetOpen(false)
  }, [update])

  // 导出为主题包 JSON
  const handleExport = useCallback(() => {
    const pack = {
      id: `custom-${Date.now()}`,
      name: '我的自定义主题',
      description: '由可视化主题编辑器导出',
      light: Object.keys(varsLight).length > 0 ? varsLight : undefined,
      dark: Object.keys(varsDark).length > 0 ? varsDark : undefined,
    }
    const json = JSON.stringify(pack, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${pack.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [varsLight, varsDark])

  // 更新背景图配置
  const handleBgChange = useCallback((cfg: BackgroundImageConfig) => {
    update({ backgroundImage: cfg })
  }, [update])

  return (
    <CollapsibleSection
      icon={<Sparkles size={16} />}
      title="可视化主题编辑器"
      desc="纯手动调色 · 实时预览 · 无需写代码"
      defaultOpen={false}
    >
      {/* 开关 */}
      <div className="flex items-center justify-between py-1.5">
        <span className="text-xs text-text-secondary">启用自定义主题（关闭则使用默认主题）</span>
        <button
          onClick={() => update({ customThemeEnabled: !enabled })}
          className={`relative h-5 w-9 rounded-full transition-colors ${
            enabled ? 'bg-accent' : 'bg-border'
          }`}
        >
          <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-md transition-transform ${enabled ? 'translate-x-[16px]' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* 预览区 */}
      <div className="py-2">
        <ThemePreview mode={mode} customVars={currentVars} />
      </div>

      {/* 浅色/深色 Tab */}
      <div className="flex items-center gap-1 py-1">
        {(['light', 'dark'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              mode === m ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {m === 'light' ? <Sun size={12} /> : <Moon size={12} />}
            {m === 'light' ? '浅色模式' : '深色模式'}
          </button>
        ))}

        <div className="flex-1" />

        {/* 预设模板下拉 */}
        <div className="relative">
          <button
            onClick={() => setPresetOpen(!presetOpen)}
            className="flex items-center gap-1 rounded-md border border-border bg-bg-elevated px-2 py-1 text-[11px] text-text-secondary transition-colors hover:border-accent hover:text-accent"
          >
            预设模板 <ChevronDown size={11} className={`transition-transform ${presetOpen ? 'rotate-180' : ''}`} />
          </button>
          {presetOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setPresetOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-border bg-bg-elevated p-1 shadow-lg">
                {THEME_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleApplyPreset(p)}
                    className="block w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/10"
                  >
                    <p className="text-[11px] font-medium text-text-primary">{p.name}</p>
                    <p className="text-[10px] text-text-muted">{p.desc}</p>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 变量编辑区 — 按分类折叠 */}
      <div className="space-y-1.5">
        {THEME_SCHEMA.map((cat) => {
          const catModified = cat.vars.some((v) => currentVars[v.key] !== undefined)
          return (
            <details key={cat.id} className="rounded-lg border border-border-subtle overflow-hidden">
              <summary className="flex cursor-pointer items-center justify-between px-2.5 py-1.5 hover:bg-bg-hover">
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-text-primary">
                  <span>{cat.icon}</span>
                  {cat.label}
                  <span className="text-[9px] text-text-muted">({cat.vars.length})</span>
                </span>
                <div className="flex items-center gap-1">
                  {catModified && (
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCategoryReset(cat.vars) }}
                      className="rounded p-0.5 text-text-muted transition-colors hover:text-accent"
                      title="重置此分类"
                    >
                      <RotateCcw size={11} />
                    </button>
                  )}
                  <ChevronDown size={12} className="text-text-muted" />
                </div>
              </summary>
              <div className="border-t border-border-subtle px-2.5 py-1">
                {cat.vars.map((meta) => (
                  <VarRow
                    key={meta.key}
                    meta={meta}
                    value={currentVars[meta.key] ?? defaultVars[meta.key]}
                    defaultValue={defaultVars[meta.key]}
                    onChange={(v) => handleVarChange(meta.key, v)}
                    onReset={() => handleVarReset(meta.key)}
                  />
                ))}
              </div>
            </details>
          )
        })}
      </div>

      {/* 高级 — 自定义 CSS（面向有经验的用户） */}
      <details className="mt-2 rounded-md border border-border-subtle">
        <summary className="flex cursor-pointer items-center gap-1 px-2.5 py-1.5 text-[11px] text-text-muted hover:text-text-secondary">
          <ChevronDown size={11} className="transition-transform" />
          高级选项 · 自定义 CSS 注入
        </summary>
        <div className="border-t border-border-subtle px-2.5 py-2">
          <p className="mb-1 text-[10px] text-text-muted">如果上面的可视化控件不够用，可以在这里写自定义 CSS，将追加到全局样式末尾。</p>
          <textarea
            value={customCss}
            onChange={(e) => update({ customCss: e.target.value })}
            placeholder={`/* 可选：写任意 CSS 覆盖 */\n.ios-card {\n  border-radius: 8px;\n}`}
            className="h-24 w-full resize-y rounded-md border border-border bg-bg-input p-2 font-mono text-[11px] text-text-primary focus:border-accent focus:outline-none"
            spellCheck={false}
          />
        </div>
      </details>

      {/* 背景图区域 */}
      <div className="mt-2">
        <BackgroundSection config={bgConfig} onChange={handleBgChange} />
      </div>

      {/* 底部操作 */}
      <div className="mt-2 flex items-center justify-between border-t border-border-subtle pt-2">
        <button
          onClick={handleResetAll}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-text-muted transition-colors hover:text-red-400"
        >
          <RotateCcw size={12} /> 全部重置
        </button>
        <button
          onClick={handleExport}
          className="flex items-center gap-1 rounded-md border border-border bg-bg-elevated px-2.5 py-1 text-[11px] text-text-secondary transition-colors hover:border-accent hover:text-accent"
        >
          <Download size={12} /> 导出主题包
        </button>
      </div>
    </CollapsibleSection>
  )
}
