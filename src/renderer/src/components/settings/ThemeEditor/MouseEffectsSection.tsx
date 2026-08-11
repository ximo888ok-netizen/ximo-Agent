import { useEffect, useRef } from 'react'
import { MousePointer2, Sparkles, Palette, Maximize2, Zap, Clock, Wand2 } from 'lucide-react'
import type { AppSettings } from '@shared/types'
import { TRAIL_STYLES, CLICK_STYLES, type CursorStyleDef } from '../../cursor-style-config'
import { CollapsibleSection, ToggleRow } from '../shared-components'

/**
 * MouseEffectsSection — 鼠标特效配置区（跟随 + 点击）
 *
 * 提供：
 * - 总开关（ToggleRow 滑动开关）
 * - 跟随 / 点击各自独立的 ToggleRow 开关
 * - 22 种跟随样式 + 21 种点击样式，每个样式卡片带实时动画预览
 *   （emoji 字形样式直接渲染字形；样式网格始终显示，关闭状态下点击卡片自动开启）
 * - 颜色（跟随主题色或自定义）
 * - 缩放 / 强度 / 时长滑块
 */

/** 迷你预览 — 在卡片内循环播放指定动画 */
function MiniPreview({ def }: { def: CursorStyleDef<string> }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.innerHTML = ''
    const child = document.createElement('div')
    const cls = def.glyph ? `ce-el ce-glyph ce-${def.cls}` : `ce-el ce-${def.cls}`
    child.className = cls
    if (def.glyph) child.textContent = def.glyph
    child.style.animationName = def.anim
    child.style.animationDuration = '1.4s'
    child.style.animationIterationCount = 'infinite'
    el.appendChild(child)
    return () => { el.innerHTML = '' }
  }, [def])
  return <div ref={ref} className="ce-mini-preview flex h-8 items-center justify-center overflow-visible" />
}

/** 样式卡片网格 — 关闭时半透明，点击卡片自动开启该样式 */
function StyleGrid<T extends string>({
  styles,
  current,
  on,
  onSelect,
}: {
  styles: CursorStyleDef<T>[]
  current: T
  on: boolean
  onSelect: (v: T) => void
}): React.ReactElement {
  return (
    <div className={`grid grid-cols-5 gap-1.5 transition-opacity duration-200 ${on ? '' : 'opacity-40'}`}>
      {styles.map((s) => (
        <button
          key={s.value}
          onClick={() => onSelect(s.value)}
          className={`rounded-lg border p-1.5 text-center transition-all duration-200 ${
            on && current === s.value
              ? 'border-accent bg-accent/10'
              : 'border-border bg-bg-elevated hover:border-border-hover'
          }`}
        >
          <div className={on && current === s.value ? '' : 'opacity-70'}>
            <MiniPreview def={s} />
          </div>
          <p
            className={`mt-0.5 truncate text-[10px] font-medium ${
              on && current === s.value ? 'text-accent' : 'text-text-primary'
            }`}
          >
            {s.label}
          </p>
        </button>
      ))}
    </div>
  )
}

