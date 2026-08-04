import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../../store/useStore'

/**
 * 粘贴/拖拽图片相关逻辑：Ctrl+V 粘贴截图保存为临时文件、
 * 流式结束后询问是否清理临时截图、拖拽文件到输入框附加。
 */
export function usePasteImage() {
  const addAttachedFile = useStore((s) => s.addAttachedFile)
  const addPastedImage = useStore((s) => s.addPastedImage)
  const isStreaming = useStore((s) => s.isStreaming)
  const pastedImagePaths = useStore((s) => s.pastedImagePaths)
  const clearPastedImages = useStore((s) => s.clearPastedImages)

  // 粘贴图片 — Ctrl+V 时检测剪贴板中的图片
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent): Promise<void> => {
      // 如果剪贴板有图片（如截图），保存为临时文件并附加
      const items = e.clipboardData?.items
      if (!items) return
      let hasImage = false
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          hasImage = true
          break
        }
      }
      if (!hasImage) return

      // 使用主进程剪贴板 API 保存图片到 userData 目录（避免 Windows 8.3 短路径）
      e.preventDefault()
      try {
        const filePath = await window.api.clipboard.saveImage()
        if (filePath) {
          addAttachedFile(filePath)
          addPastedImage(filePath)
        }
      } catch {
        // 静默处理
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [addAttachedFile, addPastedImage])

  // 流式结束后：询问用户是否删除本次粘贴的截图
  const prevStreamingRef = useRef(false)
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && pastedImagePaths.length > 0) {
      const shouldDelete = window.confirm(
        `本次任务使用了 ${pastedImagePaths.length} 张粘贴的截图，是否删除这些临时图片？`
      )
      if (shouldDelete) {
        void window.api.clipboard.deleteImages(pastedImagePaths)
      }
      clearPastedImages()
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming, pastedImagePaths, clearPastedImages])

  // 拖拽图片到输入框
  const [isDragOver, setIsDragOver] = useState(false)
  const handleDragOver = useCallback((e: React.DragEvent): void => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      setIsDragOver(true)
    }
  }, [])
  const handleDragLeave = useCallback((e: React.DragEvent): void => {
    if (e.currentTarget === e.target) setIsDragOver(false)
  }, [])
  const handleDrop = useCallback((e: React.DragEvent): void => {
    e.preventDefault()
    setIsDragOver(false)
    // Electron 拖拽文件提供 path 属性
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        // Electron 的 File 对象有 path 属性
        const filePath = (file as unknown as { path?: string }).path
        if (filePath) {
          addAttachedFile(filePath)
        }
      }
    }
  }, [addAttachedFile])

  return { isDragOver, handleDragOver, handleDragLeave, handleDrop }
}
