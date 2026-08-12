import { useState, useEffect, useCallback } from 'react'
import type React from 'react'
import { Upload, Server } from 'lucide-react'
import type { McpServerConfig } from '@shared/types'
import { McpServerCard } from './McpServerCard'
import { McpImportDialog } from './McpImportDialog'

/**
 * McpListPanel — MCP 服务器列表面板
 *
 * 支持导入标准 mcpServers JSON 配置（兼容 Cursor / Claude Code / Cline / Windsurf 等）。
 * 导入方式：从文件导入 / 粘贴 JSON 配置。导入后持久化保存，可启用/禁用、可删除。
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
