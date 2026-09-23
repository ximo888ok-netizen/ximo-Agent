import type React from 'react'
import { Upload, X } from 'lucide-react'

interface McpImportDialogProps {
  importText: string
  importError: string
  importing: boolean
  onClose: () => void
  onImportTextChange: (text: string) => void
  onImportFromFile: () => void
  onImportFromText: () => void
}

/** MCP 服务器导入弹窗 — 支持文件导入 + 粘贴 JSON */
export function McpImportDialog({
  importText, importError, importing,
  onClose, onImportTextChange, onImportFromFile, onImportFromText,
}: McpImportDialogProps): React.ReactElement {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={() => !importing && onClose()}
    >
      <div
        className="mx-4 w-full max-w-lg rounded-panel border border-border-subtle bg-bg-base p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗头部 */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">导入 MCP 服务器</h3>
            <p className="mt-0.5 text-caption text-text-muted">支持 mcpServers JSON 格式（兼容 Cursor / Claude Code / Cline 等）</p>
          </div>
          <button
            onClick={() => !importing && onClose()}
            className="icon-btn rounded-card p-1.5 text-text-muted hover:text-text-primary"
            disabled={importing}
          >
            <X size={16} />
          </button>
        </div>

        {/* 格式示例 */}
        <div className="mb-3 rounded-card bg-bg-elevated-soft border border-border-subtle p-2.5">
          <p className="text-caption text-text-muted mb-1">JSON 配置示例（stdio）：</p>
          <pre className="text-caption leading-relaxed text-text-secondary font-mono">{`{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "@some/mcp-server"],
      "env": { "API_KEY": "xxx" }
    }
  }
}`}</pre>
          <p className="mt-2 text-caption text-text-muted mb-1">SSE / HTTP 传输：</p>
          <pre className="text-caption leading-relaxed text-text-secondary font-mono">{`{
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
          onClick={onImportFromFile}
          disabled={importing}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-card border border-dashed border-border px-3 py-2 text-xs text-text-secondary transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] hover:border-accent/40 hover:text-accent disabled:opacity-50 active:scale-[0.97]"
        >
          <Upload size={13} />
          选择 .json 配置文件
        </button>

        {/* 分隔线 */}
        <div className="my-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-border-subtle" />
          <span className="text-caption text-text-muted">或粘贴配置</span>
          <div className="h-px flex-1 bg-border-subtle" />
        </div>

        {/* 粘贴文本 */}
        <textarea
          value={importText}
          onChange={(e) => onImportTextChange(e.target.value)}
          placeholder='{"mcpServers": { "server-name": { "command": "npx", "args": [...] } }}'
          rows={6}
          disabled={importing}
          className="w-full resize-none rounded-card border border-border bg-bg-input px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus-ring transition-colors font-mono"
        />

        {/* 错误提示 */}
        {importError && (
          <p className="mt-2 text-caption text-red-400">{importError}</p>
        )}

        {/* 操作按钮 */}
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={importing}
            className="rounded-card px-3 py-1.5 text-xs text-text-secondary transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] hover:bg-bg-hover disabled:opacity-50 active:scale-[0.97]"
          >
            取消
          </button>
          <button
            onClick={onImportFromText}
            disabled={importing || !importText.trim()}
            className="btn-liquid rounded-card px-4 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {importing ? '导入中...' : '导入'}
          </button>
        </div>
      </div>
    </div>
  )
}
