import { Zap, Globe, RotateCcw, Shield, Brain } from 'lucide-react'
import type { AppSettings } from '@shared/types'
import { CollapsibleSection, ToggleRow } from './shared-components'

interface AgentSafetySettingsProps {
  local: AppSettings
  update: (patch: Partial<AppSettings>) => void
}

export function AgentSafetySettings({ local, update }: AgentSafetySettingsProps): React.ReactElement {
  return (
    <CollapsibleSection
      icon={<Shield size={15} />}
      title="自动化与安全"
      desc="Auto Mode、联网搜索、检查点快照"
    >
      <div className="ios-card p-3.5 space-y-3 my-2">
        <div className="flex items-center gap-2">
          <Zap size={15} className="text-accent" />
          <div>
            <p className="text-sm font-medium text-text-primary">Auto Mode 默认等级</p>
            <p className="text-xs text-text-muted">每次启动应用后的默认自动化等级</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {([
            { value: 'off', label: '按模式规则', desc: '常规自动·危险确认' },
            { value: 'safe', label: '安全模式', desc: '读写自动·危险确认' },
            { value: 'yolo', label: 'YOLO', desc: '全部自动执行' }
          ]).map((level) => (
            <button
              key={level.value}
              onClick={() => update({ defaultAutoModeLevel: level.value as 'off' | 'safe' | 'yolo' })}
              className={`flex-1 rounded-lg border p-2.5 text-center transition-all duration-200 ${
                (local.defaultAutoModeLevel ?? 'off') === level.value
                  ? level.value === 'yolo'
                    ? 'border-accent bg-accent/15 shadow-[0_0_12px_color-mix(in_srgb,var(--theme-color)_40%,transparent)]'
                    : level.value === 'safe'
                      ? 'border-accent bg-accent/10'
                      : 'border-border bg-bg-elevated'
                    : 'border-border bg-bg-elevated hover:border-border-hover'
              }`}
            >
              <p className={`text-xs font-semibold ${
                (local.defaultAutoModeLevel ?? 'off') === level.value ? 'text-accent' : 'text-text-primary'
              }`}>
                {level.label}
              </p>
              <p className="text-[10px] text-text-muted mt-0.5">{level.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <ToggleRow
        icon={<Globe size={15} />}
        label="联网搜索默认开启"
        desc="每次启动应用后联网搜索是否默认开启"
        active={local.defaultNetworkSearchOn ?? false}
        onToggle={() => update({ defaultNetworkSearchOn: !(local.defaultNetworkSearchOn ?? false) })}
        activeText="已开启 · 默认联网搜索"
        inactiveText="已关闭 · 默认不联网"
      />

      <ToggleRow
        icon={<RotateCcw size={15} />}
        label="检查点自动快照"
        desc="文件编辑前自动创建检查点快照，支持代码回退"
        active={local.checkpointEnabled ?? true}
        onToggle={() => update({ checkpointEnabled: !(local.checkpointEnabled ?? true) })}
        activeText="已开启 · 支持代码回退"
        inactiveText="已关闭 · 无法回退代码"
      />

      <ToggleRow
        icon={<Brain size={15} />}
        label="长期记忆"
        desc="每个模式独立的跨会话记忆，Agent 自主记录用户习惯、踩过的坑、工具语法，每次对话自动注入"
        active={local.memoryEnabled ?? true}
        onToggle={() => update({ memoryEnabled: !(local.memoryEnabled ?? true) })}
        activeText="已开启 · Agent 跨会话学习"
        inactiveText="已关闭 · 无持久记忆"
      />
    </CollapsibleSection>
  )
}
