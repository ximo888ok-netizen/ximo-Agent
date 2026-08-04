import type { StateCreator } from 'zustand'
import type { ChatMessage } from '@shared/types'
import type { StoreState } from '../types'
import { genId, makeTitle } from '../utils'
import { runStream, STREAMING_RESET, buildPersistPatch } from '../runStream'

export type StreamSlice = Pick<StoreState,
  | 'sendMessage'
  | 'regenerate'
  | 'cancelStream'
>

export const createStreamSlice: StateCreator<StoreState, [], [], StreamSlice> = (set, get) => ({
  sendMessage: async (text, options) => {
    const state = get()
    if (state.isStreaming) return
    let trimmed = text.trim()
    if (!trimmed) return

    // 联网搜索提示注入
    if (state.networkSearchOn && !options?.skipNetworkHint) {
      if (!trimmed.includes('联网搜索') && !trimmed.includes('web_search')) {
        trimmed = `[联网搜索模式] 请优先使用 web_search 工具搜索最新信息来回答以下问题：\n\n${trimmed}`
      }
    }

    // 附加文件信息注入 — 区分图片文件和普通文件
    if (state.attachedFiles.length > 0) {
      const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']
      const imageFiles = state.attachedFiles.filter((f) => {
        const ext = f.toLowerCase().match(/\.[^.]+$/)?.[0] || ''
        return imageExts.includes(ext)
      })
      const otherFiles = state.attachedFiles.filter((f) => !imageFiles.includes(f))
      const parts: string[] = []
      if (imageFiles.length > 0) {
        const imgList = imageFiles.map((f) => `- ${f}`).join('\n')
        parts.push(`📎 附加图片：\n${imgList}\n请使用 vision_analyze(file_path="图片路径", prompt="分析指令") 工具来分析以上图片内容。`)
      }
      if (otherFiles.length > 0) {
        const fileList = otherFiles.map((f) => `- ${f}`).join('\n')
        parts.push(`📎 附加文件：\n${fileList}\n请先使用 file_read 工具读取以上文件内容，再根据内容回答。`)
      }
      trimmed = `${trimmed}\n\n${parts.join('\n\n')}`
      get().clearAttachedFiles()
    }

    // UI 组件选择注入 — 设计模式下，将用户选择的组件列表附在消息中
    if (state.selectedComponentIds.length > 0 && state.currentMode === 'design') {
      const compList = state.selectedComponentIds.map((id, i) =>
        `${i + 1}. design_component(action="get", component_id="${id}")`
      ).join('\n')
      trimmed = `${trimmed}\n\n🧩 请使用以下 ${state.selectedComponentIds.length} 个 UI 组件来生成页面，先逐个获取源码再组合到 HTML 中：\n${compList}`
      get().clearSelectedComponents()
    }

    // @file 引用解析 — 直接读取文件内容注入上下文（避免浪费工具轮次）
    const mentionMatches = [...trimmed.matchAll(/@([^\s@]+\.\w+)/g)]
    if (mentionMatches.length > 0 && state.projectPath) {
      const sep = state.projectPath.includes('\\') ? '\\' : '/'
      const fileContents: string[] = []
      for (const match of mentionMatches) {
        const relativePath = match[1]
        const absPath = `${state.projectPath}${sep}${relativePath.replace(/\//g, sep)}`
        try {
          const result = await window.api.fs.readFileContent(absPath, 300)
          if (result.success && result.content) {
            const ext = relativePath.split('.').pop() || ''
            fileContents.push(`### \`${relativePath}\` (${result.totalLines} 行)\n\`\`\`${ext}\n${result.content}\n\`\`\``)
          } else {
            fileContents.push(`### \`${relativePath}\`\n⚠️ ${result.error || '读取失败'}`)
          }
        } catch {
          fileContents.push(`### \`${relativePath}\`\n⚠️ 读取异常`)
        }
      }
      if (fileContents.length > 0) {
        trimmed = trimmed.replace(/@([^\s@]+\.\w+)/g, '`$1`')
        trimmed = `${trimmed}\n\n📎 引用文件内容：\n${fileContents.join('\n\n')}`
      }
    }

    // 确保有当前会话
    let conversationId = state.currentConversationId
    let conversation = state.getCurrentConversation()
    if (!conversation) {
      conversationId = get().newConversation()
      conversation = get().conversations.find((c) => c.id === conversationId) ?? null
    }
    if (!conversation || !conversationId) {
      return
    }

    const settings = state.settings
    if (!settings) return

    // 前端预检 API Key，避免空 Key 导致请求卡死
    if (!settings.apiKey.trim()) {
      set({ error: '请先在设置中配置 API Key 后再发送消息。', isStreaming: false })
      return
    }

    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
      ...(options?.slashCommand ? { slashCommand: options.slashCommand } : {})
    }

    const isFirst = conversation.messages.length === 0
    const assistantMsgId = genId()
    const placeholderMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    }
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              title: isFirst ? makeTitle(trimmed) : c.title,
              messages: [...c.messages, userMsg, placeholderMsg],
              updatedAt: Date.now()
            }
          : c
      ),
      isStreaming: true,
      streamingContent: '',
      streamingReasoning: '',
      streamingSegments: [{ reasoning: '', content: '', toolCalls: [] }],
      streamingConversationId: conversationId,
      streamingAssistantId: assistantMsgId,
      streamingTokens: null,
      streamingCacheHitTokens: null,
      streamingCacheMissTokens: null,
      streamingPromptTokens: null,
      streamingContextTokens: null,
      error: null
    }))

    await runStream(get, set, conversationId)
  },

  regenerate: async () => {
    const state = get()
    if (state.isStreaming) return
    const conversation = state.getCurrentConversation()
    if (!conversation || conversation.messages.length === 0) return

    const msgs = [...conversation.messages]
    while (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
      msgs.pop()
    }
    if (msgs.length === 0) return

    const assistantMsgId = genId()
    const placeholderMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    }

    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversation.id ? { ...c, messages: [...msgs, placeholderMsg], updatedAt: Date.now() } : c
      ),
      isStreaming: true,
      streamingContent: '',
      streamingReasoning: '',
      streamingSegments: [{ reasoning: '', content: '', toolCalls: [] }],
      streamingConversationId: conversation.id,
      streamingAssistantId: assistantMsgId,
      streamingTokens: null,
      streamingCacheHitTokens: null,
      streamingCacheMissTokens: null,
      streamingPromptTokens: null,
      streamingContextTokens: null,
      error: null
    }))

    await runStream(get, set, conversation.id)
  },

  cancelStream: async () => {
    await window.api.chat.cancel()
    const state = get()
    const { streamingConversationId: convId, streamingContent, streamingAssistantId } = state
    const accumTotal = state.streamingTokens ?? 0
    const accumCacheHit = state.streamingCacheHitTokens ?? 0
    const accumCacheMiss = state.streamingCacheMissTokens ?? 0
    const accumPrompt = state.streamingPromptTokens ?? 0
    const streamContext = state.streamingContextTokens ?? 0
    const hasTokenData = accumTotal > 0
    // 计算持久化 segments（仅多轮时保留）
    const segs = state.streamingSegments
    const persistSegments = segs && segs.length > 1
      ? segs.filter(s => s.reasoning || s.content || s.toolCalls.length > 0).map(s => ({
          reasoning: s.reasoning,
          content: s.content,
          toolCalls: s.toolCalls.map(tc => ({ ...tc, status: 'done' as const }))
        }))
      : undefined
    if (convId && streamingContent && streamingAssistantId) {
      set((s) => buildPersistPatch(s, convId, {
        content: streamingContent,
        reasoningContent: state.streamingReasoning || undefined,
        segments: persistSegments,
        model: state.settings?.model,
        tokens: hasTokenData ? accumTotal : undefined,
        cacheHitTokens: accumCacheHit > 0 ? accumCacheHit : undefined
      }, hasTokenData ? { total: accumTotal, prompt: accumPrompt, cacheHit: accumCacheHit, cacheMiss: accumCacheMiss } : null, undefined, streamContext || undefined))
      void state._persist()
      return
    }
    set(STREAMING_RESET)
  },
})
