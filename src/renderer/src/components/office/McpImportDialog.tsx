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
            onClick={() => !importing && onClose()}
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
          onClick={onImportFromFile}
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
          onChange={(e) => onImportTextChange(e.target.value)}
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
            onClick={onClose}
            disabled={importing}
            className="rounded-lg px-3 py-1.5 text-xs text-text-secondary transition-all hover:bg-bg-hover disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={onImportFromText}
            disabled={importing || !importText.trim()}
            className="btn-liquid rounded-lg px-4 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {importing ? '导入中...' : '导入'}
          </button>
        </div>
      </div>
    </div>
  )
}
