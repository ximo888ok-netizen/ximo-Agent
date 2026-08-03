// ====== 应用设置类型 ======

import type { ModelId, ReasoningEffort, FontSize } from './core'

export interface AppSettings {
  apiKey: string
  baseUrl: string
  model: ModelId
  thinkingMode: boolean
  /** 思考强度：off=关闭思考, high=高, max=最高, ultra=终极（工程范式+监督审查） */
  reasoningEffort: ReasoningEffort
  temperature: number
  maxTokens: number
  fontSize: FontSize
  customPrompt: string
  themeColor: string
  /** 明暗主题 */
  theme: 'dark' | 'light'
  /** 活跃的自定义主题包 ID（undefined = 使用默认主题） */
  activeThemePackId?: string
  /** YOLO 模式：关闭所有操作确认 */
  yoloMode?: boolean
  /** 最近打开的项目路径列表（coding 模式） */
  recentProjects?: string[]

  // ---- 主子 Agent 设置 ----
  /** 子 Agent 使用的模型（默认与主 Agent 相同） */
  subAgentModel?: ModelId
  /** 子 Agent 最大输出 token */
  subAgentMaxTokens?: number
  /** 子 Agent 温度 */
  subAgentTemperature?: number
  /** 子 Agent 超时秒数 */
  subAgentTimeout?: number
  /** 子 Agent 思考强度 */
  subAgentReasoningEffort?: ReasoningEffort
  /** 狂暴模式（编排模式下强制主 Agent 主动决策、不推诿） */
  orchestratorEnforce?: boolean
  /** 主 Agent 自定义提示词（注入系统提示词，定义主 Agent 的人格与行为） */
  mainAgentCustomPrompt?: string
  /** 主 Agent 注入的专家 ID（从 AI 专家库选择，将专家人格注入主 Agent） */
  mainAgentExpertId?: string

  // ---- Agent 循环与上下文管理 ----
  /** Agent Loop 最多连续调用工具次数，防止死循环 */
  maxToolRounds?: number
  /** 上下文窗口最大字符数估算 */
  maxContextChars?: number
  /** 工具结果最大字符数，超出则截断 */
  maxToolResultChars?: number
  /** 最近保护窗口：最近这么多条消息不会被压缩 */
  contextRecentKeep?: number
  /** snip 后保留的字符数 */
  contextSnippedKeep?: number
  /** prune 后保留的字符数 */
  contextPrunedKeep?: number

  // ---- 终端与代码执行 ----
  /** 终端命令默认超时（秒） */
  terminalTimeout?: number
  /** 代码执行默认超时（秒） */
  codeExecTimeout?: number
  /** 终端输出截断长度（字符数） */
  terminalOutputLimit?: number

  // ---- 浏览器自动化 ----
  /** 浏览器无头模式 */
  browserHeadless?: boolean
  /** 浏览器空闲超时（分钟） */
  browserIdleTimeout?: number
  /** 浏览器视口宽度 */
  browserViewportWidth?: number
  /** 浏览器视口高度 */
  browserViewportHeight?: number

  // ---- 联网搜索与网页抓取 ----
  /** 默认搜索引擎：bing / baidu / duckduckgo */
  defaultSearchEngine?: 'bing' | 'baidu' | 'duckduckgo'
  /** 搜索结果默认数量 */
  searchResultsCount?: number
  /** 网页抓取内容上限（字符数） */
  webFetchMaxLength?: number
  /** 网页缓存开关 */
  webCacheEnabled?: boolean
  /** 网页缓存最大大小（MB） */
  webCacheMaxSizeMB?: number

  // ---- 权限与自动化模式 ----
  /** Auto Mode 默认等级：off/safe/yolo */
  defaultAutoModeLevel?: 'off' | 'safe' | 'yolo'
  /** 联网搜索默认状态 */
  defaultNetworkSearchOn?: boolean
  /** 检查点自动快照开关 */
  checkpointEnabled?: boolean
  /** 长期记忆开关 — 关闭后 Agent 感知不到 memory_update 工具，记忆也不会注入系统提示词 */
  memoryEnabled?: boolean

  // ---- 桌面操控 ----
  /** pi-computer-use Helper 命令超时（秒） */
  helperCommandTimeout?: number

  // ---- 网络抓包 ----
  /** 抓包最大请求数 */
  maxCapturedRequests?: number

  // ---- MCP 集成 ----
  /** MCP 服务器连接超时（秒） */
  mcpConnectTimeout?: number

  // ---- 开屏动画 ----
  /** 开屏动画总开关 */
  startupAnimationEnabled?: boolean
  /** 开屏文字（默认 ximo-Agent） */
  startupText?: string
  /** 开屏文字大小 */
  startupTextSize?: number
  /** 开屏文字描边时长（ms） */
  startupStrokeDuration?: number
  /** 开屏文字字体（系统字体名或 CSS font-family 值） */
  startupFontFamily?: string
  /** 爆发转场开关 */
  burstTransitionEnabled?: boolean
  /** 转场样式：rose(玫瑰花瓣) / fireworks(烟花) / confetti(彩纸) / fade(淡入) / aura(光环) / lightfall(光瀑) / custom(自定义) */
  burstTransitionStyle?: 'rose' | 'fireworks' | 'confetti' | 'fade' | 'aura' | 'lightfall' | 'custom'
  /** 转场粒子数量 */
  burstParticleCount?: number
  /** 转场时长（ms） */
  burstDuration?: number
  /** 转场配色主题：rose / ocean / gold / aurora */
  burstColorTheme?: 'rose' | 'ocean' | 'gold' | 'aurora'
  /** 自定义转场动画文件（JSON 字符串），当 burstTransitionStyle 为 'custom' 时使用 */
  customTransitionAnimation?: string

  // ---- 视觉模型（Agnes 2.5 Flash）----
  /** 视觉模型 API Key（Agent 的"眼睛"，用于图像理解） */
  visionApiKey?: string
  /** 视觉模型 Base URL */
  visionBaseUrl?: string
  /** 视觉模型名称 */
  visionModel?: string

  // ---- GPU 硬件加速 ----
  /** GPU 硬件加速开关（优先调用独显，无独显则调用核显） */
  gpuAcceleration?: boolean

  // ---- 可视化主题编辑器 ----
  /** 自定义主题变量（浅色模式），键为 CSS 变量名如 --theme-color */
  customThemeVarsLight?: Record<string, string>
  /** 自定义主题变量（深色模式） */
  customThemeVarsDark?: Record<string, string>
  /** 自定义主题编辑器开关（关闭则不注入任何自定义变量） */
  customThemeEnabled?: boolean
  /** 自定义 CSS 注入（追加到全局样式末尾，最高优先级） */
  customCss?: string

  // ---- 背景图 ----
  /** 背景图配置 */
  backgroundImage?: BackgroundImageConfig
}

/** 背景图配置 */
export interface BackgroundImageConfig {
  /** 背景类型：none=无, static=静态图片, dynamic=动态视频/GIF */
  type: 'none' | 'static' | 'dynamic'
  /** 文件路径（本地绝对路径，由主进程导入到 userData） */
  path?: string
  /** 不透明度 0~1 */
  opacity?: number
  /** 模糊半径（px） */
  blur?: number
  /** 缩放模式 */
  fit?: 'cover' | 'contain' | 'center' | 'tile'
}
