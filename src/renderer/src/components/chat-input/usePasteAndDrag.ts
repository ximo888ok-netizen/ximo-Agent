import { useState, useEffect, useRef } from 'react'

/** 粘贴图片 + 拖拽文件 hook */
export function usePasteAndDrag(
  isStreaming: boolean,
  pastedImagePaths: string[],
  addAttachedFile: (path: string) => void,
  addPastedImage: (path: string) => void,
  clearPastedImages: () => void,
): {
  isDragOver: boolean
  handleDragOver: (e: React.DragEvent) => void
  handleDragLeave: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent) => void
} {
  const [isDragOver, setIsDragOver] = useState(false)
  const prevStreamingRef = useRef(false)

  // 粘贴图片
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent): Promise<void> => {
      const items = e.clipboardData?.items
      if (!items) return
      let hasImage = false
      for (const item of items) { if (item.type.startsWith('image/')) { hasImage = true; break } }
      if (!hasImage) return
      e.preventDefault()
      try {
        const filePath = await window.api.clipboard.saveImage()
        if (filePath) { addAttachedFile(filePath); addPastedImage(filePath) }
      } catch { /* 静默处理 */ }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [addAttachedFile, addPastedImage])

  // 流式结束后：询问用户是否删除本次粘贴的截图
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && pastedImagePaths.length > 0) {
      const shouldDelete = window.confirm(`本次任务使用了 ${pastedImagePaths.length} 张粘贴的截图，是否删除这些临时图片？`)
      if (shouldDelete) void window.api.clipboard.deleteImages(pastedImagePaths)
      clearPastedImages()
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming, pastedImagePaths, clearPastedImages])

  const handleDragOver = (e: React.DragEvent): void => {
    if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setIsDragOver(true) }
  }
  const handleDragLeave = (e: React.DragEvent): void => {
    if (e.currentTarget === e.target) setIsDragOver(false)
  }
  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setIsDragOver(false)
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const filePath = (files[i] as unknown as { path?: string }).path
        if (filePath) addAttachedFile(filePath)
      }
    }
  }

  return { isDragOver, handleDragOver, handleDragLeave, handleDrop }
}
