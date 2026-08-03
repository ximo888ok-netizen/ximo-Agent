import { Type, Sun, Moon, Palette, CheckCircle2 } from 'lucide-react'
import type { AppSettings, FontSize } from '@shared/types'
import { THEME_PRESETS, SectionTitle } from './shared-components'
import { ThemePackSection } from './ThemePackSection'
import { ThemeEditor } from './ThemeEditor/ThemeEditor'
import { StartupAnimationSection } from './StartupAnimationSection'
import { DataManagementSection } from './DataManagementSection'

export function AppearanceTab({
  local,
  update,
  onExport,
  onImport,
  onClearAll,
  importMsg,
  fileInputRef,
  convoCount,
  transitionFileRef,
  transitionMsg,
  onImportTransition,
}: {
  local: AppSettings
  update: (patch: Partial<AppSettings>) => void
  onExport: () => void
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void
  onClearAll: () => void
  importMsg: { ok: boolean; text: string } | null
  fileInputRef: React.RefObject<HTMLInputElement>
  convoCount: number
  transitionFileRef: React.RefObject<HTMLInputElement>
  transitionMsg: { ok: boolean; text: string } | null
  onImportTransition: (e: React.ChangeEvent<HTMLInputElement>) => void
}): React.ReactElement {
  return (
    <div className="space-y-5">
      <SectionTitle title="聊天外观" desc="调整对话界面的显示偏好" />

      {/* 字体大小 */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Type size={15} className="text-accent" />
          <label className="text-sm font-medium text-text-primary">消息字体大小</label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(['sm', 'md', 'lg'] as FontSize[]).map((fs) => (
            <button
              key={fs}
              onClick={() => update({ fontSize: fs })}
              className={`rounded-lg border p-3 text-center transition-colors ${
                local.fontSize === fs ? 'border-accent bg-accent/10' : 'border-border bg-bg-elevated hover:border-border-hover'
              }`}
            >
              <p className={`font-medium ${local.fontSize === fs ? 'text-accent' : 'text-text-primary'}`} style={{ fontSize: fs === 'sm' ? '13px' : fs === 'md' ? '15px' : '17px' }}>
                {fs === 'sm' ? '小' : fs === 'md' ? '中' : '大'}
              </p>
              <p className="mt-0.5 text-[10px] text-text-muted">{fs === 'sm' ? '13px' : fs === 'md' ? '15px' : '17px'}</p>
            </button>
          ))}
        </div>
      </div>

      {/* 明暗主题 */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          {local.theme === 'dark' ? <Moon size={15} className="text-accent" /> : <Sun size={15} className="text-accent" />}
          <label className="text-sm font-medium text-text-primary">界面主题</label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => update({ theme: 'light' })}
            className={`rounded-lg border p-3 text-center transition-colors ${
              local.theme === 'light' ? 'border-accent bg-accent/10' : 'border-border bg-bg-elevated hover:border-border-hover'
            }`}
          >
            <Sun size={18} className={`mx-auto ${local.theme === 'light' ? 'text-accent' : 'text-text-muted'}`} />
            <p className={`mt-1 text-xs font-medium ${local.theme === 'light' ? 'text-accent' : 'text-text-primary'}`}>浅色</p>
          </button>
          <button
            onClick={() => update({ theme: 'dark' })}
            className={`rounded-lg border p-3 text-center transition-colors ${
              local.theme === 'dark' ? 'border-accent bg-accent/10' : 'border-border bg-bg-elevated hover:border-border-hover'
            }`}
          >
            <Moon size={18} className={`mx-auto ${local.theme === 'dark' ? 'text-accent' : 'text-text-muted'}`} />
            <p className={`mt-1 text-xs font-medium ${local.theme === 'dark' ? 'text-accent' : 'text-text-primary'}`}>深色</p>
          </button>
        </div>
      </div>

      {/* 主题颜色 */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Palette size={15} className="text-accent" />
          <label className="text-sm font-medium text-text-primary">主题颜色</label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => update({ themeColor: preset.value })}
              className={`h-8 w-8 rounded-full transition-all ${
                local.themeColor.toLowerCase() === preset.value.toLowerCase() ? 'ring-2 ring-offset-2 ring-offset-bg-surface' : 'hover:scale-110'
              }`}
              style={{ backgroundColor: preset.value, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}
              title={preset.name}
            >
              {local.themeColor.toLowerCase() === preset.value.toLowerCase() && (
                <CheckCircle2 size={14} className="mx-auto text-white drop-shadow" />
              )}
            </button>
          ))}
          <label
            className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-dashed border-border text-text-muted transition-colors hover:border-accent hover:text-accent"
            title="自定义颜色"
          >
            <Palette size={14} />
            <input type="color" value={local.themeColor} onChange={(e) => update({ themeColor: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-text-muted">当前：</span>
          <span className="rounded bg-bg-elevated px-2 py-0.5 font-mono text-xs text-text-secondary">{local.themeColor}</span>
        </div>
      </div>

      {/* 自定义主题包 */}
      <ThemePackSection activePackId={local.activeThemePackId} onApply={(packId) => update({ activeThemePackId: packId })} />

      {/* 可视化主题编辑器 */}
      <ThemeEditor settings={local} update={update} />

      {/* 开屏动画 */}
      <StartupAnimationSection local={local} update={update} transitionFileRef={transitionFileRef} transitionMsg={transitionMsg} onImportTransition={onImportTransition} />

      {/* 数据管理 */}
      <DataManagementSection local={local} update={update} onExport={onExport} onImport={onImport} onClearAll={onClearAll} importMsg={importMsg} fileInputRef={fileInputRef} convoCount={convoCount} />
    </div>
  )
}
