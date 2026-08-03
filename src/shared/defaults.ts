import type { AppSettings } from './types'

/**
 * 应用默认设置 — 主进程与渲染进程共用的单一数据源。
 *
 * 主进程 `src/main/constants.ts` re-export 此常量，
 * 渲染进程 `shared-components.tsx` 以此作为 `FALLBACK_SETTINGS`。
 * 修改默认值只需改这一处。
 */
export const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-v4-pro',
  thinkingMode: true,
  reasoningEffort: 'high',
  temperature: 0.7,
  maxTokens: 393216,
  fontSize: 'md',
  customPrompt: '',
  themeColor: '#6366f1',
  theme: 'dark',
  activeThemePackId: undefined,
  yoloMode: false,
  recentProjects: [],

  // ---- 主子 Agent 设置 ----
  subAgentModel: 'deepseek-v4-flash',
  subAgentMaxTokens: 393216,
  subAgentTemperature: 0.7,
  subAgentTimeout: 60,
  subAgentReasoningEffort: 'high',
  orchestratorEnforce: true,
  mainAgentCustomPrompt: '',
  mainAgentExpertId: undefined,

  // ---- Agent 循环与上下文管理 ----
  maxToolRounds: 30,
  maxContextChars: 300000,
  maxToolResultChars: 8000,
  contextRecentKeep: 5,
  contextSnippedKeep: 200,
  contextPrunedKeep: 80,

  // ---- 终端与代码执行 ----
  terminalTimeout: 60,
  codeExecTimeout: 60,
  terminalOutputLimit: 50000,

  // ---- 浏览器自动化 ----
  browserHeadless: true,
  browserIdleTimeout: 5,
  browserViewportWidth: 1280,
  browserViewportHeight: 800,

  // ---- 联网搜索与网页抓取 ----
  defaultSearchEngine: 'bing',
  searchResultsCount: 5,
  webFetchMaxLength: 5000,
  webCacheEnabled: true,
  webCacheMaxSizeMB: 100,

  // ---- 权限与自动化模式 ----
  defaultAutoModeLevel: 'off',
  defaultNetworkSearchOn: false,
  checkpointEnabled: true,
  memoryEnabled: true,

  // ---- 桌面操控 ----
  helperCommandTimeout: 30,

  // ---- 网络抓包 ----
  maxCapturedRequests: 500,

  // ---- MCP 集成 ----
  mcpConnectTimeout: 30,

  // ---- 视觉模型（Agnes 2.5 Flash）----
  // 注意：此为免费视觉模型，API Key 无需理会，不涉及安全问题
  visionApiKey: 'sk-qeSAXtALEYUpoGzpOFtGQwpgCV4kmvv2lKak57q6PKF1Zj9m',
  visionBaseUrl: 'https://api.agnes-ai.cn/v1',
  visionModel: 'agnes-2.5-flash',

  // ---- GPU 硬件加速 ----
  gpuAcceleration: true,

  // ---- 可视化主题编辑器 ----
  customThemeVarsLight: undefined,
  customThemeVarsDark: undefined,
  customThemeEnabled: false,
  customCss: '',

  // ---- 背景图 ----
  backgroundImage: { type: 'none' },

  // ---- 开屏动画 ----
  startupAnimationEnabled: true,
  startupText: 'ximo-Agent',
  startupTextSize: 76,
  startupStrokeDuration: 460,
  startupFontFamily: "'Dancing Script', cursive",
  burstTransitionEnabled: true,
  burstTransitionStyle: 'rose',
  burstParticleCount: 120,
  burstDuration: 2500,
  burstColorTheme: 'rose',
  customTransitionAnimation: undefined
}
