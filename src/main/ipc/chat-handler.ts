import { ipcMain } from 'electron'
import { streamChat, agentLoop, testConnection, configureAgentLoop } from '@main/deepseek'
import { resolveActiveProvider } from '@main/deepseek/provider'
import type { ChatRequest, StreamChunk, ToolContext, ApiMessage } from '@shared/types'
import { loadSettings } from '@main/store'
import { toolRegistry } from '@main/tools'
import { modeToolNames, ensureModeToolsLoaded } from '@main/tools/lazy-registry'
import { normalizeToolSchemas } from '@shared/cache'
import { getMcpSession } from './mcp-session'
import { buildEnvInfo } from './env-info'
import { withTimeout, CONFIRM_TIMEOUT_MS, USER_INPUT_TIMEOUT_MS } from './chat-utils'
import { registerEnhancePromptHandler } from './enhance-prompt-handler'

// 当前流式请求的 AbortController（用于取消）
let currentController: AbortController | null = null

export function registerChatHandlers(): void {
  // 流式聊天：渲染进程通过 invoke 触发，主进程逐块通过 send 回传
  ipcMain.handle('chat:start', async (event, request: ChatRequest) => {
    const settings = await loadSettings()
    const provider = resolveActiveProvider(settings, request.providerId)
    const controller = new AbortController()
    currentController = controller
    const streamSignal = controller.signal

    const win = event.sender

    const handlers = {
      signal: streamSignal,
      yoloMode: settings.yoloMode,
      autoModeLevel: request.autoModeLevel ?? (settings.yoloMode ? 'yolo' : 'off'),
      onChunk: (chunk: StreamChunk) => {
        if (!win.isDestroyed()) {
          win.send('chat:chunk', chunk)
        }
      },
      requestConfirmation: (settings.yoloMode || (request.autoModeLevel === 'yolo')) ? undefined : async (toolName: string, message: string): Promise<boolean> => {
        if (win.isDestroyed()) return false
        win.send('confirm:request', { toolName, message })
        return withTimeout(
          new Promise<boolean>((resolve) => {
            let settled = false
            const finish = (result: boolean): void => {
              if (settled) return
              settled = true
              ipcMain.removeListener('confirm:response', listener)
              win.removeListener('closed' as never, onClosed as never)
              streamSignal.removeEventListener('abort', onAbort)
              resolve(result)
            }
            const listener = (_event: Electron.IpcMainEvent, result: boolean): void => {
              finish(result)
            }
            const onClosed = (): void => finish(false)
            const onAbort = (): void => finish(false)
            ipcMain.once('confirm:response', listener)
            win.once('closed' as never, onClosed as never)
            streamSignal.addEventListener('abort', onAbort, { once: true })
          }),
          CONFIRM_TIMEOUT_MS,
          false
        )
      },
      requestUserInput: async (type: 'ask' | 'review', title: string, content: string): Promise<{ confirmed: boolean; response?: string }> => {
        if (win.isDestroyed()) return { confirmed: false }
        win.send('user-input:request', { type, title, content } as const)
        return withTimeout(
          new Promise<{ confirmed: boolean; response?: string }>((resolve) => {
            let settled = false
            const finish = (result: { confirmed: boolean; response?: string }): void => {
              if (settled) return
              settled = true
              ipcMain.removeListener('user-input:response', listener)
              win.removeListener('closed' as never, onClosed as never)
              streamSignal.removeEventListener('abort', onAbort)
              resolve(result)
            }
            const listener = (_event: Electron.IpcMainEvent, result: { confirmed: boolean; response?: string }): void => {
              finish(result)
            }
            const onClosed = (): void => finish({ confirmed: false })
            const onAbort = (): void => finish({ confirmed: false, response: '请求已取消' })
            ipcMain.once('user-input:response', listener)
            win.once('closed' as never, onClosed as never)
            streamSignal.addEventListener('abort', onAbort, { once: true })
          }),
          USER_INPUT_TIMEOUT_MS,
          { confirmed: false, response: '等待用户输入超时' }
        )
      }
    }

    await ensureModeToolsLoaded(request.mode)
    let toolNames = modeToolNames[request.mode] || []

    configureAgentLoop({
      maxToolRounds: settings.maxToolRounds ?? 30,
      maxToolResultChars: settings.maxToolResultChars ?? 8000,
      maxContextChars: settings.maxContextChars ?? 300000,
      recentKeep: settings.contextRecentKeep ?? 5,
      snippedKeep: settings.contextSnippedKeep ?? 200,
      prunedKeep: settings.contextPrunedKeep ?? 80,
      checkpointEnabled: settings.checkpointEnabled ?? true,
      contextWindow: provider.contextWindow,
      capabilities: provider.capabilities
    })

    const { setDefaultCommandTimeout } = await import('@main/tools/ComputerUse/PiBridge')
    setDefaultCommandTimeout(settings.helperCommandTimeout ?? 30)

    const { configureCacheManager } = await import('@main/tools/WebIntelligence/WebCacheManager')
    configureCacheManager({
      enabled: settings.webCacheEnabled ?? true,
      maxSizeMB: settings.webCacheMaxSizeMB ?? 100
    })

    if (toolNames.includes('find_roots')) {
      const { piBridge } = await import('@main/tools/ComputerUse/PiBridge')
      if (!piBridge.ready) {
        const COMPUTER_USE_TOOLS = new Set(['find_roots', 'observe_ui', 'search_ui', 'act_ui', 'read_text', 'wait_for'])
        toolNames = toolNames.filter((n) => !COMPUTER_USE_TOOLS.has(n))
      }
    }

    if (settings.memoryEnabled === false) {
      toolNames = toolNames.filter((n) => n !== 'memory_update')
    }

    const modeTools = toolNames.length > 0 ? toolRegistry.getByNames(toolNames).map((t) => t.definition) : undefined

    const mcpSession = await getMcpSession((settings.mcpConnectTimeout ?? 30) * 1000)
    const mcpToolDefs = mcpSession.getToolDefinitions()

    const allTools = [...(modeTools || []), ...mcpToolDefs]
    const sortedTools = allTools.length > 0 ? normalizeToolSchemas(allTools) : allTools

    const envInfo = buildEnvInfo()
    const messagesWithEnv: ApiMessage[] = [
      request.messages[0],
      { role: 'system', content: envInfo },
      ...request.messages.slice(1)
    ]

    try {
      const effRequest: ChatRequest = {
        ...request,
        messages: messagesWithEnv,
        tools: sortedTools,
        thinkingMode: request.thinkingMode && provider.capabilities.sendReasoningParams,
        maxTokens: provider.isDeepSeek ? request.maxTokens : Math.min(request.maxTokens, provider.maxOutputTokens)
      }

      if (allTools.length > 0) {
        const toolContext: ToolContext = {
          apiKey: provider.apiKey,
          baseUrl: provider.baseUrl,
          model: request.model,
          reasoningEffort: request.reasoningEffort,
          subAgentModel: settings.subAgentModel ?? settings.model,
          subAgentMaxTokens: 393216,
          subAgentTemperature: settings.subAgentTemperature ?? 0.7,
          subAgentTimeout: settings.subAgentTimeout ?? 60,
          subAgentReasoningEffort: settings.subAgentReasoningEffort ?? 'high',
          terminalTimeout: settings.terminalTimeout ?? 60,
          codeExecTimeout: settings.codeExecTimeout ?? 60,
          terminalOutputLimit: settings.terminalOutputLimit ?? 50000,
          browserHeadless: settings.browserHeadless ?? true,
          browserIdleTimeout: settings.browserIdleTimeout ?? 5,
          browserViewportWidth: settings.browserViewportWidth ?? 1280,
          browserViewportHeight: settings.browserViewportHeight ?? 800,
          defaultSearchEngine: settings.defaultSearchEngine ?? 'bing',
          searchResultsCount: settings.searchResultsCount ?? 5,
          webFetchMaxLength: settings.webFetchMaxLength ?? 5000,
          webCacheEnabled: settings.webCacheEnabled ?? true,
          webCacheMaxSizeMB: settings.webCacheMaxSizeMB ?? 100,
          helperCommandTimeout: settings.helperCommandTimeout ?? 30,
          mcpConnectTimeout: settings.mcpConnectTimeout ?? 30,
          visionApiKey: settings.visionApiKey ?? 'sk-qeSAXtALEYUpoGzpOFtGQwpgCV4kmvv2lKak57q6PKF1Zj9m',
          visionBaseUrl: settings.visionBaseUrl ?? 'https://api.agnes-ai.cn/v1',
          visionModel: settings.visionModel ?? 'agnes-2.5-flash',
          mode: request.mode,
          requestUserInput: handlers.requestUserInput
        }
        await agentLoop(provider.apiKey, provider.baseUrl, effRequest, handlers, toolContext, request.sessionId)
      } else {
        await streamChat(provider.apiKey, provider.baseUrl, effRequest, handlers, provider.capabilities)
      }
    } finally {
      // MCP 连接保持复用，不在此断开

      // 清理 currentController — 必须在 finally 中执行，
      // 否则 agentLoop/streamChat 抛出异常时 currentController 悬空，
      // 后续 chat:cancel 会 abort 一个已完成的过期控制器
      if (currentController === controller) {
        currentController = null
      }
    }
  })

  // 连接测试
  ipcMain.handle('chat:test', async (_event, apiKey: string, baseUrl: string, model: string, providerId?: string) => {
    if (providerId) {
      const settings = await loadSettings()
      const provider = resolveActiveProvider(settings, providerId)
      const cfgModels = (settings.providers ?? []).find((p) => p.id === providerId)?.models ?? []
      const testModel = model || cfgModels[0] || 'gpt-4o-mini'
      return testConnection(provider.apiKey, provider.baseUrl, testModel)
    }
    return testConnection(apiKey, baseUrl, model)
  })

  // 自动获取模型列表
  ipcMain.handle('providers:list-models', async (_event, baseUrl: string, apiKey: string) => {
    if (!baseUrl || !baseUrl.trim()) {
      return { success: false, models: [] as string[], error: '请先填写 Base URL' }
    }
    const url = `${baseUrl.trim().replace(/\/$/, '')}/models`
    try {
      const response = await fetch(url, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(15_000)
      })
      if (!response.ok) {
        return { success: false, models: [], error: `获取失败 (${response.status})：请检查 Base URL 与 API Key` }
      }
      const data = await response.json()
      const list: string[] = Array.isArray(data?.data)
        ? data.data
            .map((m: { id?: unknown }) => (typeof m?.id === 'string' ? m.id : ''))
            .filter(Boolean)
        : []
      list.sort()
      return { success: true, models: list, error: list.length === 0 ? '该端点未返回模型列表，请手动填写' : undefined }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { success: false, models: [], error: `网络错误：${msg}` }
    }
  })

  // 取消当前流式请求
  ipcMain.handle('chat:cancel', () => {
    if (currentController) {
      currentController.abort()
      currentController = null
    }
  })

  // 提示词增强（拆分到独立模块）
  registerEnhancePromptHandler()
}
