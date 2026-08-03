import type {
  AppSettings,
  ChatMessage,
  Conversation,
  Mode,
  Skill,
  RecordingSession,
  CapturedRequest,
  ImportedSkill,
  StreamingSegment
} from '@shared/types'

/** UI 组件元数据 — 镜像 catalog 中的结构 */
export interface ComponentMeta {
  id: string
  name: string
  nameCn: string
  category: string
  categoryCn: string
  dependencies: string[]
  props: string[]
  files: { jsx: string; css: string | null; assets: string[] | null }
}

/** Agent 任务列表项 — 镜像 TodoWriteTool 的 TodoItem */
export interface AgentTodo {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
  level?: number
  assignee?: string
}

/** 自由画布上的组件项 */
export interface CanvasItem {
  id: string
  componentId: string
  componentName: string
  componentNameCn: string
  category: string
  dependencies: string[]
  x: number   // px 相对于画布容器
  y: number   // px
  width: number
  height: number
  zIndex: number
}

/** 流式工具调用条目 */
export interface StreamingToolCall {
  name: string
  status: 'thinking' | 'calling' | 'done'
  args?: string
  result?: string
  toolCallId?: string
}

export interface StoreState {
  // ---- 数据 ----
  settings: AppSettings | null
  conversations: Conversation[]
  currentMode: Mode
  currentConversationId: string | null
  /** 每个模式各自追踪当前会话 ID，切换模式时自动切换 */
  currentConversationIds: Record<Mode, string | null>
  isStreaming: boolean
  streamingContent: string
  streamingReasoning: string
  /** 流式工作步骤（按时间顺序，每轮 Agent Loop 一个 segment） */
  streamingSegments: StreamingSegment[]
  streamingConversationId: string | null
  streamingTokens: number | null
  /** 流式期间累积缓存命中 token */
  streamingCacheHitTokens: number | null
  /** D1 流式期间累积缓存未命中 token — 不随压缩重置 */
  streamingCacheMissTokens: number | null
  /** 流式期间累积 prompt token */
  streamingPromptTokens: number | null
  /** 流式期间上下文占用 — 最近一轮 API 调用的 promptTokens */
  streamingContextTokens: number | null
  /** 当前正在执行的工具调用列表 */
  streamingToolCalls: StreamingToolCall[]
  /** 流式回复中 assistant 占位消息的 ID（预插入 conversations，流式期间原地更新） */
  streamingAssistantId: string | null
  showSettings: boolean
  error: string | null

  /** 联网搜索开关 — 开启后 sendMessage 会注入联网提示 */
  networkSearchOn: boolean
  /** Auto Mode 等级：off（手动确认）、safe（仅读操作自动）、yolo（全部自动） */
  autoModeLevel: 'off' | 'safe' | 'yolo'
  /** 当前工作目录/项目路径（从当前会话的 projectPath 派生） */
  projectPath: string
  /** 附加文件列表（文件路径） */
  attachedFiles: string[]
  /** 粘贴的截图路径（任务结束后询问是否删除） */
  pastedImagePaths: string[]

  /** AI 专家库面板是否显示 */
  showAgentPanel: boolean
  /** 记忆面板是否显示 */
  showMemoryPanel: boolean
  /** 知识库面板是否显示 */
  showKnowledgePanel: boolean
  /** 已激活的专家 ID 列表 */
  activeExperts: string[]

  /** 设计模式：已绑定的设计风格 ID（从 151 个风格库中选择） */
  activeStyleId: string | null

  /** 设计模式：已选择的 UI 组件 ID 列表（从 139 个组件库中多选） */
  selectedComponentIds: string[]

  /** 设计模式：自由画布上的组件项 */
  canvasItems: CanvasItem[]
  /** 设计模式：画布绑定的风格 ID */
  canvasStyleId: string | null
  /** 设计模式：画布选定的场景 (website/app/desktop/miniprogram) */
  canvasScenario: string | null

  /** 消息编辑草稿 — 编辑用户消息时回填到输入框 */
  pendingDraft: { text: string; slashCommand?: { cmd: string; systemHint: string } } | null
  /** Token 统计面板是否显示 */
  showTokenStats: boolean

