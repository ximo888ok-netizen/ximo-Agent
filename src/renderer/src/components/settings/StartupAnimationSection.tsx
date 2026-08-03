import { useState, useEffect } from 'react'
import { Type, Sun, Moon, Sparkles, Zap, Clock, Layers, Upload } from 'lucide-react'
import type { AppSettings } from '@shared/types'
import {
  CollapsibleSection, ToggleRow, NumberInputRow, Divider,
} from './shared-components'
import { getCachedFonts, setCachedFonts, readFontCache, writeFontCache } from './font-cache'

interface StartupAnimationSectionProps {
  local: AppSettings
  update: (patch: Partial<AppSettings>) => void
  transitionFileRef: React.RefObject<HTMLInputElement>
  transitionMsg: { ok: boolean; text: string } | null
  onImportTransition: (e: React.ChangeEvent<HTMLInputElement>) => void
}

/** 开屏动画配置区 — 动画文字、字体、转场样式与配色 */
export function StartupAnimationSection({
  local, update, transitionFileRef, transitionMsg, onImportTransition,
}: StartupAnimationSectionProps): React.ReactElement {
  const [systemFonts, setSystemFonts] = useState<string[]>(() => {
    if (getCachedFonts()) return getCachedFonts()!
    const stored = readFontCache()
    if (stored) { setCachedFonts(stored); return stored }
    return []
  })
  const [fontsLoading, setFontsLoading] = useState(false)

  useEffect(() => {
    if (!(local.startupAnimationEnabled ?? true) || systemFonts.length > 0 || fontsLoading) return
    setFontsLoading(true)
    window.api.fonts.list().then(fonts => {
      setCachedFonts(fonts); writeFontCache(fonts); setSystemFonts(fonts); setFontsLoading(false)
    }).catch(() => setFontsLoading(false))
  }, [local.startupAnimationEnabled, systemFonts.length, fontsLoading])

  return (
    <CollapsibleSection icon={<Sparkles size={16} />} title="开屏动画" desc="启动动画文字、转场样式与配色">
      <ToggleRow
        icon={<Zap size={15} />}
        label="开屏动画"
        desc="启动时显示草书逐字描边动画"
        active={local.startupAnimationEnabled ?? true}
        onToggle={() => update({ startupAnimationEnabled: !(local.startupAnimationEnabled ?? true) })}
        activeText="已开启 · 启动播放动画"
        inactiveText="已关闭 · 直接进入主界面"
      />

      {(local.startupAnimationEnabled ?? true) && (
        <>
          <div className="py-2">
            <div className="mb-2 flex items-center gap-2">
              <Type size={15} className="text-text-muted" />
              <label className="text-sm font-medium text-text-primary">开屏文字</label>
            </div>
            <input
              type="text"
              value={local.startupText ?? 'ximo-Agent'}
              onChange={(e) => update({ startupText: e.target.value })}
              placeholder="ximo-Agent"
              maxLength={30}
              className="w-full rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-xs text-text-muted">启动时逐字描边的文字，建议 3~15 个字符</p>
          </div>

          <NumberInputRow
            icon={<Type size={15} />}
            label="文字大小"
            desc="SVG 渲染的 fontSize"
            value={local.startupTextSize ?? 76}
            min={40} max={120} step={4} unit="px"
            onChange={(v) => update({ startupTextSize: v })}
          />

          <NumberInputRow
            icon={<Clock size={15} />}
            label="描边时长"
            desc="每个字的描边动画时长"
            value={local.startupStrokeDuration ?? 460}
            min={200} max={1000} step={40} unit="ms"
            onChange={(v) => update({ startupStrokeDuration: v })}
          />

          <div className="py-2">
            <div className="mb-2 flex items-center gap-2">
              <Type size={15} className="text-text-muted" />
              <label className="text-sm font-medium text-text-primary">开屏字体</label>
            </div>
            <select
              value={local.startupFontFamily ?? "'Dancing Script', cursive"}
              onChange={(e) => update({ startupFontFamily: e.target.value })}
              className="w-full rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
            >
              <option value="'Dancing Script', cursive">Dancing Script（默认草书）</option>
              {systemFonts.map(f => <option key={f} value={f}>{f}</option>)}
              {fontsLoading && <option disabled>正在加载系统字体…</option>}
            </select>
            <p className="mt-1 text-xs text-text-muted">选择开屏文字的字体，列表来自系统已安装字体</p>
          </div>

          <Divider />

          <ToggleRow
            icon={<Sparkles size={15} />}
            label="转场效果"
            desc="描边完成后是否播放转场效果"
            active={local.burstTransitionEnabled ?? true}
            onToggle={() => update({ burstTransitionEnabled: !(local.burstTransitionEnabled ?? true) })}
            activeText="已开启 · 播放转场"
            inactiveText="已关闭 · 直接淡入"
          />

          {(local.burstTransitionEnabled ?? true) && (
            <>
              <div className="ios-card p-3.5 space-y-3 my-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles size={15} className="text-accent" />
                    <div>
                      <p className="text-sm font-medium text-text-primary">转场样式</p>
                      <p className="text-xs text-text-muted">描边完成后的粒子效果类型</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => transitionFileRef.current?.click()}
                      className="flex items-center gap-1 rounded-md border border-border bg-bg-elevated px-2 py-1 text-[11px] text-text-secondary transition-colors hover:border-accent hover:text-accent"
                      title="从 JSON 文件导入转场动画"
                    >
                      <Upload size={12} />
                      导入动画
                    </button>
                  </div>
                </div>
                <input ref={transitionFileRef} type="file" accept=".json,application/json" onChange={onImportTransition} className="hidden" />
                {transitionMsg && (
                  <p className={`text-[11px] ${transitionMsg.ok ? 'text-emerald-500' : 'text-red-500'}`}>{transitionMsg.text}</p>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'rose', label: '玫瑰花瓣', desc: '泪滴形花瓣飞散' },
                    { value: 'fireworks', label: '烟花', desc: '多点放射爆裂' },
                    { value: 'confetti', label: '彩纸', desc: '矩形纸片下落' },
                    { value: 'aura', label: '光环', desc: '同心圆环扩张' },
                    { value: 'lightfall', label: '光瀑', desc: '垂直光带倾泻' },
                    { value: 'fade', label: '纯淡入', desc: '无粒子，仅渐隐' },
                    { value: 'custom', label: '自定义', desc: '从文件导入动画' },
                  ]).map((style) => (
                    <button
                      key={style.value}
                      onClick={() => update({ burstTransitionStyle: style.value as 'rose' | 'fireworks' | 'confetti' | 'fade' | 'aura' | 'lightfall' | 'custom' })}
                      className={`rounded-lg border p-2.5 text-center transition-all duration-200 ${
                        (local.burstTransitionStyle ?? 'rose') === style.value
                          ? 'border-accent bg-accent/10' : 'border-border bg-bg-elevated hover:border-border-hover'
                      }`}
                    >
                      <p className={`text-xs font-semibold ${(local.burstTransitionStyle ?? 'rose') === style.value ? 'text-accent' : 'text-text-primary'}`}>{style.label}</p>
                      <p className="text-[10px] text-text-muted mt-0.5">{style.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="ios-card p-3.5 space-y-3 my-2">
                <div className="flex items-center gap-2">
                  <Sun size={15} className="text-accent" />
                  <div>
                    <p className="text-sm font-medium text-text-primary">转场配色</p>
                    <p className="text-xs text-text-muted">粒子的颜色色系</p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {([
                    { value: 'rose', label: '玫瑰', color: '#e84393' },
                    { value: 'ocean', label: '海蓝', color: '#0984e3' },
                    { value: 'gold', label: '金色', color: '#f1c40f' },
                    { value: 'aurora', label: '极光', color: '#a29bfe' },
                  ]).map((theme) => (
                    <button
                      key={theme.value}
                      onClick={() => update({ burstColorTheme: theme.value as 'rose' | 'ocean' | 'gold' | 'aurora' })}
                      className={`rounded-lg border p-2 text-center transition-all duration-200 ${
                        (local.burstColorTheme ?? 'rose') === theme.value
                          ? 'border-accent bg-accent/10' : 'border-border bg-bg-elevated hover:border-border-hover'
                      }`}
                    >
                      <div className="mx-auto mb-1 h-4 w-4 rounded-full" style={{ background: theme.color }} />
                      <p className={`text-[10px] font-medium ${(local.burstColorTheme ?? 'rose') === theme.value ? 'text-accent' : 'text-text-primary'}`}>{theme.label}</p>
                    </button>
                  ))}
                </div>
              </div>

              <NumberInputRow
                icon={<Layers size={15} />}
                label="粒子数量"
                desc={local.burstTransitionStyle === 'fade' ? '淡入模式不使用粒子' : '转场粒子的数量'}
                value={local.burstParticleCount ?? 120}
                min={0} max={300} step={10} unit="个"
                onChange={(v) => update({ burstParticleCount: v })}
              />

              <NumberInputRow
                icon={<Clock size={15} />}
                label="转场时长"
                desc="转场效果的总持续时间"
                value={local.burstDuration ?? 2500}
                min={1000} max={5000} step={250} unit="ms"
                onChange={(v) => update({ burstDuration: v })}
              />
            </>
          )}
        </>
      )}
    </CollapsibleSection>
  )
}
