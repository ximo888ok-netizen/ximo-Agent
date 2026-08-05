// ====== 应用设置类型 ======

import type { ModelId, ReasoningEffort, FontSize } from './core'

/**
 * 自定义模型服务商配置（OpenAI 兼容协议）。
 * 内置 DeepSeek 服务商 id 固定为 'deepseek'，其数据载体是顶层 apiKey/baseUrl/model 字段，
 * 不出现在 providers 列表中。
 */
export interface ProviderConfig {
  /** 服务商唯一 ID（创建时生成，不可变） */
  id: string
  /** 显示名称 */
  name: string
  /** OpenAI 兼容 Base URL（如 https://api.openai.com/v1） */
  baseUrl: string
  /** API Key */
  apiKey: string
  /** 用户预设的可用模型名列表 */
  models: string[]
  /** 上下文窗口大小（tokens），缺省 131072 */
  contextWindowTokens?: number
  /** 单次最大输出 token，缺省 8192 */
  maxOutputTokens?: number
  /** 是否发送 thinking/reasoning 专属参数（enable_thinking/reasoning_effort），默认 true */
  sendReasoningParams?: boolean
  /** 是否发送 stream_options.include_usage，默认 true */
  sendStreamUsage?: boolean
}

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

  // ---- 模型服务商 ----
  /** 自定义服务商列表（OpenAI 兼容协议） */
  providers?: ProviderConfig[]
  /** 当前活跃服务商 ID：'deepseek'=内置，其余对应 providers 中的条目 */
  activeProviderId?: string

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
  /** 规划轮开关 — 开启后复杂任务先跑一次规划阶段（多一次 API 往返，换取工具选择更精准） */
  planningEnabled?: boolean
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

  // ---- 鼠标特效（跟随 + 点击）----
  /** 鼠标特效总开关 */
  cursorEffectsEnabled?: boolean
  /** 鼠标跟随特效样式：'none' | 'trail' | 'sparkle' | 'firefly' | 'glow' | 'aurora' | 'comet' | 'rainbow' */
  cursorTrailStyle?: CursorTrailStyle
  /** 鼠标点击特效样式：'none' | 'ripple' | 'ring' | 'burst' | 'heart' | 'star' | 'pixel' | 'flower' */
  cursorClickStyle?: CursorClickStyle
  /** 鼠标特效颜色（留空 = 跟随主题色） */
  cursorEffectColor?: string
  /** 特效尺寸缩放（0.5 ~ 2.0） */
  cursorEffectScale?: number
  /** 特效强度（生成频率，0.2 ~ 3.0） */
  cursorEffectIntensity?: number
  /** 跟随特效尾部数量（6 ~ 40） */
  cursorTrailCount?: number
  /** 点击特效粒子数量（6 ~ 40） */
  cursorClickCount?: number
  /** 特效生存时长（ms，400 ~ 3000） */
  cursorEffectDuration?: number
}

/** 鼠标跟随特效样式 */
export type CursorTrailStyle =
  | 'none'
  // 基础粒子
  | 'trail'      // 经典渐隐尾迹
  | 'sparkle'    // 星光点点
  | 'firefly'    // 萤火虫
  | 'glow'       // 光晕拖尾
  | 'aurora'     // 极光流光
  | 'comet'      // 彗星拖尾
  | 'rainbow'    // 彩虹粒子
  // 自然元素
  | 'snowflake'  // 雪花飘落
  | 'leaf'       // 落叶飘舞
  | 'butterfly'  // 蝴蝶纷飞
  | 'sakura'     // 樱花雨
  | 'bubble'     // 泡泡上升
  | 'droplet'    // 水滴下落
  | 'ember'      // 火星上浮
  | 'clover'     // 四叶草
  // 符号图形
  | 'diamond'    // 菱形闪烁
  | 'star4'      // 四角星
  | 'cross'      // 十字星
  | 'halo'       // 光环波纹
  | 'energy'     // 能量球
  | 'ringdots'   // 环绕圆点
  | 'note'       // 音符跳跃
  | 'moon'       // 月牙

/** 鼠标点击特效样式 */
export type CursorClickStyle =
  | 'none'
  // 波纹环状
  | 'ripple'     // 同心涟漪
  | 'ring'       // 扩散圆环
  | 'shockwave'  // 冲击波
  | 'orbit'      // 环绕轨道
  | 'wormhole'   // 虫洞旋涡
  // 粒子爆发
  | 'burst'      // 放射爆裂
  | 'pixel'      // 像素方块
  | 'flower'     // 花瓣绽放
  | 'firework'   // 烟花绽放
  | 'confetti'   // 彩带喷射
  | 'snow'       // 雪花爆开
  | 'gem'        // 宝石迸发
  | 'spark'      // 电光四溅
  | 'cube'       // 魔方爆散
  | 'laser'      // 激光放射
  | 'golden'     // 金色雨滴
  // 单体元素
  | 'heart'      // 爱心气泡
  | 'star'       // 星芒
  | 'crown'      // 皇冠升起
  | 'lightning'  // 闪电
  | 'splash'     // 水花四溅
  | 'water'      // 水波纹

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
