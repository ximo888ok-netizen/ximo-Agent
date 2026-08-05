import {
  Cpu,
  Zap,
  Brain,
  Type,
  Sparkles,
  MessageSquareText
} from 'lucide-react'
import type { AppSettings, ModelId, ReasoningEffort } from '@shared/types'
import { isReasoningCapable } from '@renderer/lib/providers'
import {
  SectionTitle,
  Divider,
  ModelCard,
  ToggleRow
} from './shared-components'

export function ModelTab({
  local,
  update
}: {
  local: AppSettings
  update: (patch: Partial<AppSettings>) => void
}): React.ReactElement {
  // 当前活跃服务商是否支持思考参数（内置 DeepSeek 恒为 true）
  const reasoningCapable = isReasoningCapable(local)

  return (
    <div className="space-y-5">
      <SectionTitle title="模型选择" desc="DeepSeek-V4 提供两个版本，按场景选择" />

      <div className="grid grid-cols-2 gap-3">
        <ModelCard
          active={local.model === 'deepseek-v4-pro'}
          onClick={() => update({ model: 'deepseek-v4-pro' as ModelId })}
          icon={<Cpu size={18} />}
          title="V4-Pro"
          subtitle="旗舰版"
          specs={['1.6T 参数', '49B 激活', '1M 上下文']}
          desc="深度推理、复杂编码、科研分析等高阶场景"
        />
        <ModelCard
          active={local.model === 'deepseek-v4-flash'}
          onClick={() => update({ model: 'deepseek-v4-flash' as ModelId })}
          icon={<Zap size={18} />}
          title="V4-Flash"
          subtitle="轻量版"
          specs={['284B 参数', '13B 激活', '1M 上下文']}
          desc="日常办公、内容创作、快速问答等高频场景"
        />
      </div>

      <Divider />

      <SectionTitle title="推理参数" desc="控制模型的推理行为与输出风格" />

      {/* 思考模式 */}
      <ToggleRow
        icon={<Brain size={15} />}
        label="思考模式"
        desc="开启后模型输出思维链推理过程（reasoning_content）"
        active={local.thinkingMode}
        onToggle={() => {
          const newMode = !local.thinkingMode
          update({
            thinkingMode: newMode,
            // 关闭思考模式时自动将 effort 设为 off，开启时恢复为 high
            reasoningEffort: newMode ? (local.reasoningEffort === 'off' ? 'high' : local.reasoningEffort) : 'off'
          })
        }}
        activeText="已开启 · 输出思维链"
        inactiveText="已关闭 · 快速回答"
      />

      {!reasoningCapable && (
        <p className="text-xs text-amber-400/70">
          当前活跃服务商不支持 reasoning 参数，思考模式与思考强度将在发送时自动关闭
        </p>
      )}

      {/* 思考强度 — 仅在思考模式开启且服务商支持时显示 */}
      {local.thinkingMode && reasoningCapable && (
        <div className="ios-card p-3.5 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-accent" />
            <div>
              <p className="text-sm font-medium text-text-primary">思考强度</p>
              <p className="text-xs text-text-muted">控制推理深度，强度越高回答越精准但耗时更长</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {([
              { value: 'off' as ReasoningEffort, label: '关闭', desc: '不输出思维链' },
              { value: 'high' as ReasoningEffort, label: 'High', desc: '深度推理' },
              { value: 'max' as ReasoningEffort, label: 'Max', desc: '极致推理' },
              { value: 'ultra' as ReasoningEffort, label: 'Ultra', desc: '范式+监督' }
            ]).map((level) => (
              <button
                key={level.value}
                onClick={() => update({ reasoningEffort: level.value })}
                className={`flex-1 rounded-lg border p-2.5 text-center transition-all duration-200 ${
                  local.reasoningEffort === level.value
                    ? level.value === 'ultra'
                      ? 'border-accent bg-accent/20 shadow-[0_0_16px_color-mix(in_srgb,var(--theme-color)_50%,transparent)]'
                      : level.value === 'max'
                        ? 'border-accent bg-accent/15 shadow-[0_0_12px_color-mix(in_srgb,var(--theme-color)_40%,transparent)]'
                        : level.value === 'high'
                          ? 'border-accent bg-accent/10'
                          : 'border-border bg-bg-elevated'
                    : 'border-border bg-bg-elevated hover:border-border-hover'
                }`}
              >
                <p className={`text-xs font-semibold ${
                  local.reasoningEffort === level.value ? 'text-accent' : 'text-text-primary'
                }`}>
                  {level.label}
                </p>
                <p className="text-[10px] text-text-muted mt-0.5">{level.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 温度 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-text-primary">温度（Temperature）</label>
          <span className="rounded bg-bg-elevated px-2 py-0.5 text-xs font-mono text-accent">
            {local.temperature.toFixed(1)}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={local.temperature}
          onChange={(e) => update({ temperature: parseFloat(e.target.value) })}
          className="w-full accent-accent"
          disabled={local.thinkingMode}
        />
        <div className="mt-1 flex justify-between text-[10px] text-text-muted">
          <span>精确 (0)</span>
          <span>平衡 (1.0)</span>
          <span>发散 (2.0)</span>
        </div>
        {local.thinkingMode && (
          <p className="mt-1.5 text-xs text-amber-400/70">
            思考模式下温度参数不生效（由模型自主控制推理强度）
          </p>
        )}
      </div>

      <Divider />

      {/* 自定义提示词 */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <MessageSquareText size={15} className="text-accent" />
          <label className="text-sm font-medium text-text-primary">自定义附加指令</label>
        </div>
        <textarea
          value={local.customPrompt}
          onChange={(e) => update({ customPrompt: e.target.value })}
          rows={4}
          placeholder="输入额外指令，将追加到所有模式的系统提示词之后。例如：&#10;- 始终用中文回答&#10;- 输出更简洁，避免冗余解释&#10;- 代码注释用英文"
          className="w-full resize-none rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <p className="mt-1.5 text-xs text-text-muted">
          这些指令会附加到每个模式的系统提示词末尾，影响所有对话
        </p>
      </div>
    </div>
  )
}
