import { Globe, Search, Database, Eye } from 'lucide-react'
import type { AppSettings } from '@shared/types'
import { ToggleRow, NumberInputRow } from './shared-components'

// ─── 搜索与网页抓取 Section ────────────────────────────

interface SearchSectionProps {
  local: AppSettings
  update: (patch: Partial<AppSettings>) => void
}

export function SearchSection({ local, update }: SearchSectionProps): React.ReactElement {
  return (
    <>
      <div className="ios-card p-3.5 space-y-3 my-2">
        <div className="flex items-center gap-2">
          <Globe size={15} className="text-accent" />
          <div>
            <p className="text-sm font-medium text-text-primary">默认搜索引擎</p>
            <p className="text-xs text-text-muted">主引擎失败时自动降级</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {([
            { value: 'bing', label: 'Bing', desc: '国际' },
            { value: 'baidu', label: '百度', desc: '国内' },
            { value: 'duckduckgo', label: 'DuckDuckGo', desc: '隐私' }
          ]).map((engine) => (
            <button
              key={engine.value}
              onClick={() => update({ defaultSearchEngine: engine.value as 'bing' | 'baidu' | 'duckduckgo' })}
              className={`flex-1 rounded-lg border p-2.5 text-center transition-all duration-200 ${
                (local.defaultSearchEngine ?? 'bing') === engine.value
                  ? 'border-accent bg-accent/10'
                  : 'border-border bg-bg-elevated hover:border-border-hover'
              }`}
            >
              <p className={`text-xs font-semibold ${
                (local.defaultSearchEngine ?? 'bing') === engine.value ? 'text-accent' : 'text-text-primary'
              }`}>
                {engine.label}
              </p>
              <p className="text-[10px] text-text-muted mt-0.5">{engine.desc}</p>
            </button>
          ))}
        </div>
      </div>
      <NumberInputRow
        icon={<Search size={15} />}
        label="搜索结果默认数量"
        desc="web_search 默认返回数量"
        value={local.searchResultsCount ?? 5}
        min={3}
        max={20}
        step={1}
        unit="条"
        onChange={(v) => update({ searchResultsCount: v })}
      />
      <NumberInputRow
        icon={<Globe size={15} />}
        label="网页抓取内容上限"
        desc="web_fetch 默认返回最大字符数"
        value={local.webFetchMaxLength ?? 10000}
        min={5000}
        max={50000}
        step={1000}
        unit="字符"
        onChange={(v) => update({ webFetchMaxLength: v })}
      />
      <ToggleRow
        icon={<Database size={15} />}
        label="网页缓存"
        desc="本地缓存减少重复请求"
        active={local.webCacheEnabled ?? true}
        onToggle={() => update({ webCacheEnabled: !(local.webCacheEnabled ?? true) })}
        activeText="已开启 · 本地缓存"
        inactiveText="已关闭 · 不缓存"
      />
      <NumberInputRow
        icon={<Database size={15} />}
        label="网页缓存最大大小"
        desc="超限自动清理最旧条目"
        value={local.webCacheMaxSizeMB ?? 100}
        min={10}
        max={500}
        step={10}
        unit="MB"
        onChange={(v) => update({ webCacheMaxSizeMB: v })}
      />
    </>
  )
}

// ─── 视觉模型 Section ──────────────────────────────────

interface VisionSectionProps {
  local: AppSettings
  update: (patch: Partial<AppSettings>) => void
}

export function VisionSection({ local, update }: VisionSectionProps): React.ReactElement {
  return (
    <div className="ios-card p-3.5 space-y-3 my-2">
      <div className="flex items-center gap-2">
        <Eye size={15} className="text-accent" />
        <div>
          <p className="text-sm font-medium text-text-primary">视觉模型配置</p>
          <p className="text-xs text-text-muted">Agent 通过此模型分析截图、UI 设计稿和图片内容</p>
        </div>
      </div>
      <div className="space-y-2">
        <div>
          <label className="text-xs text-text-muted">API Key</label>
          <input
            type="password"
            value={local.visionApiKey ?? ''}
            onChange={(e) => update({ visionApiKey: e.target.value })}
            placeholder="sk-..."
            className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-text-muted">Base URL</label>
          <input
            type="text"
            value={local.visionBaseUrl ?? ''}
            onChange={(e) => update({ visionBaseUrl: e.target.value })}
            placeholder="https://api.agnes-ai.cn/v1"
            className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-text-muted">模型名称</label>
          <input
            type="text"
            value={local.visionModel ?? ''}
            onChange={(e) => update({ visionModel: e.target.value })}
            placeholder="agnes-2.5-flash"
            className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
          />
        </div>
      </div>
    </div>
  )
}
