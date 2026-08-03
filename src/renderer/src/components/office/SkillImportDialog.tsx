import { useState } from 'react'
import { Upload, X } from 'lucide-react'

interface SkillImportDialogProps {
  importing: boolean
  importError: string
  onImportFromFile: () => Promise<void>
  onImportFromText: (text: string) => Promise<void>
  onClose: () => void
}

export function SkillImportDialog({
  importing,
  importError,
  onImportFromFile,
  onImportFromText,
  onClose
}: SkillImportDialogProps): React.ReactElement {
  const [importText, setImportText] = useState('')

  const handleClose = (): void => {
    if (!importing) {
      setImportText('')
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="mx-4 w-full max-w-lg rounded-2xl border border-border-subtle bg-bg-base p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗头部 */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">导入技能</h3>
            <p className="mt-0.5 text-[11px] text-text-muted">支持 SKILL.md 格式（YAML frontmatter + Markdown 正文）</p>
          </div>
          <button
            onClick={handleClose}
            className="icon-btn rounded-lg p-1.5 text-text-muted hover:text-text-primary"
            disabled={importing}
          >
            <X size={16} />
          </button>
        </div>

        {/* 格式示例 */}
        <div className="mb-3 rounded-lg bg-bg-elevated/50 border border-border-subtle p-2.5">
          <p className="text-[10px] text-text-muted mb-1">SKILL.md 格式示例：</p>
          <pre className="text-[10px] leading-relaxed text-text-secondary font-mono">{`---
name: "my-skill"
description: "技能描述"
triggers:
  - "触发词1"
  - "触发词2"
---

# 技能正文
AI 指令内容...`}</pre>
        </div>

        {/* 从文件导入 */}
        <button
          onClick={() => void onImportFromFile()}
          disabled={importing}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-text-secondary transition-all hover:border-accent/40 hover:text-accent disabled:opacity-50"
        >
          <Upload size={13} />
          选择 .md / .txt 文件
        </button>

        {/* 分隔线 */}
        <div className="my-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-border-subtle" />
          <span className="text-[10px] text-text-muted">或粘贴内容</span>
          <div className="h-px flex-1 bg-border-subtle" />
        </div>

        {/* 粘贴文本 */}
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder="粘贴 SKILL.md 内容..."
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
            onClick={handleClose}
            disabled={importing}
            className="rounded-lg px-3 py-1.5 text-xs text-text-secondary transition-all hover:bg-bg-hover disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={() => void onImportFromText(importText)}
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
