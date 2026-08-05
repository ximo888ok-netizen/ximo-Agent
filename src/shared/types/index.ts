// 主进程与渲染进程共享的类型定义
// 按域拆分子文件，此文件作为统一入口 barrel re-export

export type { Mode, ModelId, ReasoningEffort, FontSize } from './core'

export type {
  ToolParamProperty, ToolDefinition, ToolCall, ToolResult,
  PermissionLevel, ToolContext
} from './tools'

export type {
  ChatMessage, Conversation, ApiMessage, ChatRequest, StreamChunk, StreamingSegment
} from './messaging'

export type {
  AppSettings, BackgroundImageConfig, ProviderConfig,
  CursorTrailStyle, CursorClickStyle
} from './settings'

export type {
  SkillStep, Skill, RecordingSession, ImportedSkill
} from './skills'

export type { AgentDivision, AgentExpert } from './experts'

export type { CapturedRequest, RecordedEvent } from './network'

export type {
  ModeConfig, QuickAction, ActionGroup, ConversationTemplate,
  TestResult, FileTreeNode, ComponentMeta, StyleEntry
} from './ui'

export type { ParticleVarRange, TransitionAnimationFile } from './transition'

export type { McpTransport, McpServerConfig } from './mcp'
