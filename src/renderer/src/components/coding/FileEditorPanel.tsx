import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Save, Loader2, FileText } from 'lucide-react'

interface FileEditorPanelProps {
  filePath: string
  onBack: () => void
  onSaved?: () => void
}

/** 文件编辑器面板 — 内嵌在右侧栏中，覆盖文件树，带返回按钮 */
export function FileEditorPanel({ filePath, onBack, onSaved }: FileEditorPanelProps): React.ReactElement {
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [readOnly, setReadOnly] = useState(false)

  const fileName = filePath.split(/[/\\]/).pop() || filePath
  const ext = fileName.split('.').pop()?.toLowerCase() || ''

  // 判断是否为二进制文件（不可编辑）
  const binaryExts = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'ico', 'svg', 'webp', 'bmp',
    'mp3', 'mp4', 'avi', 'mov', 'wav', 'flac',
    'zip', 'tar', 'gz', 'rar', '7z',
    'exe', 'dll', 'so', 'dylib',
    'woff', 'woff2', 'ttf', 'eot', 'otf',
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'
  ])

  const isBinary = binaryExts.has(ext)

  const loadFile = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await window.api.fs.readFileContent(filePath, 0)
    if (!result.success) {
      setError(result.error || '读取失败')
      setLoading(false)
      return
    }
    setContent(result.content || '')
    setOriginalContent(result.content || '')
    setReadOnly(isBinary)
    setLoading(false)
  }, [filePath, isBinary])

  useEffect(() => {
    loadFile()
  }, [loadFile])

  const hasChanges = content !== originalContent

  const handleSave = useCallback(async () => {
    setSaving(true)
    const result = await window.api.fs.writeFile(filePath, content)
    if (result.success) {
      setOriginalContent(content)
      onSaved?.()
    } else {
      setError(result.error || '保存失败')
    }
    setSaving(false)
  }, [filePath, content, onSaved])

  // Ctrl+S 保存，Ctrl+Backspace 返回
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && !readOnly) {
        e.preventDefault()
        if (hasChanges && !saving) {
          handleSave()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasChanges, saving, readOnly, handleSave])

  // 行数统计
  const lineCount = content.split('\n').length
  const charCount = content.length

  return (
    <aside className="flex h-full w-full flex-col border-l border-border-subtle bg-bg-base">
      {/* 头部 — 返回按钮 + 文件名 + 保存 */}
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2 shrink-0">
        <div className="flex min-w-0 items-center gap-2">
          <button aria-label="返回文件树"
            onClick={onBack}
            className="icon-btn flex h-7 w-7 shrink-0 items-center justify-center rounded-card"
            title="返回文件树"
          >
            <ArrowLeft size={13} />
          </button>
          <FileText size={13} className="shrink-0 text-accent" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-text-primary">{fileName}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {hasChanges && (
            <span className="text-caption text-amber-400">未保存</span>
          )}
          {!isBinary && (
            <button aria-label="保存 (Ctrl+S)"
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="flex items-center gap-1 rounded-card bg-accent/10 px-3 py-1.5 text-caption font-medium text-accent transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] hover:bg-accent/20 disabled:opacity-30 disabled:cursor-not-allowed"
              title="保存 (Ctrl+S)"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
              保存
            </button>
          )}
        </div>
      </div>

      {/* 文件路径 */}
      <div className="px-3 py-1 border-b border-border-subtle-soft shrink-0">
        <p className="truncate text-caption text-text-muted" title={filePath}>{filePath}</p>
      </div>

      {/* 内容区 */}
      <div className="relative flex-1 overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 size={20} className="animate-spin text-text-muted" />
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-red-400">{error}</p>
              <button onClick={loadFile} className="btn-ghost mt-3 rounded-card px-3 py-1.5 text-xs">重试</button>
            </div>
          </div>
        ) : readOnly ? (
          <div className="flex h-full items-center justify-center p-8">
            <p className="text-sm text-text-muted">二进制文件不支持编辑</p>
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="h-full w-full resize-none bg-bg-base p-3 font-mono text-xs leading-relaxed text-text-primary outline-none placeholder:text-text-muted"
            spellCheck={false}
            autoFocus
          />
        )}
      </div>

      {/* 底部状态栏 */}
      <div className="flex items-center justify-between border-t border-border-subtle px-3 py-1.5 shrink-0">
        <div className="flex items-center gap-3 text-caption text-text-muted">
          <span>{lineCount} 行</span>
          <span>{charCount} 字符</span>
          <span className="uppercase">{ext || 'plain'}</span>
        </div>
        <div className="text-caption text-text-muted">
          {hasChanges ? 'Ctrl+S 保存' : ''}
        </div>
      </div>
    </aside>
  )
}
