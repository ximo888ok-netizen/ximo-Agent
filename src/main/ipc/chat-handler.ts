import { ipcMain, BrowserWindow } from 'electron'
import { streamChat, agentLoop, testConnection, configureAgentLoop, callDeepSeekStream } from '@main/deepseek'
import type { ChatRequest, StreamChunk, ToolContext, ApiMessage } from '@shared/types'
import { loadSettings } from '@main/store'
import { toolRegistry } from '@main/tools'
import { modeToolNames, ensureModeToolsLoaded } from '@main/tools/lazy-registry'
import { normalizeToolSchemas } from '@shared/cache'
import * as os from 'os'

// 当前流式请求的 AbortController（用于取消）
let currentController: AbortController | null = null

// ── MCP 全局单例 ──
// 避免每次 chat:start 都重新连接所有 MCP 服务器（减少连接延迟和开销）
let _mcpSession: import('@main/tools/Mcp/McpClient').McpSession | null = null
let _mcpConnected = false

async function getMcpSession(timeoutMs: number): Promise<import('@main/tools/Mcp/McpClient').McpSession> {
  const { McpSession } = await import('@main/tools/Mcp/McpClient')
  if (!_mcpSession) {
    _mcpSession = new McpSession(timeoutMs)
    _mcpConnected = false
  }
  if (!_mcpConnected) {
    const result = await _mcpSession.connectAll()
    if (result.errors.length > 0) {
      console.warn('[MCP] 部分服务器连接失败:', result.errors)
    }
    _mcpConnected = true
    // 将 MCP 工具动态注册到 toolRegistry
    for (const tool of _mcpSession.getTools()) {
      if (!toolRegistry.has(tool.definition.name)) {
        toolRegistry.register(tool)
      }
    }
  }
  return _mcpSession
}

