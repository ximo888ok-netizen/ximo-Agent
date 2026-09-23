// ── Transcript Item 类型 — 扁平化的会话条目 ──────────────────────────────
// 参考 DeepSeek-Reasonix 的 Item 联合类型，适配我们的 ChatMessage 数据模型

export type ToolStatus = 'running' | 'done' | 'error' | 'stopped'

export type TranscriptItem =
  | {
      kind: 'user'
      id: string
      text: string
      timestamp?: number
      slashCommand?: { cmd: string; systemHint: string }
    }
  | {
      kind: 'assistant'
      id: string
      text: string
      reasoning: string
      streaming: boolean
      reasoningComplete?: boolean
      reasoningDurationMs?: number
      model?: string
      /**
       * 只作为「流式正文的挂载点」存在，不接收 live 的 reasoning。
       *
       * 走有序事件流渲染时（推理与工具已按真实顺序交错输出），还会额外放一个
       * id === streamingAssistantId 的空项，用来承接 `live.text`（正文）；
       * 但它不能再吃 `live.reasoning` —— 那会把整段推理在末尾**重复渲染一遍**。
       */
      liveTextOnly?: boolean
    }
  | {
      kind: 'phase'
      id: string
      text: string
    }
  | {
      kind: 'notice'
      id: string
      level: 'info' | 'warn'
      text: string
      detail?: string
      title?: string
    }
  | {
      kind: 'compaction'
      id: string
      pending: boolean
      trigger: string
      messages: number
      summary: string
    }
  | {
      kind: 'tool'
      id: string
      name: string
      args: string
      readOnly: boolean
      status: ToolStatus
      output?: string
      error?: string
      durationMs?: number
      summary?: string
      isShell?: boolean
      argChars?: number
    }

export type UserItem = Extract<TranscriptItem, { kind: 'user' }>
export type AssistantItem = Extract<TranscriptItem, { kind: 'assistant' }>
export type ToolItem = Extract<TranscriptItem, { kind: 'tool' }>
export type NoticeItem = Extract<TranscriptItem, { kind: 'notice' }>
export type PhaseItem = Extract<TranscriptItem, { kind: 'phase' }>
export type CompactionItem = Extract<TranscriptItem, { kind: 'compaction' }>

// ── 流式数据 ──────────────────────────────────────────────────────────
export interface LiveStream {
  id: string
  text: string
  reasoning: string
  reasoningComplete: boolean
  reasoningStartedAt?: number
  reasoningCompletedAt?: number
}

// ── 轮次分组 ──────────────────────────────────────────────────────────
export interface TurnGroup {
  userItem: UserItem
  assistantPreview: string
  toolCount: number
  startIdx: number
  endIdx: number
}

export interface QuestionAnchor {
  id: string
  text: string
  turn: number
}

// ── 温层状态 ──────────────────────────────────────────────────────────
export interface WarmLayerState {
  sessionKey: string
  expandedWarmTurns: ReadonlySet<number>
  coldPage: number
}

// ── 工具分类 ──────────────────────────────────────────────────────────
export type ToolGroupKind = 'explore' | 'modify' | 'delegate' | 'shell'

const SHELL_TOOLS = new Set(['terminal_exec', 'bash', 'bash_output'])
const EXPLORE_TOOLS = new Set(['file_read', 'file_list', 'file_search', 'web_fetch', 'web_search', 'web_research', 'project_context', 'code_index'])
const MODIFY_TOOLS = new Set(['file_write', 'file_edit', 'multi_edit', 'move_file', 'file_delete'])
const DELEGATE_TOOLS = new Set(['task', 'run_skill', 'explore', 'research', 'review'])

export function toolGroupKind(item: ToolItem): ToolGroupKind | null {
  if (SHELL_TOOLS.has(item.name)) return 'shell'
  if (EXPLORE_TOOLS.has(item.name)) return 'explore'
  if (MODIFY_TOOLS.has(item.name)) return 'modify'
  if (DELEGATE_TOOLS.has(item.name)) return 'delegate'
  return item.readOnly ? 'explore' : 'modify'
}

export function isReadOnlyTool(name: string): boolean {
  return EXPLORE_TOOLS.has(name)
}

export function isCreationGroupableTool(item: ToolItem): boolean {
  return item.status !== 'running' && toolGroupKind(item) !== null
}
