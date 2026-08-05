import { ipcMain, BrowserWindow } from 'electron'
import { streamChat, agentLoop, testConnection, configureAgentLoop, callDeepSeekStream } from '@main/deepseek'
import { resolveActiveProvider } from '@main/deepseek/provider'
import type { ChatRequest, StreamChunk, ToolContext, ApiMessage } from '@shared/types'
import { loadSettings } from '@main/store'
import { toolRegistry } from '@main/tools'
import { modeToolNames, ensureModeToolsLoaded } from '@main/tools/lazy-registry'
import { normalizeToolSchemas } from '@shared/cache'
import * as os from 'os'

// 当前流式请求的 AbortController（用于取消）
let currentController: AbortController | null = null

// ── 弹窗等待超时 ──
// requestConfirmation / requestUserInput 若渲染层无人响应（弹窗被遮挡、组件未挂载、渲染进程异常等），
// 无超时会导致 Agent Loop 永久挂起。以下超时兜底保证循环必然恢复。
const CONFIRM_TIMEOUT_MS = 60_000
const USER_INPUT_TIMEOUT_MS = 120_000

/** Promise.race 超时包装 — 超时返回 defaultValue，避免 Promise 永不 resolve */
function withTimeout<T>(promise: Promise<T>, ms: number, defaultValue: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(defaultValue), ms)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

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
    // 解析活跃服务商 — 内置 deepseek 用顶层 apiKey/baseUrl（行为不变），
    // 自定义服务商从 settings.providers 读取，DeepSeek 专属参数由能力开关门控
    const provider = resolveActiveProvider(settings, request.providerId)
    // 每个请求独立 AbortController — 修复全局单例竞态：
    // 旧请求的 signal 引用被保留在闭包中，不会被新请求覆盖或误 abort
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
        // 60s 无响应自动按「拒绝」处理 + 监听取消信号 — 彻底避免弹窗无人响应导致 Agent Loop 永久挂起
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
        // 120s 无响应自动按「拒绝」处理 — 防止 plan_ask / spec_review 弹窗无人响应导致挂起
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

    // 根据模式注入工具定义 — 按需懒加载该模式所需的工具模块
    await ensureModeToolsLoaded(request.mode)
    let toolNames = modeToolNames[request.mode] || []

    // 注入 Agent 循环配置（从 settings 读取）+ 当前服务商的上下文窗口与能力开关
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
      // 生效请求 — 非 reasoning 服务商强制关闭 thinking；自定义服务商钳制输出长度
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
          visionApiKey: settings.visionApiKey ?? 'sk-qeSAXtALEYUpoGzpOFtGQwpgCV4kmvv2lKak57q6PKF1Zj9m', // 免费视觉模型，无需理会
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
    }

    // 仅当仍持有当前 controller 时才清理 — 防止误清掉新请求的引用
    if (currentController === controller) {
      currentController = null
    }
  })

  // 连接测试 — 支持指定服务商 ID（providerId 优先，其次用显式参数，兼容旧调用）
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

  // 自动获取模型列表 — OpenAI 兼容 GET /models，免手填
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

  // 提示词增强 — 轻量级 LLM 调用，无 Agent Loop / 无工具
  ipcMain.handle('chat:enhance-prompt', async (_event, data: {
    text: string
    mode: string
    recentContext?: string
    projectPath?: string
  }): Promise<{ success: boolean; enhancedText?: string; error?: string }> => {
    const settings = await loadSettings()
    // 提示词增强跟随当前活跃服务商；模型：内置用 settings.model，自定义用其首个预设模型
    const provider = resolveActiveProvider(settings)
    if (!provider.apiKey) {
      return { success: false, error: '未配置 API Key' }
    }
    const enhanceModel = provider.isDeepSeek
      ? settings.model
      : ((settings.providers ?? []).find((p) => p.id === provider.id)?.models[0] ?? settings.model)

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
        provider.apiKey,
        provider.baseUrl,
        enhanceModel,
        messages,
        undefined, // 无工具
        false,    // 无思考模式
        'high',
        0.7,
        8192,
        { onChunk: () => {}, signal: undefined },
        provider.capabilities
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
