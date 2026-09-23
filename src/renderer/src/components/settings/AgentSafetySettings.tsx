import { Zap, Globe, RotateCcw, Shield, Brain } from 'lucide-react'
import type { AppSettings } from '@shared/types'
import { AUTO_MODE_DEFAULT, AUTO_MODE_OPTIONS } from '@renderer/lib/auto-mode'
import { CollapsibleSection, ToggleRow } from './shared-components'

interface AgentSafetySettingsProps {
  local: AppSettings
  update: (patch: Partial<AppSettings>) => void
}

export function AgentSafetySettings({ local, update }: AgentSafetySettingsProps): React.ReactElement {
  return (
    <CollapsibleSection
      icon={<Shield size={16} />}
      title="自动化与安全"
      desc="Auto Mode、联网搜索、检查点快照"
    >
      <div className="ios-card p-3 space-y-3 my-2">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-accent" />
          <div>
            <p className="text-sm font-medium text-text-primary">Auto Mode 默认等级</p>
            <p className="text-xs text-text-muted">每次启动应用后的默认自动化等级</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {AUTO_MODE_OPTIONS.map((level) => {
            const active = (local.defaultAutoModeLevel ?? AUTO_MODE_DEFAULT) === level.value
            return (
              <button
                key={level.value}
                onClick={() => update({ defaultAutoModeLevel: level.value })}
                title={level.desc}
                className={`rounded-card border p-2.5 text-center transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] duration-fast ${
                  active
                    ? 'border-accent bg-accent/15'
                    : 'border-border bg-bg-elevated hover:border-border-hover'
                }`}
              >
                <p className={`text-xs font-semibold ${active ? 'text-accent' : 'text-text-primary'}`}>
                  {level.label}
                </p>
                <p className="mt-0.5 text-caption text-text-muted">{level.desc}</p>
              </button>
            )
          })}
        </div>
      </div>

      <ToggleRow
        icon={<Globe size={16} />}
        label="联网搜索默认开启"
        desc="每次启动应用后联网搜索是否默认开启"
        active={local.defaultNetworkSearchOn ?? false}
        onToggle={() => update({ defaultNetworkSearchOn: !(local.defaultNetworkSearchOn ?? false) })}
        activeText="已开启 · 默认联网搜索"
        inactiveText="已关闭 · 默认不联网"
      />

      <ToggleRow
        icon={<RotateCcw size={16} />}
        label="检查点自动快照"
        desc="文件编辑前自动创建检查点快照，支持代码回退"
        active={local.checkpointEnabled ?? true}
        onToggle={() => update({ checkpointEnabled: !(local.checkpointEnabled ?? true) })}
        activeText="已开启 · 支持代码回退"
        inactiveText="已关闭 · 无法回退代码"
      />

      <ToggleRow
        icon={<Brain size={16} />}
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
