import {
  Terminal,
  Cpu,
  Type,
  Monitor,
  Clock,
  Globe,
  Network,
  Server,
  Eye,
  Zap
} from 'lucide-react'
import type { AppSettings } from '@shared/types'
import {
  CollapsibleSection,
  NumberInputRow,
  ToggleRow
} from './shared-components'
import { SearchSection, VisionSection } from './tools-sections'

export function ToolsTab({
  local,
  update
}: {
  local: AppSettings
  update: (patch: Partial<AppSettings>) => void
}): React.ReactElement {
  return (
    <div className="space-y-3">
      <CollapsibleSection
        icon={<Zap size={16} />}
        title="GPU 硬件加速"
        desc="独显/核显加速渲染 UI，关闭后使用软件渲染"
        defaultOpen
      >
        <ToggleRow
          icon={<Zap size={15} />}
          label="GPU 硬件加速"
          desc="优先调用独显渲染 UI，无独显时自动使用核显。更改后需重启软件生效。"
          active={local.gpuAcceleration ?? true}
          onToggle={() => update({ gpuAcceleration: !(local.gpuAcceleration ?? true) })}
          activeText="已开启 · GPU 加速渲染"
          inactiveText="已关闭 · 软件渲染"
        />
      </CollapsibleSection>

      <CollapsibleSection
        icon={<Terminal size={16} />}
        title="终端与代码执行"
        desc="命令超时、输出截断、代码执行默认参数"
      >
        <NumberInputRow
          icon={<Terminal size={15} />}
          label="终端命令默认超时"
          desc="terminal_exec 工具的默认超时"
          value={local.terminalTimeout ?? 60}
          min={10}
          max={300}
          step={10}
          unit="秒"
          onChange={(v) => update({ terminalTimeout: v })}
        />
        <NumberInputRow
          icon={<Cpu size={15} />}
          label="代码执行默认超时"
          desc="code_execute 工具的默认超时"
          value={local.codeExecTimeout ?? 60}
          min={10}
          max={300}
          step={10}
          unit="秒"
          onChange={(v) => update({ codeExecTimeout: v })}
        />
        <NumberInputRow
          icon={<Type size={15} />}
          label="终端输出截断长度"
          desc="超长输出截断防止占满上下文"
          value={local.terminalOutputLimit ?? 50000}
          min={10000}
          max={200000}
          step={5000}
          unit="字符"
          onChange={(v) => update({ terminalOutputLimit: v })}
        />
      </CollapsibleSection>

      <CollapsibleSection
        icon={<Monitor size={16} />}
        title="浏览器自动化"
        desc="无头模式、空闲超时、视口尺寸"
      >
        <ToggleRow
          icon={<Monitor size={15} />}
          label="浏览器无头模式"
          desc="开启后台运行，关闭显示窗口（调试用）"
          active={local.browserHeadless ?? true}
          onToggle={() => update({ browserHeadless: !(local.browserHeadless ?? true) })}
          activeText="已开启 · 后台运行"
          inactiveText="已关闭 · 显示窗口"
        />
        <NumberInputRow
          icon={<Clock size={15} />}
          label="浏览器空闲超时"
          desc="空闲多久后自动关闭释放内存"
          value={local.browserIdleTimeout ?? 5}
          min={1}
          max={30}
          step={1}
          unit="分钟"
          onChange={(v) => update({ browserIdleTimeout: v })}
        />
        <NumberInputRow
          icon={<Monitor size={15} />}
          label="浏览器视口宽度"
          desc="页面渲染宽度"
          value={local.browserViewportWidth ?? 1280}
          min={800}
          max={2560}
          step={40}
          unit="px"
          onChange={(v) => update({ browserViewportWidth: v })}
        />
        <NumberInputRow
          icon={<Monitor size={15} />}
          label="浏览器视口高度"
          desc="页面渲染高度"
          value={local.browserViewportHeight ?? 800}
          min={600}
          max={1440}
          step={40}
          unit="px"
          onChange={(v) => update({ browserViewportHeight: v })}
        />
      </CollapsibleSection>

      <CollapsibleSection
        icon={<Globe size={16} />}
        title="联网搜索与网页抓取"
        desc="搜索引擎偏好、结果数量、抓取长度、缓存"
      >
        <SearchSection local={local} update={update} />
      </CollapsibleSection>

      <CollapsibleSection
        icon={<Monitor size={16} />}
        title="桌面操控"
        desc="pi-computer-use Helper 命令超时"
      >
        <NumberInputRow
          icon={<Monitor size={15} />}
          label="Helper 命令超时"
          desc="Helper 命令执行超时"
          value={local.helperCommandTimeout ?? 30}
          min={5}
          max={120}
          step={5}
          unit="秒"
          onChange={(v) => update({ helperCommandTimeout: v })}
        />
      </CollapsibleSection>

      <CollapsibleSection
        icon={<Network size={16} />}
        title="网络抓包"
        desc="内嵌浏览器抓包行为"
      >
        <NumberInputRow
          icon={<Network size={15} />}
          label="抓包最大请求数"
          desc="最多保存多少条抓包记录"
          value={local.maxCapturedRequests ?? 500}
          min={100}
          max={5000}
          step={100}
          unit="条"
          onChange={(v) => update({ maxCapturedRequests: v })}
        />
      </CollapsibleSection>

      <CollapsibleSection
        icon={<Server size={16} />}
        title="MCP 集成"
        desc="MCP 服务器连接超时"
      >
        <NumberInputRow
          icon={<Server size={15} />}
          label="MCP 连接超时"
          desc="MCP 服务器连接和请求超时"
          value={local.mcpConnectTimeout ?? 30}
          min={5}
          max={60}
          step={5}
          unit="秒"
          onChange={(v) => update({ mcpConnectTimeout: v })}
        />
      </CollapsibleSection>

      <CollapsibleSection
        icon={<Eye size={16} />}
        title="视觉模型（Agent 的眼睛）"
        desc="Agnes 2.5 Flash — 让 Agent 具备图像理解能力"
        defaultOpen
      >
        <VisionSection local={local} update={update} />
      </CollapsibleSection>
    </div>
  )
}
