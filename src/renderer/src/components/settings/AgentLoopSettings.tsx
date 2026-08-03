import { Layers, Gauge, Type, Shield, Sparkles } from 'lucide-react'
import type { AppSettings } from '@shared/types'
import { CollapsibleSection, NumberInputRow } from './shared-components'

interface AgentLoopSettingsProps {
  local: AppSettings
  update: (patch: Partial<AppSettings>) => void
}

export function AgentLoopSettings({ local, update }: AgentLoopSettingsProps): React.ReactElement {
  return (
    <CollapsibleSection
      icon={<Layers size={15} />}
      title="Agent 循环与上下文"
      desc="工具调用循环次数、上下文压缩策略"
    >
      <NumberInputRow
        icon={<Layers size={15} />}
        label="最大工具调用轮次"
        desc="防止死循环的安全上限"
        value={local.maxToolRounds ?? 30}
        min={5}
        max={100}
        step={5}
        unit="轮"
        onChange={(v) => update({ maxToolRounds: v })}
      />
      <NumberInputRow
        icon={<Gauge size={15} />}
        label="上下文窗口上限"
        desc="超限自动压缩旧消息"
        value={local.maxContextChars ?? 300000}
        min={100000}
        max={800000}
        step={50000}
        unit="字符"
        onChange={(v) => update({ maxContextChars: v })}
      />
      <NumberInputRow
        icon={<Type size={15} />}
        label="工具结果截断长度"
        desc="单个工具返回结果的最大字符数"
        value={local.maxToolResultChars ?? 16000}
        min={4000}
        max={50000}
        step={2000}
        unit="字符"
        onChange={(v) => update({ maxToolResultChars: v })}
      />
      <NumberInputRow
        icon={<Shield size={15} />}
        label="上下文保护窗口"
        desc="最近 N 条消息不会被压缩"
        value={local.contextRecentKeep ?? 8}
        min={4}
        max={20}
        step={1}
        unit="条"
        onChange={(v) => update({ contextRecentKeep: v })}
      />
      <NumberInputRow
        icon={<Sparkles size={15} />}
        label="Snip 保留字符数"
        desc="软阈值：旧工具结果截断为前 N 字符"
        value={local.contextSnippedKeep ?? 200}
        min={100}
        max={500}
        step={50}
        unit="字符"
        onChange={(v) => update({ contextSnippedKeep: v })}
      />
      <NumberInputRow
        icon={<Sparkles size={15} />}
        label="Prune 保留字符数"
        desc="硬阈值：进一步缩短到前 N 字符"
        value={local.contextPrunedKeep ?? 80}
        min={50}
        max={200}
        step={10}
        unit="字符"
        onChange={(v) => update({ contextPrunedKeep: v })}
      />
    </CollapsibleSection>
  )
}
