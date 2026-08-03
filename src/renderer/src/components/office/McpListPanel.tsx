import { useState, useEffect, useCallback } from 'react'
import type React from 'react'
import { Upload, Server, Trash2, Power, X, ChevronDown, ChevronRight, Terminal, Globe } from 'lucide-react'
import type { McpServerConfig } from '@shared/types'

/**
 * McpListPanel — MCP 服务器列表面板
 *
 * 支持导入标准 mcpServers JSON 配置（兼容 Cursor / Claude Code / Cline / Windsurf 等）。
 * 导入方式：
 *   1. 从文件导入（选择 .json 文件）
 *   2. 粘贴 JSON 配置
 *
 * 导入后持久化保存，可启用/禁用、可删除。
 * 支持 stdio / sse / http 三种传输方式。
 */
export function McpListPanel(): React.ReactElement {
  const [servers, setServers] = useState<McpServerConfig[]>([])
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // 加载已导入的 MCP 服务器
  const loadServers = useCallback(async () => {
    try {
      const loaded = await window.api.mcp.load()
      setServers(loaded)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { void loadServers() }, [loadServers])

  // 从文件导入
  const handleImportFromFile = async (): Promise<void> => {
    try {
      setImporting(true)
      setImportError('')
      const filePaths = await window.api.dialog.openFile([
        { name: 'JSON', extensions: ['json'] }
      ])
      if (filePaths.length === 0) return

      const result = await window.api.fs.readFileContent(filePaths[0], 10000)
      if (!result.success || !result.content) {
        setImportError(result.error || '读取文件失败')
        return
      }

      const { servers: parsed, error } = await window.api.mcp.parseConfig(result.content)
      if (error) {
        setImportError(error)
        return
      }

      // 去重：跳过已存在的 id
      const existingIds = new Set(servers.map(s => s.id))
      const newServers = parsed.filter(s => !existingIds.has(s.id))

      if (newServers.length === 0) {
        setImportError('所有服务器已存在，未导入新条目')
        return
      }

      const updated = [...newServers, ...servers]
      setServers(updated)
      await window.api.mcp.save(updated)
      setShowImport(false)
      setImportText('')
    } catch (e) {
      setImportError((e as Error).message || '导入失败')
    } finally {
      setImporting(false)
    }
  }

  // 从文本导入
  const handleImportFromText = async (): Promise<void> => {
    if (!importText.trim()) {
      setImportError('请粘贴 JSON 配置')
      return
    }

    try {
      setImporting(true)
      setImportError('')
      const { servers: parsed, error } = await window.api.mcp.parseConfig(importText)
      if (error) {
        setImportError(error)
        return
      }

      const existingIds = new Set(servers.map(s => s.id))
      const newServers = parsed.filter(s => !existingIds.has(s.id))

      if (newServers.length === 0) {
        setImportError('所有服务器已存在，未导入新条目')
        return
      }

      const updated = [...newServers, ...servers]
      setServers(updated)
      await window.api.mcp.save(updated)
      setShowImport(false)
      setImportText('')
    } catch (e) {
      setImportError((e as Error).message || '导入失败')
    } finally {
      setImporting(false)
    }
  }

  // 切换启用/禁用
  const handleToggle = async (id: string): Promise<void> => {
    const updated = servers.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s)
    setServers(updated)
    await window.api.mcp.save(updated)
  }

  // 删除
  const handleDelete = async (id: string): Promise<void> => {
    const updated = servers.filter(s => s.id !== id)
    setServers(updated)
    await window.api.mcp.save(updated)
  }

  return (
    <div className="flex h-full flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <Server size={13} className="text-accent" />
          <span className="text-xs font-semibold text-text-primary">MCP 服务器</span>
          {servers.length > 0 && (
            <span className="text-[10px] text-text-muted">{servers.length} 个</span>
          )}
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-1 rounded-lg bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent transition-all hover:bg-accent/20"
        >
          <Upload size={11} />
          导入
        </button>
      </div>

      {/* 服务器列表 */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-elevated text-text-muted mb-2">
              <Server size={18} />
            </div>
            <p className="text-xs text-text-muted">暂无导入的 MCP 服务器</p>
            <p className="mt-1 text-[10px] text-text-muted/70">
              支持 mcpServers JSON 格式（兼容 Cursor / Claude Code 等）
            </p>
            <button
              onClick={() => setShowImport(true)}
              className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-[11px] text-text-secondary transition-all hover:border-accent/40 hover:text-accent"
            >
              <Upload size={11} />
              导入 MCP
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {servers.map((server) => (
              <div
                key={server.id}
                className={`group rounded-lg border transition-all ${
                  server.enabled
                    ? 'border-border-subtle bg-bg-hover/30'
                    : 'border-border-subtle/50 bg-bg-elevated/30 opacity-60'
                }`}
              >
                <div className="flex items-center gap-2 px-2.5 py-2">
                  {/* 展开/折叠 */}
                  <button
                    onClick={() => setExpandedId(expandedId === server.id ? null : server.id)}
                    className="text-text-muted hover:text-text-primary transition-colors"
                  >
                    {expandedId === server.id
                      ? <ChevronDown size={12} />
                      : <ChevronRight size={12} />
                    }
                  </button>

                  {/* 传输方式图标 */}
                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${
                    server.transport === 'stdio'
                      ? 'bg-blue-500/10 text-blue-400'
                      : 'bg-purple-500/10 text-purple-400'
                  }`}>
                    {server.transport === 'stdio'
                      ? <Terminal size={10} />
                      : <Globe size={10} />
                    }
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
                    onClick={() => void handleToggle(server.id)}
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
                    onClick={() => void handleDelete(server.id)}
                    className="icon-btn rounded-md p-1 text-text-muted opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                    title="删除"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>

                {/* 展开详情 */}
                {expandedId === server.id && (
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
            ))}
          </div>
        )}
      </div>

      {/* 导入弹窗 */}
      {showImport && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => !importing && setShowImport(false)}
        >
          <div
            className="mx-4 w-full max-w-lg rounded-2xl border border-border-subtle bg-bg-base p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">导入 MCP 服务器</h3>
                <p className="mt-0.5 text-[11px] text-text-muted">支持 mcpServers JSON 格式（兼容 Cursor / Claude Code / Cline 等）</p>
              </div>
              <button
                onClick={() => !importing && setShowImport(false)}
                className="icon-btn rounded-lg p-1.5 text-text-muted hover:text-text-primary"
                disabled={importing}
              >
                <X size={16} />
              </button>
            </div>

            {/* 格式示例 */}
            <div className="mb-3 rounded-lg bg-bg-elevated/50 border border-border-subtle p-2.5">
              <p className="text-[10px] text-text-muted mb-1">JSON 配置示例（stdio）：</p>
              <pre className="text-[10px] leading-relaxed text-text-secondary font-mono">{`{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "@some/mcp-server"],
      "env": { "API_KEY": "xxx" }
    }
  }
}`}</pre>
              <p className="mt-2 text-[10px] text-text-muted mb-1">SSE / HTTP 传输：</p>
              <pre className="text-[10px] leading-relaxed text-text-secondary font-mono">{`{
  "mcpServers": {
    "remote-server": {
      "url": "https://example.com/mcp",
      "transport": "sse"
    }
  }
}`}</pre>
            </div>

            {/* 从文件导入 */}
            <button
              onClick={() => void handleImportFromFile()}
              disabled={importing}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-text-secondary transition-all hover:border-accent/40 hover:text-accent disabled:opacity-50"
            >
              <Upload size={13} />
              选择 .json 配置文件
            </button>

            {/* 分隔线 */}
            <div className="my-3 flex items-center gap-2">
              <div className="h-px flex-1 bg-border-subtle" />
              <span className="text-[10px] text-text-muted">或粘贴配置</span>
              <div className="h-px flex-1 bg-border-subtle" />
            </div>

            {/* 粘贴文本 */}
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder='{"mcpServers": { "server-name": { "command": "npx", "args": [...] } }}'
              rows={6}
              disabled={importing}
              className="w-full resize-none rounded-lg border border-border bg-bg-input px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none transition-colors font-mono"
            />

            {/* 错误提示 */}
            {importError && (
              <p className="mt-2 text-[11px] text-red-400">{importError}</p>
            )}

            {/* 操作按钮 */}
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => { setShowImport(false); setImportText(''); setImportError('') }}
                disabled={importing}
                className="rounded-lg px-3 py-1.5 text-xs text-text-secondary transition-all hover:bg-bg-hover disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={() => void handleImportFromText()}
                disabled={importing || !importText.trim()}
                className="btn-liquid rounded-lg px-4 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {importing ? '导入中...' : '导入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** 将 McpServerConfig 格式化为标准 mcpServers 格式（用于详情展示） */
function formatServerConfig(server: McpServerConfig): Record<string, unknown> {
  const config: Record<string, unknown> = {}

  if (server.transport === 'stdio') {
    if (server.command) config.command = server.command
    if (server.args) config.args = server.args
    if (server.env) config.env = server.env
  } else {
    if (server.url) config.url = server.url
    config.transport = server.transport
    if (server.headers) config.headers = server.headers
  }

  return { [server.name]: config }
}
