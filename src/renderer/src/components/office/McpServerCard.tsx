import type React from 'react'
import { ChevronDown, ChevronRight, Terminal, Globe, Power, Trash2 } from 'lucide-react'
import type { McpServerConfig } from '@shared/types'
import { formatServerConfig } from './mcp-helpers'

interface McpServerCardProps {
  server: McpServerConfig
  expanded: boolean
  onToggleExpand: () => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}

/** 单个 MCP 服务器卡片 — 传输图标 + 名称 + 启停 + 展开详情 */
export function McpServerCard({ server, expanded, onToggleExpand, onToggle, onDelete }: McpServerCardProps): React.ReactElement {
  return (
    <div
      className={`group rounded-lg border transition-all ${
        server.enabled
          ? 'border-border-subtle bg-bg-hover/30'
          : 'border-border-subtle/50 bg-bg-elevated/30 opacity-60'
      }`}
    >
      <div className="flex items-center gap-2 px-2.5 py-2">
        {/* 展开/折叠 */}
        <button
          onClick={onToggleExpand}
          className="text-text-muted hover:text-text-primary transition-colors"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        {/* 传输方式图标 */}
        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${
          server.transport === 'stdio'
            ? 'bg-blue-500/10 text-blue-400'
            : 'bg-purple-500/10 text-purple-400'
        }`}>
          {server.transport === 'stdio' ? <Terminal size={10} /> : <Globe size={10} />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-text-primary truncate">{server.name}</p>
          <p className="text-[10px] text-text-muted truncate">
            {server.transport === 'stdio'
              ? `${server.command || ''} ${(server.args || []).join(' ')}`
              : server.url || ''
            }
          </p>
        </div>

        {/* 传输标签 */}
        <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ${
          server.transport === 'stdio'
            ? 'bg-blue-500/10 text-blue-400'
            : 'bg-purple-500/10 text-purple-400'
        }`}>
          {server.transport}
        </span>

        {/* 启用/禁用 */}
        <button
          onClick={() => onToggle(server.id)}
          className={`icon-btn rounded-md p-1 transition-all ${
            server.enabled
              ? 'text-green-400 hover:bg-green-400/10'
              : 'text-text-muted hover:bg-bg-hover'
          }`}
          title={server.enabled ? '已启用 — 点击禁用' : '已禁用 — 点击启用'}
        >
          <Power size={11} />
        </button>

        {/* 删除 */}
        <button
          onClick={() => onDelete(server.id)}
          className="icon-btn rounded-md p-1 text-text-muted opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
          title="删除"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* 展开详情 */}
      {expanded && (
        <div className="border-t border-border-subtle px-2.5 py-2">
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-bg-elevated/50 p-2 text-[10px] leading-relaxed text-text-secondary font-mono">
            {JSON.stringify(formatServerConfig(server), null, 2)}
          </pre>
          <div className="mt-2 text-[9px] text-text-muted">
            导入于 {new Date(server.importedAt).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  )
}
