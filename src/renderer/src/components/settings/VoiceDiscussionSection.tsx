import { useState } from 'react'
import { Mic, Palette, Sliders, Code, Sparkles, Layers, Zap, Droplets, Sun } from 'lucide-react'
import type { AppSettings, VoiceDiscussionStyle } from '@shared/types'
import { SectionTitle } from './shared-components'

const STYLE_OPTIONS: { value: VoiceDiscussionStyle; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'default', label: '默认', icon: <Layers size={16} />, desc: '跟随系统主题的经典卡片风格' },
  { value: 'minimal', label: '极简', icon: <Sun size={16} />, desc: '透明背景，纯净简洁' },
  { value: 'glass', label: '毛玻璃', icon: <Droplets size={16} />, desc: '磨砂玻璃质感，现代优雅' },
  { value: 'neon', label: '霓虹', icon: <Sparkles size={16} />, desc: '发光边框，炫彩夺目' },
  { value: 'cyberpunk', label: '赛博朋克', icon: <Zap size={16} />, desc: '高对比霓虹，未来科技感' },
]

interface VoiceDiscussionSectionProps {
  local: AppSettings
  update: (patch: Partial<AppSettings>) => void
}

export function VoiceDiscussionSection({ local, update }: VoiceDiscussionSectionProps): React.ReactElement {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const style = local.voiceDiscussionStyle ?? 'default'
  const particleColor = local.voiceDiscussionParticleColor ?? ''
  const particleScale = local.voiceDiscussionParticleScale ?? 1.0
  const particleSpeed = local.voiceDiscussionParticleSpeed ?? 1.0
  const bgOpacity = local.voiceDiscussionBgOpacity ?? 0.96
  const borderRadius = local.voiceDiscussionBorderRadius ?? 24
  const blur = local.voiceDiscussionBlur ?? 20
  const customCss = local.voiceDiscussionCustomCss ?? ''

  return (
    <div className="space-y-4">
      <SectionTitle title="语音讨论面板" desc="自定义语音讨论弹窗的外观风格" />

      {/* 样式选择 */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Palette size={15} className="text-accent" />
          <label className="text-sm font-medium text-text-primary">面板样式</label>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {STYLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update({ voiceDiscussionStyle: opt.value })}
              className={`flex items-start gap-2 rounded-lg border p-3 text-left transition-all ${
                style === opt.value
                  ? 'border-accent bg-accent/10'
                  : 'border-border bg-bg-elevated hover:border-border-hover'
              }`}
            >
              <div className={`mt-0.5 ${style === opt.value ? 'text-accent' : 'text-text-muted'}`}>{opt.icon}</div>
              <div>
                <p className={`text-sm font-medium ${style === opt.value ? 'text-accent' : 'text-text-primary'}`}>
                  {opt.label}
                </p>
                <p className="mt-0.5 text-[10px] text-text-muted leading-tight">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 高级设置开关 */}
      <button
        onClick={() => setShowAdvanced((v) => !v)}
        className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
      >
        <Sliders size={14} />
        <span>{showAdvanced ? '收起高级设置' : '展开高级设置'}</span>
      </button>

      {/* 高级设置 */}
      {showAdvanced && (
        <div className="space-y-4 rounded-lg border border-border bg-bg-elevated/50 p-4">
          {/* 粒子颜色 */}
          <div>
            <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-text-primary">
              <Sparkles size={14} className="text-accent" />
              粒子圆环颜色
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={particleColor || local.themeColor}
                onChange={(e) => update({ voiceDiscussionParticleColor: e.target.value })}
                className="h-9 w-14 rounded-lg border border-border bg-bg-base cursor-pointer"
              />
              <input
                type="text"
                value={particleColor}
                onChange={(e) => update({ voiceDiscussionParticleColor: e.target.value })}
                placeholder={local.themeColor}
                className="flex-1 rounded-lg border border-border bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
              <button
                onClick={() => update({ voiceDiscussionParticleColor: '' })}
                className="rounded-lg border border-border px-3 py-2 text-xs text-text-secondary hover:border-accent hover:text-accent transition-colors"
              >
                重置
              </button>
            </div>
            <p className="mt-1 text-[10px] text-text-muted">留空则跟随主题色</p>
          </div>

          {/* 粒子大小 */}
          <div>
            <label className="mb-1.5 flex items-center justify-between text-sm font-medium text-text-primary">
              <span className="flex items-center gap-2">
                <Layers size={14} className="text-accent" />
                粒子大小
              </span>
              <span className="text-xs text-text-muted">{particleScale.toFixed(1)}x</span>
            </label>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={particleScale}
              onChange={(e) => update({ voiceDiscussionParticleScale: parseFloat(e.target.value) })}
              className="w-full accent-accent"
            />
          </div>

          {/* 粒子速度 */}
          <div>
            <label className="mb-1.5 flex items-center justify-between text-sm font-medium text-text-primary">
              <span className="flex items-center gap-2">
                <Zap size={14} className="text-accent" />
                旋转速度
              </span>
              <span className="text-xs text-text-muted">{particleSpeed.toFixed(1)}x</span>
            </label>
            <input
              type="range"
              min={0.5}
              max={3.0}
              step={0.1}
              value={particleSpeed}
              onChange={(e) => update({ voiceDiscussionParticleSpeed: parseFloat(e.target.value) })}
              className="w-full accent-accent"
            />
          </div>

          {/* 背景透明度 */}
          <div>
            <label className="mb-1.5 flex items-center justify-between text-sm font-medium text-text-primary">
              <span className="flex items-center gap-2">
                <Droplets size={14} className="text-accent" />
                背景透明度
              </span>
              <span className="text-xs text-text-muted">{Math.round(bgOpacity * 100)}%</span>
            </label>
            <input
              type="range"
              min={0.3}
              max={1.0}
              step={0.05}
              value={bgOpacity}
              onChange={(e) => update({ voiceDiscussionBgOpacity: parseFloat(e.target.value) })}
              className="w-full accent-accent"
            />
          </div>

          {/* 圆角大小 */}
          <div>
            <label className="mb-1.5 flex items-center justify-between text-sm font-medium text-text-primary">
              <span className="flex items-center gap-2">
                <Layers size={14} className="text-accent" />
                圆角大小
              </span>
              <span className="text-xs text-text-muted">{borderRadius}px</span>
            </label>
            <input
              type="range"
              min={0}
              max={32}
              step={1}
              value={borderRadius}
              onChange={(e) => update({ voiceDiscussionBorderRadius: parseInt(e.target.value) })}
              className="w-full accent-accent"
            />
          </div>

          {/* 模糊程度 */}
          <div>
            <label className="mb-1.5 flex items-center justify-between text-sm font-medium text-text-primary">
              <span className="flex items-center gap-2">
                <Droplets size={14} className="text-accent" />
                模糊程度
              </span>
              <span className="text-xs text-text-muted">{blur}px</span>
            </label>
            <input
              type="range"
              min={0}
              max={40}
              step={1}
              value={blur}
              onChange={(e) => update({ voiceDiscussionBlur: parseInt(e.target.value) })}
              className="w-full accent-accent"
            />
          </div>

          {/* 自定义CSS */}
          <div>
            <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-text-primary">
              <Code size={14} className="text-accent" />
              自定义 CSS
            </label>
            <textarea
              value={customCss}
              onChange={(e) => update({ voiceDiscussionCustomCss: e.target.value })}
              placeholder="/* 例如：.voice-panel { box-shadow: 0 0 50px rgba(99,102,241,0.5); } */"
              rows={4}
              className="w-full rounded-lg border border-border bg-bg-base px-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none resize-y"
            />
            <p className="mt-1 text-[10px] text-text-muted">追加到面板样式末尾，可覆盖默认样式</p>
          </div>

          {/* 重置所有 */}
          <button
            onClick={() =>
              update({
                voiceDiscussionStyle: 'default',
                voiceDiscussionParticleColor: '',
                voiceDiscussionParticleScale: 1.0,
                voiceDiscussionParticleSpeed: 1.0,
                voiceDiscussionBgOpacity: 0.96,
                voiceDiscussionBorderRadius: 24,
                voiceDiscussionBlur: 20,
                voiceDiscussionCustomCss: '',
              })
            }
            className="w-full rounded-lg border border-border py-2 text-xs text-text-secondary hover:border-accent hover:text-accent transition-colors"
          >
            重置所有高级设置
          </button>
        </div>
      )}

      {/* 预览提示 */}
      <div className="flex items-center gap-2 rounded-lg bg-accent/5 px-3 py-2 text-xs text-text-secondary">
        <Mic size={14} className="text-accent" />
        <span>点击主界面语音球即可预览当前设置效果</span>
      </div>
    </div>
  )
}
