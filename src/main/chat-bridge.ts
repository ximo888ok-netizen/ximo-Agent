import { BrowserWindow, ipcMain } from 'electron'
import { streamChat, agentLoop, testConnection, configureAgentLoop } from './deepseek'
import type { ToolContext, ChatRequest, StreamChunk, TestResult } from '@shared/types'
import { loadSettings } from './store'
import { toolRegistry } from './tools'
import { modeToolNames, ensureModeToolsLoaded } from './tools/lazy-registry'

// 当前流式请求的 AbortController（用于取消）
let currentController: AbortController | null = null

/** 构建 ToolContext，从 settings 中提取所有工具配置 */
function buildToolContext(settings: Awaited<ReturnType<typeof loadSettings>>, request: ChatRequest): ToolContext {
  return {
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
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
    webFetchMaxLength: settings.webFetchMaxLength ?? 10000,
    webCacheEnabled: settings.webCacheEnabled ?? true,
    webCacheMaxSizeMB: settings.webCacheMaxSizeMB ?? 100,
    helperCommandTimeout: settings.helperCommandTimeout ?? 30,
    mcpConnectTimeout: settings.mcpConnectTimeout ?? 30
  }
}

/** 注册聊天相关的 IPC handler（chat:start / chat:test / chat:cancel） */
export function registerChatHandlers(): void {
  // 流式聊天：渲染进程通过 invoke 触发，主进程逐块通过 send 回传
  ipcMain.handle('chat:start', async (event, request: ChatRequest) => {
    const settings = await loadSettings()
    currentController = new AbortController()

    const win = event.sender

    const handlers = {
      signal: currentController.signal,
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
        return new Promise<boolean>((resolve) => {
          let settled = false
          const finish = (result: boolean): void => {
            if (settled) return
            settled = true
            ipcMain.removeListener('confirm:response', listener)
            win.removeListener('closed' as never, onClosed as never)
            resolve(result)
          }
          const listener = (_event: Electron.IpcMainEvent, result: boolean): void => {
            finish(result)
          }
          const onClosed = (): void => finish(false)
          ipcMain.on('confirm:response', listener)
          win.once('closed' as never, onClosed as never)
        })
      }
    }

    // 根据模式注入工具定义 — 按需懒加载该模式所需的工具模块
    await ensureModeToolsLoaded(request.mode)
    let toolNames = modeToolNames[request.mode] || []

    // 注入 Agent 循环配置（从 settings 读取）
    configureAgentLoop({
      maxToolRounds: settings.maxToolRounds ?? 30,
      maxToolResultChars: settings.maxToolResultChars ?? 16000,
      maxContextChars: settings.maxContextChars ?? 300000,
      recentKeep: settings.contextRecentKeep ?? 8,
      snippedKeep: settings.contextSnippedKeep ?? 200,
      prunedKeep: settings.contextPrunedKeep ?? 80,
      checkpointEnabled: settings.checkpointEnabled ?? true
    })

    // 注入 PiBridge 命令超时
    const { setDefaultCommandTimeout } = await import('./tools/ComputerUse/PiBridge')
    setDefaultCommandTimeout(settings.helperCommandTimeout ?? 30)

    // 注入网页缓存配置
    const { configureCacheManager } = await import('./tools/WebIntelligence/WebCacheManager')
    configureCacheManager({
      enabled: settings.webCacheEnabled ?? true,
      maxSizeMB: settings.webCacheMaxSizeMB ?? 100
    })

    // 操控电脑未启动时，从工具列表中移除桌面操控工具 — Agent 完全感知不到
    if (toolNames.includes('find_roots')) {
      const { piBridge } = await import('./tools/ComputerUse/PiBridge')
      if (!piBridge.ready) {
        const COMPUTER_USE_TOOLS = new Set(['find_roots', 'observe_ui', 'search_ui', 'act_ui', 'read_text', 'wait_for'])
        toolNames = toolNames.filter((n) => !COMPUTER_USE_TOOLS.has(n))
      }
    }

    const modeTools = toolNames.length > 0 ? toolRegistry.getByNames(toolNames).map((t) => t.definition) : undefined

    // 连接所有启用的 MCP 服务器，收集其工具
    const { McpSession } = await import('./tools/Mcp/McpClient')
    const mcpSession = new McpSession((settings.mcpConnectTimeout ?? 30) * 1000)
    const mcpResult = await mcpSession.connectAll()
    if (mcpResult.errors.length > 0) {
      console.warn('[MCP] 部分服务器连接失败:', mcpResult.errors)
    }

    // 将 MCP 工具动态注册到 toolRegistry
    const mcpTools = mcpSession.getTools()
    for (const tool of mcpTools) {
      if (!toolRegistry.has(tool.definition.name)) {
        toolRegistry.register(tool)
      }
    }
    const mcpToolDefs = mcpSession.getToolDefinitions()

    // 合并模式工具 + MCP 工具
    const allTools = [...(modeTools || []), ...mcpToolDefs]

    try {
      if (allTools.length > 0) {
        const toolContext = buildToolContext(settings, request)
        await agentLoop(settings.apiKey, settings.baseUrl, { ...request, tools: allTools }, handlers, toolContext, request.sessionId)
      } else {
        await streamChat(settings.apiKey, settings.baseUrl, request, handlers)
      }
    } finally {
      // 会话结束后断开所有 MCP 连接
      await mcpSession.disconnectAll()
    }

    currentController = null
  })

  // 连接测试
  ipcMain.handle('chat:test', async (_event, apiKey: string, baseUrl: string, model: string): Promise<TestResult> => {
    return testConnection(apiKey, baseUrl, model)
  })

  // 取消当前流式请求
  ipcMain.handle('chat:cancel', () => {
    if (currentController) {
      currentController.abort()
      currentController = null
    }
  })

}
