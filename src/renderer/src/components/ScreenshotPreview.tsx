import type React from 'react'

interface ScreenshotPreviewProps {
  dataUrl?: string
  onClose: () => void
}

/**
 * ScreenshotPreview — 截图预览组件
 * 展示屏幕截图或浏览器截图的弹窗
 */
export function ScreenshotPreview({ dataUrl, onClose }: ScreenshotPreviewProps): React.ReactElement | null {
  if (!dataUrl) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div
        className="glass-panel relative mx-4 max-h-[90vh] max-w-[90vw] overflow-auto animate-fade-scale"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="关闭预览"
          className="absolute right-2 top-2 z-10 rounded-full bg-black/50 p-1.5 text-white/80 hover:bg-black/70 transition-colors active:scale-[0.97]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <img
          src={dataUrl}
          alt="截图预览"
          className="max-h-[85vh] max-w-[85vw] object-contain"
        />
      </div>
    </div>
  )
}
