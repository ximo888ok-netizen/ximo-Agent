import { ipcMain } from 'electron'
import { streamChat, agentLoop, testConnection, configureAgentLoop } from '@main/deepseek'
import { resolveActiveProvider } from '@main/deepseek/provider'
import type { ChatRequest, StreamChunk, ToolContext, ApiMessage, AutoModeLevel } from '@shared/types'
import { loadSettings } from '@main/store'
import { toolRegistry } from '@main/tools'
import { modeToolNames, ensureModeToolsLoaded } from '@main/tools/lazy-registry'
import { normalizeToolSchemas } from '@shared/cache'
import { getMcpSession } from './mcp-session'
import { buildEnvInfo } from './env-info'
import { withTimeout, CONFIRM_TIMEOUT_MS, USER_INPUT_TIMEOUT_MS } from './chat-utils'
import { registerEnhancePromptHandler } from './enhance-prompt-handler'
import { setAllowedWriteRoots } from '@main/security-guard'
import { clearRejectedCache } from '@main/deepseek/tool-permissions'

// 多会话并行流式 — 每个会话有独立的 AbortController
const sessionControllers = new Map<string, AbortController>()
// 非会话请求（无 sessionId）的 fallback controller
let defaultController: AbortController | null = null

export function registerChatHandlers(): void {
  // 流式聊天：渲染进程通过 invoke 触发，主进程逐块通过 send 回传
  ipcMain.handle('chat:start', async (event, request: ChatRequest) => {
    // 清空审批拒绝缓存 — 新会话/新请求重新询问
    clearRejectedCache()
    const settings = await loadSettings()
    const provider = resolveActiveProvider(settings, request.providerId)
    const controller = new AbortController()
    const streamSignal = controller.signal

    // 注册 controller — 支持多会话并行
    if (request.sessionId) {
      sessionControllers.set(request.sessionId, controller)
    } else {
      defaultController = controller
    }

    const win = event.sender

    /*
     * Auto Mode 等级 —— 权限判定的**唯一权威**。
     *
     * 这里刻意不再读 `settings.yoloMode`：它是历史遗留的布尔镜像，
     * 只在通过输入框切换时会同步写入；从设置页改档位时不会写它。
     * 于是出现过「设置页选了手动审批，但 yoloMode 仍是 true，确认链路被跳过」
     * 这种选项看着生效、实际不生效的情况。等级本身没有这个歧义。
     */
    const autoModeLevel: AutoModeLevel =
      request.autoModeLevel ?? settings.defaultAutoModeLevel ?? 'off'
    const autoApproveAll = autoModeLevel === 'yolo'

    const handlers = {
      signal: streamSignal,
      // 派生值 —— tool-permissions 读它，但来源只有一个
      yoloMode: autoApproveAll,
      autoModeLevel,
      onChunk: (chunk: StreamChunk) => {
        if (!win.isDestroyed()) {
          win.send('chat:chunk', chunk)
        }
      },
      requestConfirmation: autoApproveAll ? undefined : async (toolName: string, message: string): Promise<boolean> => {
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

    // 环境信息（写入保护 + 消息注入共用）
    const envInfo = buildEnvInfo()

    // 写入保护 — 注入允许写入的根目录
    const writeRoots: string[] = []
    const cwdMatch = envInfo.match(/工作目录[::]\s*(.+)/)
    if (cwdMatch && cwdMatch[1].trim()) {
      writeRoots.push(cwdMatch[1].trim())
    }
    const recentProjects = settings.recentProjects ?? []
    for (const p of recentProjects) {
      if (p && !writeRoots.includes(p)) writeRoots.push(p)
    }
    setAllowedWriteRoots(writeRoots)

    configureAgentLoop({
      maxToolRounds: settings.maxToolRounds ?? 30,
      maxToolResultChars: settings.maxToolResultChars ?? 8000,
      maxContextChars: settings.maxContextChars ?? 300000,
      recentKeep: settings.contextRecentKeep ?? 5,
      snippedKeep: settings.contextSnippedKeep ?? 200,
      prunedKeep: settings.contextPrunedKeep ?? 80,
      checkpointEnabled: settings.checkpointEnabled ?? true,
      contextWindow: provider.contextWindow,
      capabilities: provider.capabilities,
      compactionRatio: Math.max(0.5, Math.min(0.95, settings.contextCompactionRatio ?? 0.8))
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

      // 清理 controller — 必须在 finally 中执行，
      // 否则 agentLoop/streamChat 抛出异常时 controller 悬空
      if (request.sessionId) {
        if (sessionControllers.get(request.sessionId) === controller) {
          sessionControllers.delete(request.sessionId)
        }
      } else {
        if (defaultController === controller) {
          defaultController = null
        }
      }

      // 任务完成通知 — 窗口不在焦点时推送系统通知
      const win = event.sender
      if (!win.isDestroyed() && !win.isFocused()) {
        try {
          const { Notification } = await import('electron')
          if (Notification.isSupported()) {
            const notif = new Notification({
              title: 'XimoAgent · 任务完成',
              body: 'AI 已完成任务，点击查看结果',
              silent: false
            })
            notif.on('click', () => {
              if (!win.isDestroyed()) {
                win.focus()
              }
            })
            notif.show()
          }
        } catch {
          // Notification 不可用时静默失败
        }
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

  // 取消流式请求 — 支持按会话 ID 取消（多会话并行）
  ipcMain.handle('chat:cancel', (_event, sessionId?: string) => {
    if (sessionId) {
      const controller = sessionControllers.get(sessionId)
      if (controller) {
        controller.abort()
        sessionControllers.delete(sessionId)
      }
    } else {
      // 无 sessionId — 取消默认 controller
      if (defaultController) {
        defaultController.abort()
        defaultController = null
      }
    }
  })

  // 提示词增强（拆分到独立模块）
  registerEnhancePromptHandler()
}
