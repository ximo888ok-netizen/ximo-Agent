import {
  Cpu,
  Zap,
  Bot,
  Clock,
  Sparkles,
  MessageSquareText
} from 'lucide-react'
import type { AppSettings, ModelId, ReasoningEffort } from '@shared/types'
import {
  SectionTitle,
  Divider,
  ModelCard,
  ToggleRow,
} from './shared-components'
import { MainAgentExpertPicker } from './MainAgentExpertPicker'
import { AgentLoopSettings } from './AgentLoopSettings'
import { AgentSafetySettings } from './AgentSafetySettings'

// ==================== Agent 编排标签 ====================

export function AgentTab({
  local,
  update
}: {
  local: AppSettings
  update: (patch: Partial<AppSettings>) => void
}): React.ReactElement {
  return (
    <div className="space-y-5">
      <SectionTitle title="主Agent模式" desc="控制编排模式下主 Agent 的行为风格" />

      <ToggleRow
        icon={<Bot size={15} />}
        label="狂暴模式"
        desc="开启后，主 Agent 进入狂暴状态：强制主动决策、绝不推诿，遇到困难必须自己想办法解决，绝不说「做不到」。"
        active={local.orchestratorEnforce ?? true}
        onToggle={() => update({ orchestratorEnforce: !(local.orchestratorEnforce ?? true) })}
        activeText="已开启 · 狂暴状态，绝不推诿"
        inactiveText="已关闭 · 普通状态，遇困难可建议调整"
      />

      <SectionTitle title="Agent 自定义" desc="自定义主 Agent 的人格和行为，或从专家库注入专家人格" />

      <MainAgentExpertPicker
        selectedId={local.mainAgentExpertId}
        onSelect={(id) => update({ mainAgentExpertId: id })}
      />

      <div>
        <div className="mb-2 flex items-center gap-2">
          <MessageSquareText size={15} className="text-accent" />
          <label className="text-sm font-medium text-text-primary">主 Agent 自定义提示词</label>
        </div>
        <textarea
          value={local.mainAgentCustomPrompt ?? ''}
          onChange={(e) => update({ mainAgentCustomPrompt: e.target.value })}
          rows={4}
          placeholder="为主 Agent 定义人格、行为风格、工作偏好等。例如：&#10;- 始终以简洁的方式回答，避免冗余解释&#10;- 遇到问题先分析根因再行动&#10;- 优先使用工具完成任务，而非直接回答"
          className="w-full resize-none rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <p className="mt-1.5 text-xs text-text-muted">
          此提示词会注入到主 Agent 的系统提示词中，影响所有对话
        </p>
      </div>

      <Divider />

      <SectionTitle title="子 Agent 模型" desc="子 Agent（专家）发起独立 API 调用时使用的模型，建议用 Flash 降低成本" />

      <div className="grid grid-cols-2 gap-3">
        <ModelCard
          active={(local.subAgentModel ?? 'deepseek-v4-flash') === 'deepseek-v4-pro'}
          onClick={() => update({ subAgentModel: 'deepseek-v4-pro' as ModelId })}
          icon={<Cpu size={18} />}
          title="V4-Pro"
          subtitle="旗舰版"
          specs={['深度推理', '高质量']}
          desc="子 Agent 回复质量更高，但耗时和成本更大"
        />
        <ModelCard
          active={(local.subAgentModel ?? 'deepseek-v4-flash') === 'deepseek-v4-flash'}
          onClick={() => update({ subAgentModel: 'deepseek-v4-flash' as ModelId })}
          icon={<Zap size={18} />}
          title="V4-Flash"
          subtitle="轻量版"
          specs={['快速响应', '低成本']}
          desc="子 Agent 回复更快更省，推荐默认选择"
        />
      </div>

      <Divider />

      <SectionTitle title="子 Agent 参数" desc="控制子 Agent 的推理行为" />

      {/* 子 Agent 温度 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-text-primary">子 Agent 温度</label>
          <span className="rounded bg-bg-elevated px-2 py-0.5 text-xs font-mono text-accent">
            {(local.subAgentTemperature ?? 0.7).toFixed(1)}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={local.subAgentTemperature ?? 0.7}
          onChange={(e) => update({ subAgentTemperature: parseFloat(e.target.value) })}
          className="w-full accent-accent"
        />
        <div className="mt-1 flex justify-between text-[10px] text-text-muted">
          <span>精确 (0)</span>
          <span>平衡 (1.0)</span>
          <span>发散 (2.0)</span>
        </div>
      </div>

      {/* 子 Agent 超时 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-text-primary">子 Agent 超时</label>
          <div className="flex items-center gap-1">
            <Clock size={12} className="text-text-muted" />
            <span className="rounded bg-bg-elevated px-2 py-0.5 text-xs font-mono text-accent">
              {(local.subAgentTimeout ?? 60)}s
            </span>
          </div>
        </div>
        <input
          type="range"
          min="10"
          max="300"
          step="10"
          value={local.subAgentTimeout ?? 60}
          onChange={(e) => update({ subAgentTimeout: parseInt(e.target.value) || 60 })}
          className="w-full accent-accent"
        />
        <div className="mt-1 flex justify-between text-[10px] text-text-muted">
          <span>10s</span>
          <span>60s</span>
          <span>300s</span>
        </div>
        <p className="mt-1.5 text-xs text-text-muted">
          子 Agent 超过此时间未返回将自动中断，主 Agent 可降级为自行处理
        </p>
      </div>

      {/* 子 Agent 思考强度 */}
      <div className="ios-card p-3.5 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-accent" />
          <div>
            <p className="text-sm font-medium text-text-primary">子 Agent 思考强度</p>
            <p className="text-xs text-text-muted">控制子 Agent 的推理深度，强度越高回答越精准但耗时更长</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {([
            { value: 'off' as ReasoningEffort, label: '关闭', desc: '不输出思维链' },
            { value: 'high' as ReasoningEffort, label: 'High', desc: '深度推理' },
            { value: 'max' as ReasoningEffort, label: 'Max', desc: '极致推理' }
          ]).map((level) => (
            <button
              key={level.value}
              onClick={() => update({ subAgentReasoningEffort: level.value })}
              className={`flex-1 rounded-lg border p-2.5 text-center transition-all duration-200 ${
                (local.subAgentReasoningEffort ?? 'high') === level.value
                  ? level.value === 'max'
                    ? 'border-accent bg-accent/15 shadow-[0_0_12px_color-mix(in_srgb,var(--theme-color)_40%,transparent)]'
                    : level.value === 'high'
                      ? 'border-accent bg-accent/10'
                      : 'border-border bg-bg-elevated'
                  : 'border-border bg-bg-elevated hover:border-border-hover'
              }`}
            >
              <p className={`text-xs font-semibold ${
                (local.subAgentReasoningEffort ?? 'high') === level.value ? 'text-accent' : 'text-text-primary'
              }`}>
                {level.label}
              </p>
              <p className="text-[10px] text-text-muted mt-0.5">{level.desc}</p>
            </button>
          ))}
        </div>
        <p className="text-xs text-text-muted">
          关闭时子 Agent 使用温度参数进行采样；开启时使用思维链推理，温度参数不生效
        </p>
      </div>

      <AgentLoopSettings local={local} update={update} />
      <AgentSafetySettings local={local} update={update} />
    </div>
  )
}