  /** 技能列表 */
  skills: Skill[]
  /** 是否正在录制技能 */
  isRecordingSkill: boolean
  /** 当前录制会话信息 */
  recordingSession: RecordingSession | null

  // ---- 内嵌浏览器 & 工具后台状态 ----
  browserOpen: boolean
  browserUrl: string
  isBrowserRecording: boolean
  computerUseRunning: boolean
  capturedRequests: CapturedRequest[]

  // ---- Agent 任务列表 ----
  agentTodosByConv: Record<string, AgentTodo[]>
  taskListCollapsedByConv: Record<string, boolean>

  // ---- 内部 ----
  _persist: () => Promise<void>

  // ---- 初始化 ----
  init: () => Promise<void>

  // ---- 设置 ----
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>
  setShowSettings: (show: boolean) => void

  // ---- 模式 ----
  setMode: (mode: Mode) => void

  // ---- 会话 ----
  newConversation: (mode?: Mode) => string | null
  selectConversation: (id: string) => void
  deleteConversation: (id: string) => void
  renameConversation: (id: string, title: string) => void
  clearAllConversations: () => void

  // ---- 聊天 ----
  sendMessage: (text: string, options?: { skipNetworkHint?: boolean; expertIds?: string[]; slashCommand?: { cmd: string; systemHint: string } }) => Promise<void>
  regenerate: () => Promise<void>
  cancelStream: () => Promise<void>

  // ---- 辅助 ----
  getCurrentConversation: () => Conversation | null
  setNetworkSearchOn: (on: boolean) => void
  setAutoModeLevel: (level: 'off' | 'safe' | 'yolo') => void
  setProjectPath: (path: string) => void
  addAttachedFile: (path: string) => void
  removeAttachedFile: (path: string) => void
  clearAttachedFiles: () => void
  addPastedImage: (path: string) => void
  clearPastedImages: () => void
  reloadConversations: () => Promise<void>
  openProject: () => Promise<void>

  // ---- 技能 ----
  loadSkills: () => Promise<void>
  startRecordingSkill: (url?: string) => Promise<void>
  stopRecordingSkill: () => Promise<void>
  refreshRecordingStatus: () => Promise<void>
  deleteSkill: (id: string) => Promise<void>

  // ---- 内嵌浏览器 & 工具后台 ----
  toggleBrowser: () => void
  setBrowserUrl: (url: string) => void
  toggleBrowserRecording: () => void
  toggleComputerUse: () => Promise<void>
  refreshCapturedRequests: () => Promise<void>
  clearCapturedRequests: () => Promise<void>
  refreshComputerUseStatus: () => Promise<void>

  // ---- AI 专家库 ----
  setShowAgentPanel: (show: boolean) => void
  setShowMemoryPanel: (show: boolean) => void
  setShowKnowledgePanel: (show: boolean) => void
  toggleExpert: (expertId: string) => void

  // ---- 设计风格绑定 ----
  setActiveStyleId: (id: string | null) => void

  // ---- UI 组件选择 ----
  toggleComponent: (id: string) => void
  clearSelectedComponents: () => void

  // ---- 自由画布 ----
  addCanvasItem: (item: Omit<CanvasItem, 'id' | 'zIndex'>) => void
  updateCanvasItem: (id: string, updates: Partial<CanvasItem>) => void
  removeCanvasItem: (id: string) => void
  clearCanvas: () => void
  setCanvasStyle: (id: string | null) => void
  setCanvasScenario: (scenario: string | null) => void
  applyLayout: (items: Array<{ componentId: string; x: number; y: number; w: number; h: number }>) => void
  sendCanvasToAgent: () => Promise<void>

  // ---- Agent 任务列表 ----
  toggleTaskListCollapsed: () => void
  restoreAgentTodos: () => void
  /** 流式结束后：将残留的 in_progress 标记为 completed，防止转圈不止 */
  markTodosComplete: () => void

  // ---- 消息编辑 ----
  editMessage: (messageId: string) => void
  clearDraft: () => void

  // ---- Token 统计 ----
  setShowTokenStats: (show: boolean) => void

  // ---- 项目折叠 ----
  collapsedProjects: Record<string, boolean>
  toggleProjectCollapsed: (projectPath: string) => void
  newConversationForProject: (projectPath: string, mode?: Mode) => string | null
  removeProject: (projectPath: string) => void
}