/** MCP 设置变更时调用，强制下次重连 */
export function invalidateMcpSession(): void {
  if (_mcpSession) {
    _mcpSession.disconnectAll().catch(() => {})
    _mcpSession = null
    _mcpConnected = false
  }
}

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
          ipcMain.once('confirm:response', listener)
          win.once('closed' as never, onClosed as never)
        })
      },
      requestUserInput: async (type: 'ask' | 'review', title: string, content: string): Promise<{ confirmed: boolean; response?: string }> => {
        if (win.isDestroyed()) return { confirmed: false }
        win.send('user-input:request', { type, title, content } as const)
        return new Promise<{ confirmed: boolean; response?: string }>((resolve) => {
          let settled = false
          const finish = (result: { confirmed: boolean; response?: string }): void => {
            if (settled) return
            settled = true
            ipcMain.removeListener('user-input:response', listener)
            win.removeListener('closed' as never, onClosed as never)
            resolve(result)
          }
          const listener = (_event: Electron.IpcMainEvent, result: { confirmed: boolean; response?: string }): void => {
            finish(result)
          }
          const onClosed = (): void => finish({ confirmed: false })
          ipcMain.once('user-input:response', listener)
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
      maxToolResultChars: settings.maxToolResultChars ?? 8000,
      maxContextChars: settings.maxContextChars ?? 300000,
      recentKeep: settings.contextRecentKeep ?? 5,
      snippedKeep: settings.contextSnippedKeep ?? 200,
      prunedKeep: settings.contextPrunedKeep ?? 80,
      checkpointEnabled: settings.checkpointEnabled ?? true
    })

    // 注入 PiBridge 命令超时
    const { setDefaultCommandTimeout } = await import('@main/tools/ComputerUse/PiBridge')
    setDefaultCommandTimeout(settings.helperCommandTimeout ?? 30)

    // 注入网页缓存配置
    const { configureCacheManager } = await import('@main/tools/WebIntelligence/WebCacheManager')
    configureCacheManager({
      enabled: settings.webCacheEnabled ?? true,
      maxSizeMB: settings.webCacheMaxSizeMB ?? 100
    })

    // 操控电脑未启动时，从工具列表中移除桌面操控工具 — Agent 完全感知不到
    if (toolNames.includes('find_roots')) {
      const { piBridge } = await import('@main/tools/ComputerUse/PiBridge')
      if (!piBridge.ready) {
        const COMPUTER_USE_TOOLS = new Set(['find_roots', 'observe_ui', 'search_ui', 'act_ui', 'read_text', 'wait_for'])
        toolNames = toolNames.filter((n) => !COMPUTER_USE_TOOLS.has(n))
      }
    }

    // 长期记忆关闭时，从工具列表中移除 memory_update — Agent 完全感知不到记忆功能
    if (settings.memoryEnabled === false) {
      toolNames = toolNames.filter((n) => n !== 'memory_update')
    }

    const modeTools = toolNames.length > 0 ? toolRegistry.getByNames(toolNames).map((t) => t.definition) : undefined

    // 连接所有启用的 MCP 服务器（全局单例，避免每次重连）
    const mcpSession = await getMcpSession((settings.mcpConnectTimeout ?? 30) * 1000)
    const mcpToolDefs = mcpSession.getToolDefinitions()

    // 合并模式工具 + MCP 工具
    const allTools = [...(modeTools || []), ...mcpToolDefs]

    // A4 工具 schema 字典序归一化排序 — 保持 tools JSON 字节稳定，避免破坏缓存前缀
    const sortedTools = allTools.length > 0 ? normalizeToolSchemas(allTools) : allTools

    // 注入运行环境信息 — 插入到 system prompt 之后、对话历史之前，作为稳定前缀的一部分
    // 环境信息使用日期（不含秒级时间戳），确保同一会话内前缀稳定，缓存命中率最大化
    const envInfo = buildEnvInfo()
    const messagesWithEnv: ApiMessage[] = [
      request.messages[0],  // system prompt
      { role: 'system', content: envInfo },  // 环境信息（稳定前缀）
      ...request.messages.slice(1)  // runtime_status + memory + 对话历史
    ]

    try {
      if (allTools.length > 0) {
        const toolContext: ToolContext = {
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
          webFetchMaxLength: settings.webFetchMaxLength ?? 5000,
          webCacheEnabled: settings.webCacheEnabled ?? true,
          webCacheMaxSizeMB: settings.webCacheMaxSizeMB ?? 100,
          helperCommandTimeout: settings.helperCommandTimeout ?? 30,
          mcpConnectTimeout: settings.mcpConnectTimeout ?? 30,
          visionApiKey: settings.visionApiKey ?? 'sk-qeSAXtALEYUpoGzpOFtGQwpgCV4kmvv2lKak57q6PKF1Zj9m', // 免费视觉模型，无需理会
          visionBaseUrl: settings.visionBaseUrl ?? 'https://api.agnes-ai.cn/v1',
          visionModel: settings.visionModel ?? 'agnes-2.5-flash',
          mode: request.mode,
          requestUserInput: handlers.requestUserInput
        }
        await agentLoop(settings.apiKey, settings.baseUrl, { ...request, messages: messagesWithEnv, tools: sortedTools }, handlers, toolContext, request.sessionId)
      } else {
        await streamChat(settings.apiKey, settings.baseUrl, { ...request, messages: messagesWithEnv }, handlers)
      }
    } finally {
      // MCP 连接保持复用，不在此断开
    }

    currentController = null
  })

  // 连接测试
  ipcMain.handle('chat:test', async (_event, apiKey: string, baseUrl: string, model: string) => {
    return testConnection(apiKey, baseUrl, model)
  })

  // 取消当前流式请求
  ipcMain.handle('chat:cancel', () => {
    if (currentController) {
      currentController.abort()
      currentController = null
    }
  })

  // 提示词增强 — 轻量级 LLM 调用，无 Agent Loop / 无工具
  ipcMain.handle('chat:enhance-prompt', async (_event, data: {
    text: string
    mode: string
    recentContext?: string
    projectPath?: string
  }): Promise<{ success: boolean; enhancedText?: string; error?: string }> => {
    const settings = await loadSettings()
    if (!settings.apiKey) {
      return { success: false, error: '未配置 API Key' }
    }

    const modeLabels: Record<string, string> = {
      office: '办公模式（文档撰写、邮件、会议纪要、搜索研究）',
      coding: '编程模式（代码生成、审查、调试、重构、测试）',
      design: '设计模式（UI 生成、设计审查、架构设计、组件库）',
    }
    const modeLabel = modeLabels[data.mode] || data.mode

    let systemPrompt = `你是一个提示词增强助手。用户当前处于「${modeLabel}」下工作。
请将用户的原始提示词增强为更清晰、更具体、更结构化的版本，使其能更准确地传达用户意图。

增强原则：
1. 补充必要的上下文和约束条件
2. 明确预期输出格式（如 Markdown 表格、代码块、列表等）
3. 如果用户的提示词太简短，根据当前模式补充合理的隐含需求
4. 保持用户原始意图不变，不要添加用户没提到的功能
5. 输出语言与用户输入语言一致

只输出增强后的提示词本身，不要加任何解释、前缀或引号。`

    if (data.recentContext) {
      systemPrompt += `\n\n## 当前会话上下文（用于理解用户意图）\n${data.recentContext}`
    }
    if (data.projectPath) {
      systemPrompt += `\n\n## 当前项目路径\n${data.projectPath}`
    }

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: data.text },
    ]

    try {
      const result = await callDeepSeekStream(
        settings.apiKey,
        settings.baseUrl,
        settings.model,
        messages,
        undefined, // 无工具
        false,    // 无思考模式
        'high',
        0.7,
        8192,
        { onChunk: () => {}, signal: undefined }
      )

      if (result.finishReason === 'error') {
        return { success: false, error: result.error || 'LLM 调用失败' }
      }

      // 优先使用 content；思考模型可能只产出 reasoningContent，回退使用
      let enhancedText = result.content.trim()
      if (!enhancedText && result.reasoningContent) {
        enhancedText = result.reasoningContent.trim()
      }
      if (!enhancedText) {
        return { success: false, error: 'LLM 返回空内容' }
      }

      // finishReason === 'length' 表示因 max_tokens 截断
      if (result.finishReason === 'length') {
        enhancedText += '\n\n<!-- ⚠️ 增强结果因 token 上限被截断 -->'
      }

      return { success: true, enhancedText }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  })
}

