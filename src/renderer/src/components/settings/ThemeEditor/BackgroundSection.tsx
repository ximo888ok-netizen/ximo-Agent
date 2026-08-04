import { useState, useEffect, useCallback, useRef } from 'react'
import { Image, Film, Upload, Trash2, X, AlertCircle } from 'lucide-react'
import { CollapsibleSection } from '@renderer/components/settings/shared-components'
import type { BackgroundImageConfig } from '@shared/types'
import { formatBytes } from '@shared/utils'

interface BgFile {
  path: string
  fileName: string
  type: 'static' | 'dynamic'
  size: number
}

/**
 * BackgroundSection — 背景图管理区域
 *
 * 支持导入静态图片（jpg/png/webp/bmp）和动态背景（gif/mp4/webm/mov）。
 * 导入后文件存储在 userData/ximo-agent/backgrounds/ 目录。
 * 可调节不透明度、模糊度、缩放模式。
 */
export function BackgroundSection({
  config,
  onChange,
}: {
  config: BackgroundImageConfig
  onChange: (cfg: BackgroundImageConfig) => void
}): React.ReactElement {
  const [files, setFiles] = useState<BgFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadFiles = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.api.background.list()
      setFiles(list)
    } catch (e) {
      setError(`加载失败: ${(e as Error).message}`)
    }
    setLoading(false)
  }, [])

  useEffect(() => { void loadFiles() }, [loadFiles])

  const handleSelectFile = async (): Promise<void> => {
    setError(null)
    try {
      const result = await window.api.background.select()
      if (!result) return
      await loadFiles()
      onChange({
        ...config,
        type: result.type,
        path: result.path,
      })
    } catch (e) {
      setError(`导入失败: ${(e as Error).message}`)
    }
  }

  const handleDelete = async (filePath: string): Promise<void> => {
    try {
      await window.api.background.delete(filePath)
      setFiles((prev) => prev.filter((f) => f.path !== filePath))
      if (config.path === filePath) {
        onChange({ ...config, type: 'none', path: undefined })
      }
    } catch (e) {
      setError(`删除失败: ${(e as Error).message}`)
    }
  }

  const toFileUrl = (path: string): string => `ximobg://bg/${encodeURIComponent(path)}`

  return (
    <CollapsibleSection
      icon={<Image size={16} />}
      title="背景图"
      desc="导入静态图片或动态视频作为窗口背景"
    >
      {/* 当前状态 */}
      <div className="py-1.5">
        {config.type !== 'none' && config.path ? (
          <div className="rounded-lg border border-accent/30 bg-accent/5 p-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                {config.type === 'dynamic' ? (
                  <Film size={14} className="text-accent shrink-0" />
                ) : (
                  <Image size={14} className="text-accent shrink-0" />
                )}
                <span className="text-xs font-medium text-text-primary truncate">
                  {config.path.replace(/^.*[\\/]/, '')}
                </span>
              </div>
              <button
                onClick={() => onChange({ ...config, type: 'none', path: undefined })}
                className="rounded p-0.5 text-text-muted transition-colors hover:text-red-400"
                title="移除背景"
              >
                <X size={14} />
              </button>
            </div>

            {/* 预览缩略图 */}
            <div className="mt-2 h-20 overflow-hidden rounded-md border border-border" style={{ backgroundColor: 'var(--bg-base)' }}>
              {config.type === 'dynamic' ? (
                <video
                  src={toFileUrl(config.path)}
                  className="h-full w-full object-cover"
                  muted
                  loop
                  autoPlay
                  playsInline
                />
              ) : (
                <img
                  src={toFileUrl(config.path)}
                  className="h-full w-full object-cover"
                  alt="背景预览"
                />
              )}
            </div>

            {/* 调节滑块 */}
            <div className="mt-2.5 space-y-2">
              {/* 不透明度 */}
              <div className="flex items-center gap-2">
                <span className="w-12 text-[10px] text-text-muted">透明度</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={config.opacity ?? 0.15}
                  onChange={(e) => onChange({ ...config, opacity: parseFloat(e.target.value) })}
                  className="flex-1 accent-[var(--accent-DEFAULT)]"
                />
                <span className="w-8 text-right text-[10px] font-mono text-text-secondary">
                  {Math.round((config.opacity ?? 0.15) * 100)}%
                </span>
              </div>

              {/* 模糊度 */}
              <div className="flex items-center gap-2">
                <span className="w-12 text-[10px] text-text-muted">模糊</span>
                <input
                  type="range"
                  min={0}
                  max={40}
                  step={1}
                  value={config.blur ?? 0}
                  onChange={(e) => onChange({ ...config, blur: parseInt(e.target.value) })}
                  className="flex-1 accent-[var(--accent-DEFAULT)]"
                />
                <span className="w-8 text-right text-[10px] font-mono text-text-secondary">
                  {config.blur ?? 0}px
                </span>
              </div>

              {/* 缩放模式 */}
              <div className="flex items-center gap-2">
                <span className="w-12 text-[10px] text-text-muted">缩放</span>
                <div className="flex flex-1 gap-1">
                  {(['cover', 'contain', 'center', 'tile'] as const).map((fit) => (
                    <button
                      key={fit}
                      onClick={() => onChange({ ...config, fit })}
                      className={`flex-1 rounded px-1 py-0.5 text-[10px] transition-colors ${
                        (config.fit ?? 'cover') === fit
                          ? 'bg-accent/15 text-accent'
                          : 'text-text-muted hover:text-text-secondary'
                      }`}
                    >
                      {fit === 'cover' ? '填充' : fit === 'contain' ? '适应' : fit === 'center' ? '居中' : '平铺'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-text-muted py-1">当前未设置背景图</p>
        )}
      </div>

      {/* 导入按钮 */}
      <div className="flex items-center justify-between py-1">
        <p className="text-xs text-text-muted">
          {files.length > 0 ? `已导入 ${files.length} 个文件` : '暂无已导入文件'}
        </p>
        <button
          onClick={() => void handleSelectFile()}
          className="flex items-center gap-1 rounded-md border border-border bg-bg-elevated px-2.5 py-1 text-[11px] text-text-secondary transition-colors hover:border-accent hover:text-accent"
        >
          <Upload size={12} /> 选择文件
        </button>
      </div>

      {error && (
        <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-red-500/10 p-2 text-[11px] text-red-400">
          <AlertCircle size={13} /> {error}
        </div>
      )}

      {/* 已导入文件列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : files.length > 0 ? (
        <div className="mt-1.5 space-y-1 max-h-40 overflow-y-auto">
          {files.map((f) => (
            <div
              key={f.path}
              className="group flex items-center justify-between rounded-md border border-border bg-bg-elevated px-2 py-1.5"
            >
              <div className="flex items-center gap-2 min-w-0">
                {f.type === 'dynamic' ? (
                  <Film size={12} className="text-accent shrink-0" />
                ) : (
                  <Image size={12} className="text-accent shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-text-primary truncate">
                    {f.fileName.replace(/^\d+_/, '')}
                  </p>
                  <p className="text-[9px] text-text-muted">
                    {f.type === 'dynamic' ? '动态' : '静态'} · {formatBytes(f.size)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => onChange({ ...config, type: f.type, path: f.path })}
                  className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                    config.path === f.path
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-muted hover:text-accent'
                  }`}
                >
                  {config.path === f.path ? '已应用' : '应用'}
                </button>
                <button
                  onClick={() => void handleDelete(f.path)}
                  className="rounded p-0.5 text-text-muted opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                  title="删除"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* 格式说明 */}
      <details className="mt-1.5">
        <summary className="cursor-pointer text-[10px] text-text-muted hover:text-text-secondary">
          支持的文件格式
        </summary>
        <p className="mt-0.5 text-[10px] text-text-muted">
          静态图片：JPG / PNG / WebP / BMP<br />
          动态背景：GIF / MP4 / WebM / MOV / AVI / MKV<br />
          文件导入后复制到应用数据目录，原始文件可删除。
        </p>
      </details>
    </CollapsibleSection>
  )
}
