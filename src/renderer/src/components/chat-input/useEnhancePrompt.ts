import { useState, useCallback, useRef, useEffect } from 'react'
import type { RefObject } from 'react'
import type { ChatMessage } from '@shared/types'

interface UseEnhancePromptOptions {
  text: string
  setText: (t: string) => void
  conversation: { messages: ChatMessage[] } | null
  currentMode: string
  projectPath: string
  textareaRef: RefObject<HTMLTextAreaElement | null>
}

/** 增强提示词 — 调用后端增强用户输入，支持撤销恢复原文 */
export function useEnhancePrompt({
  text, setText, conversation, currentMode, projectPath, textareaRef,
}: UseEnhancePromptOptions) {
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [enhanceError, setEnhanceError] = useState<string | null>(null)
  const [originalText, setOriginalText] = useState<string | null>(null)

  // 增强错误提示的自动清除定时器 — 用 ref 管理，避免快速连点时叠加多个定时器
  const enhanceErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleErrorClear = useCallback((): void => {
    if (enhanceErrorTimerRef.current !== null) clearTimeout(enhanceErrorTimerRef.current)
    enhanceErrorTimerRef.current = setTimeout(() => setEnhanceError(null), 4000)
  }, [])
  useEffect(() => () => {
    if (enhanceErrorTimerRef.current !== null) clearTimeout(enhanceErrorTimerRef.current)
  }, [])

  const handleEnhancePrompt = useCallback(async (): Promise<void> => {
    const trimmed = text.trim()
    if (!trimmed) return
    setIsEnhancing(true)
    setEnhanceError(null)
    try {
      // 提取最近 3 轮对话作为上下文
      let recentContext: string | undefined
      if (conversation?.messages && conversation.messages.length > 0) {
        const recent = conversation.messages.slice(-6)
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => `[${m.role === 'user' ? '用户' : '助手'}] ${m.content.slice(0, 300)}`)
          .join('\n')
        if (recent) recentContext = recent
      }

      const result = await window.api.chat.enhancePrompt({
        text: trimmed,
        mode: currentMode,
        recentContext,
        projectPath: projectPath || undefined,
      })

      if (result.success && result.enhancedText) {
        setOriginalText(trimmed)
        setText(result.enhancedText)
        requestAnimationFrame(() => textareaRef.current?.focus())
      } else {
        const errMsg = result.error || '增强失败'
        setEnhanceError(errMsg)
        console.error('[enhance-prompt] 失败:', errMsg)
        scheduleErrorClear()
      }
    } catch (e) {
      const errMsg = (e as Error).message || '增强异常'
      setEnhanceError(errMsg)
      console.error('[enhance-prompt] 异常:', e)
      scheduleErrorClear()
    } finally {
      setIsEnhancing(false)
    }
  }, [text, setText, conversation, currentMode, projectPath, textareaRef, scheduleErrorClear])

  const handleUndoEnhance = useCallback((): void => {
    if (originalText !== null) {
      setText(originalText)
      setOriginalText(null)
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }, [originalText, setText, textareaRef])

  /** 用户手动编辑时清除可撤销标记 */
  const clearOriginal = useCallback((): void => {
    if (originalText !== null) setOriginalText(null)
  }, [originalText])

  return {
    isEnhancing, enhanceError, originalText,
    handleEnhancePrompt, handleUndoEnhance, clearOriginal,
  }
}