/**
 * 构建运行环境信息字符串 — 注入为 system 消息（前缀位置），让 Agent 知道 OS、Shell 等。
 * 仅包含日期（不含时分秒），确保同一会话内前缀稳定，不破坏 prompt 缓存。
 * Agent 如需精确时间可用 terminal_exec 执行 date 命令。
 */

// 缓存静态部分 — OS/Shell/CPU/内存等在同一进程内不变，避免每次请求重复调用 os API
const _envStatic = (() => {
  const isWin = process.platform === 'win32'
  const isMac = process.platform === 'darwin'
  const platformName = isWin ? 'Windows' : isMac ? 'macOS' : 'Linux'
  const shellName = isWin ? 'PowerShell' : isMac ? 'zsh' : 'bash'
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const lines: string[] = [
    `💻 操作系统：${platformName} ${process.arch}`,
    `🔧 终端 Shell：${shellName}${isWin ? '（PowerShell 语法，如 $env:PATH）' : '（Bash 语法）'}`,
    `📦 Node.js：${process.version}`,
    `👤 用户：${os.userInfo().username}@${os.hostname()}`,
    `🧠 CPU 核心：${os.cpus().length}　💾 内存：${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB`,
  ]
  const pathHint = isWin
    ? 'Windows 路径用反斜杠 \\(如 C:\\Users\\xxx)'
    : 'Unix 路径用正斜杠 /(如 /home/xxx)'
  return { tz, isWin, lines, pathHint }
})()

function buildEnvInfo(): string {
  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const weekday = weekdays[now.getDay()]

  const dateLine = `⏰ 当前日期：${dateStr} 星期${weekday} (${_envStatic.tz})`
  return `--- 运行环境 ---\n${dateLine}\n${_envStatic.lines.join('\n')}\n\n⚠️ 请基于以上信息使用正确的命令语法和路径格式（${_envStatic.pathHint}）。联网搜索时，上述日期即为"今天"，搜索最新信息时无需再询问用户当前日期。如需精确时间可用 terminal_exec 执行 date 命令。`
}