export function MouseEffectsSection({
  settings,
  update,
}: {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
}): React.ReactElement {
  const enabled = settings.cursorEffectsEnabled ?? false
  const trailStyle = settings.cursorTrailStyle ?? 'trail'
  const clickStyle = settings.cursorClickStyle ?? 'ripple'
  const trailOn = trailStyle !== 'none'
  const clickOn = clickStyle !== 'none'
  const trailLabel = TRAIL_STYLES.find((s) => s.value === trailStyle)?.label ?? '经典尾迹'
  const clickLabel = CLICK_STYLES.find((s) => s.value === clickStyle)?.label ?? '同心涟漪'

  return (
    <CollapsibleSection
      icon={<MousePointer2 size={16} />}
      title="鼠标特效"
      desc="鼠标跟随粒子动画 + 点击反馈动画，全局生效"
      defaultOpen={false}
    >
      {/* 总开关 */}
      <ToggleRow
        icon={<Sparkles size={15} />}
        label="启用鼠标特效"
        desc="移动鼠标时产生跟随粒子，点击时产生反馈动画"
        active={enabled}
        onToggle={() => update({ cursorEffectsEnabled: !enabled })}
        activeText="已开启 · 全局生效"
        inactiveText="已关闭 · 无任何特效"
      />

      {enabled && (
        <>
          {/* ── 跟随特效 ── */}
          <div className="space-y-2 pt-3">
            <ToggleRow
              icon={<Wand2 size={15} />}
              label="跟随特效"
              desc={`${TRAIL_STYLES.length} 种样式 · 鼠标移动时持续生成`}
              active={trailOn}
              onToggle={() => update({ cursorTrailStyle: trailOn ? 'none' : 'trail' })}
              activeText={`${trailLabel} · 跟随鼠标移动`}
              inactiveText="已关闭 · 点击下方样式卡片可直接开启"
            />
            {/* 样式网格始终显示 — 关闭时半透明，点击卡片自动开启该样式 */}
            <StyleGrid
              styles={TRAIL_STYLES}
              current={trailStyle}
              on={trailOn}
              onSelect={(v) => update({ cursorTrailStyle: v })}
            />
          </div>

          {/* ── 点击特效 ── */}
          <div className="space-y-2 pt-3">
            <ToggleRow
              icon={<Zap size={15} />}
              label="点击特效"
              desc={`${CLICK_STYLES.length} 种样式 · 鼠标按下时爆发`}
              active={clickOn}
              onToggle={() => update({ cursorClickStyle: clickOn ? 'none' : 'ripple' })}
              activeText={`${clickLabel} · 点击鼠标时触发`}
              inactiveText="已关闭 · 点击下方样式卡片可直接开启"
            />
            {/* 样式网格始终显示 — 关闭时半透明，点击卡片自动开启该样式 */}
            <StyleGrid
              styles={CLICK_STYLES}
              current={clickStyle}
              on={clickOn}
              onSelect={(v) => update({ cursorClickStyle: v })}
            />
          </div>

          {/* ── 颜色 ── */}
          <div className="pt-3">
            <div className="mb-1.5 flex items-center gap-2">
              <Palette size={15} className="text-accent" />
              <p className="text-sm font-medium text-text-primary">特效颜色</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.cursorEffectColor || '#6366f1'}
                onChange={(e) => update({ cursorEffectColor: e.target.value })}
                className="h-8 w-10 cursor-pointer rounded-md border border-border bg-bg-elevated"
              />
              <button
                onClick={() => update({ cursorEffectColor: '' })}
                className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                  !settings.cursorEffectColor ? 'bg-accent/20 text-accent' : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                跟随主题色
              </button>
              {settings.cursorEffectColor && (
                <span className="font-mono text-[10px] text-text-muted">{settings.cursorEffectColor}</span>
              )}
            </div>
            <p className="mt-1 text-[10px] text-text-muted">默认跟随主题色；彩虹 / 像素 / 彩带等样式会自动忽略此颜色使用多彩粒子</p>
          </div>

          {/* ── 滑块参数 ── */}
          <div className="space-y-3 pt-3">
            {/* 尺寸缩放 */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Maximize2 size={14} className="text-text-muted" />
                  <span className="text-xs font-medium text-text-primary">尺寸缩放</span>
                </div>
                <span className="font-mono text-[11px] text-text-secondary">{(settings.cursorEffectScale ?? 1).toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={settings.cursorEffectScale ?? 1}
                onChange={(e) => update({ cursorEffectScale: parseFloat(e.target.value) })}
                className="ce-range"
              />
            </div>

            {/* 强度 */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Zap size={14} className="text-text-muted" />
                  <span className="text-xs font-medium text-text-primary">特效强度</span>
                </div>
                <span className="font-mono text-[11px] text-text-secondary">{(settings.cursorEffectIntensity ?? 1).toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={0.2}
                max={3}
                step={0.1}
                value={settings.cursorEffectIntensity ?? 1}
                onChange={(e) => update({ cursorEffectIntensity: parseFloat(e.target.value) })}
                className="ce-range"
              />
              <p className="mt-0.5 text-[10px] text-text-muted">越高粒子越多、飞散越远</p>
            </div>

            {/* 时长 */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Clock size={14} className="text-text-muted" />
                  <span className="text-xs font-medium text-text-primary">特效时长</span>
                </div>
                <span className="font-mono text-[11px] text-text-secondary">{settings.cursorEffectDuration ?? 900}ms</span>
              </div>
              <input
                type="range"
                min={400}
                max={3000}
                step={100}
                value={settings.cursorEffectDuration ?? 900}
                onChange={(e) => update({ cursorEffectDuration: parseInt(e.target.value) })}
                className="ce-range"
              />
            </div>
          </div>

          {/* 提示 */}
          <div className="mt-3 rounded-md border border-border-subtle bg-bg-elevated/50 px-3 py-2">
            <p className="text-[11px] leading-relaxed text-text-muted">
              <span className="text-text-secondary">💡 提示：</span>
              保存后立即全局生效，无需重启。特效层不拦截鼠标事件，不影响任何操作。若系统开启「减弱动态效果」，特效会自动关闭。
            </p>
          </div>
        </>
      )}
    </CollapsibleSection>
  )
}
