import { useState, memo, useRef, useEffect } from 'react'
import type React from 'react'
import { Maximize2, Minimize2, Loader2 } from 'lucide-react'

interface DesignPreviewPanelProps {
  componentId: string
  componentName?: string
  onClose: () => void
}

// ─── 预览 HTML 路径 ──────────────────────────────────────
// 由 scripts/gen-previews.mjs 生成，存放在 public/ui-previews/ 下。
// 开发环境 Vite 将 public 映射到根路径，相对路径 ./ui-previews/{id}.html
// 会基于当前页面 URL（dev server 根）正确解析；
// 生产环境通过 file:// 加载，必须用相对路径 ./ui-previews/{id}.html
// 才能正确解析到渲染进程输出目录（index.html 同级的 ui-previews/）。
// 绝对路径 /ui-previews/ 在 file:// 下会解析到文件系统根目录，导致 404。

function getPreviewSrc(componentId: string): string {
  return `./ui-previews/${componentId}.html`
}

// ─── 主组件 ────────────────────────────────────────────

export const DesignPreviewPanel = memo(function DesignPreviewPanel({
  componentId, componentName, onClose
}: DesignPreviewPanelProps): React.ReactElement {
  const [fullscreen, setFullscreen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const src = getPreviewSrc(componentId)
  const name = componentName || componentId

  // 切换组件时重置状态
  useEffect(() => {
    setLoading(true)
    setError(false)
  }, [componentId])

  // 超时检测 — iframe onLoad 在 file:// 下可能不触发出错情况
  // 用超时兜底：15 秒仍未加载完成则判定为失败
  useEffect(() => {
    if (!loading) return
    const timer = setTimeout(() => {
      setLoading(false)
      setError(true)
    }, 15000)
    return () => clearTimeout(timer)
  }, [loading, componentId])

  // iframe onLoad 在 file:// 协议下即使加载了错误页也会触发
  // 通过检查 contentDocument 来判断是否真正加载了有效内容
  const handleLoad = (): void => {
    try {
      const doc = iframeRef.current?.contentDocument
      // 如果能访问 contentDocument 且有内容，说明加载成功
      if (doc && doc.readyState === 'complete') {
        setLoading(false)
      }
    } catch {
      // 跨域无法访问 contentDocument — 加载可能成功，保守地清除 loading
      setLoading(false)
    }
  }

  const iframeEl = (
    <iframe
      ref={iframeRef}
      src={src}
      title={name}
      className="w-full h-full border-0"
      sandbox="allow-scripts allow-same-origin"
      onLoad={handleLoad}
    />
  )

  // 全屏模式
  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
        <div className="flex items-center justify-between px-4 py-2 glass border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse-dot" />
            <span className="text-xs font-medium text-text-secondary">{name} · 预览</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setFullscreen(false)} aria-label="退出全屏" className="icon-btn rounded-control p-1">
              <Minimize2 size={13} />
            </button>
            <button onClick={onClose} aria-label="关闭预览" className="icon-btn rounded-control p-1 text-xs">✕</button>
          </div>
        </div>
        <div className="flex-1 relative bg-[#0f172a]">
          {iframeEl}
          {loading && <LoadingOverlay />}
          {error && <ErrorOverlay name={name} src={src} />}
        </div>
      </div>
    )
  }

  // 嵌入模式
  return (
    <div className="flex h-full flex-col">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent animate-pulse-dot" />
          <span className="text-xs font-medium text-text-secondary">{name}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setFullscreen(true)} className="icon-btn rounded-control p-0.5" title="全屏">
            <Maximize2 size={13} />
          </button>
          <button onClick={onClose} aria-label="关闭预览" className="icon-btn rounded-control p-0.5 text-xs">✕</button>
        </div>
      </div>
      {/* 预览区 */}
      <div className="flex-1 relative bg-[#0f172a] overflow-hidden">
        {iframeEl}
        {loading && <LoadingOverlay />}
        {error && <ErrorOverlay name={name} src={src} />}
      </div>
    </div>
  )
})

// ─── 加载中遮罩 ──────────────────────────────────────────

function LoadingOverlay(): React.ReactElement {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0f172a]">
      <Loader2 size={20} className="animate-spin text-accent" />
      <p className="text-caption text-text-muted">加载预览中...</p>
    </div>
  )
}

// ─── 错误遮罩 ──────────────────────────────────────────

function ErrorOverlay({ name, src }: { name: string; src: string }): React.ReactElement {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center bg-[#0f172a]">
      <div className="flex h-12 w-12 items-center justify-center rounded-panel bg-accent/10">
        <Maximize2 size={20} className="text-accent/60" />
      </div>
      <div>
        <p className="text-xs font-medium text-text-secondary">{name}</p>
        <p className="text-caption text-text-muted mt-0.5">预览加载失败</p>
        <p className="text-caption text-text-tertiary mt-1 font-mono break-all max-w-[280px]">{src}</p>
        <p className="text-caption text-text-tertiary mt-0.5">可能原因：网络无法访问 esm.sh CDN</p>
      </div>
    </div>
  )
}
