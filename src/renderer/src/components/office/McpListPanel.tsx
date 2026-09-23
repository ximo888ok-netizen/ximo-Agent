import { useState, useEffect, useCallback, useMemo } from 'react'
import type React from 'react'
import { Upload, Server, Search, X, ArrowUpNarrowWide } from 'lucide-react'
import type { McpServerConfig } from '@shared/types'
import { McpServerCard } from './McpServerCard'
import { McpImportDialog } from './McpImportDialog'

/**
 * McpListPanel — MCP 服务器列表面板
 *
 * 支持导入标准 mcpServers JSON 配置（兼容 Cursor / Claude Code / Cline / Windsurf 等）。
 * 导入方式：从文件导入 / 粘贴 JSON 配置。导入后持久化保存，可启用/禁用、可删除。
 * 支持 stdio / sse / http 三种传输方式。支持搜索与「未启用优先」排序。
 */
export function McpListPanel(): React.ReactElement {
  const [servers, setServers] = useState<McpServerConfig[]>([])
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [disabledFirst, setDisabledFirst] = useState(false)

  const enabledCount = useMemo(() => servers.filter((s) => s.enabled).length, [servers])

  const visibleServers = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? servers.filter((s) =>
          s.name.toLowerCase().includes(q) ||
          (s.command ?? '').toLowerCase().includes(q) ||
          (s.url ?? '').toLowerCase().includes(q)
        )
      : servers
    // 「未启用优先」只调顺序，不做过滤 —— 未启用的条目最容易被忽略
    return disabledFirst ? [...filtered].sort((a, b) => Number(a.enabled) - Number(b.enabled)) : filtered
  }, [servers, query, disabledFirst])

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

  const closeImport = (): void => {
    setShowImport(false)
    setImportText('')
    setImportError('')
  }

  return (
    <div className="flex h-full flex-col">
      {/* 头部 — 启用统计 + 导入操作（标题由外层浮层提供） */}
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-2 shrink-0">
        <span className="min-w-0 truncate text-caption text-text-muted" title={`已启用 ${enabledCount} / 共 ${servers.length} 个服务器`}>
          {servers.length > 0
            ? `已启用 ${enabledCount}/${servers.length}${enabledCount < servers.length ? ' · 有未启用的服务器' : ''}`
            : '未导入任何服务器'}
        </span>
        <button
          onClick={() => setShowImport(true)}
          className="flex shrink-0 items-center gap-1 rounded-card bg-accent/10 px-2 py-1 text-caption font-medium text-accent transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] hover:bg-accent/20 active:scale-[0.97]"
        >
          <Upload size={11} />
          导入
        </button>
      </div>

      {/* 工具条 — 有内容时才出现；未启用的排在前面，方便发现被忽略的服务器 */}
      {servers.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 shrink-0">
          <div className="flex flex-1 items-center gap-1.5 rounded-card border border-border bg-bg-input px-2 py-1">
            <Search size={11} className="shrink-0 text-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索名称或启动命令…"
              className="min-w-0 flex-1 bg-transparent text-caption text-text-primary placeholder:text-text-muted focus-ring"
            />
            {query && (
              <button onClick={() => setQuery('')} className="icon-btn rounded-control p-0.5" title="清空搜索">
                <X size={11} />
              </button>
            )}
          </div>
          <button
            onClick={() => setDisabledFirst(!disabledFirst)}
            className={`flex shrink-0 items-center gap-1 rounded-card px-2 py-1 text-caption transition-colors ${
              disabledFirst ? 'bg-accent/15 text-accent' : 'text-text-muted hover:bg-bg-hover hover:text-text-secondary'
            }`}
            title="把未启用的排到最前面"
          >
            <ArrowUpNarrowWide size={11} />
            未启用优先
          </button>
        </div>
      )}

      {/* 服务器列表 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="h-10 w-10 items-center justify-center rounded-panel bg-bg-elevated text-text-muted mb-2 flex">
              <Server size={16} />
            </div>
            <p className="text-xs text-text-muted">暂无导入的 MCP 服务器</p>
            <p className="mt-1 text-caption leading-relaxed text-text-muted">
              支持 mcpServers JSON 格式（兼容 Cursor / Claude Code 等）
              <br />
              导入后逐个启用，Agent 即可调用其中的工具
            </p>
            <button
              onClick={() => setShowImport(true)}
              className="mt-3 flex items-center gap-1.5 rounded-card border border-dashed border-border px-3 py-1.5 text-caption text-text-secondary transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] hover:border-accent/40 hover:text-accent active:scale-[0.97]"
            >
              <Upload size={11} />
              导入 MCP
            </button>
          </div>
        ) : visibleServers.length === 0 ? (
          <p className="px-3 py-6 text-center text-caption text-text-muted">没有匹配「{query}」的服务器</p>
        ) : (
          <div className="space-y-1.5">
            {visibleServers.map((server) => (
              <McpServerCard
                key={server.id}
                server={server}
                expanded={expandedId === server.id}
                onToggleExpand={() => setExpandedId(expandedId === server.id ? null : server.id)}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* 导入弹窗 */}
      {showImport && (
        <McpImportDialog
          importText={importText}
          importError={importError}
          importing={importing}
          onClose={closeImport}
          onImportTextChange={setImportText}
          onImportFromFile={handleImportFromFile}
          onImportFromText={handleImportFromText}
        />
      )}
    </div>
  )
}
