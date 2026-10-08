// ====== cockpit-link 协议 — 驾驶舱（Electron App）↔ ximo-OS 主机（agent-hostd）======
//
// 契约全文见 docs/ximo-os/PROTOCOL.md。类型下沉到 shared 的目的：主进程 HostClient、
// 渲染层远程主机面板、主机端 server 三方共用一份定义，字段漂移立即被 typecheck 拦住。
// 版本策略：字段只增不改；新增 `t` 类型时 version +1，旧消息不得删除或改义。

/** 主机协议版本 — 驾驶舱按 hello.version 决定兼容性 */
export const HOST_VERSION = 1

// ---------- 驾驶舱 → 主机 ----------

export interface TaskDispatchMsg {
  t: 'task.dispatch'
  /** 驾驶舱生成的任务 id（幂等键）；也可不填由主机生成 */
  id?: string
  task: string
  /** 权限模式，缺省用主机配置 */
  mode?: string
}

export interface TaskCancelMsg { t: 'task.cancel'; id: string }

export interface ApprovalRespondMsg { t: 'approval.respond'; reqId: string; allow: boolean }

export interface PingMsg { t: 'ping' }

export type ClientMsg = TaskDispatchMsg | TaskCancelMsg | ApprovalRespondMsg | PingMsg
  | DesktopRequestMsg

// ---------- 主机 → 驾驶舱 ----------

export interface HelloMsg {
  t: 'hello'
  version: number
  name: string
  /** 主机支持的桌面动作清单（能力协商；驾驶舱据此降级而非靠断连发现） */
  actions?: DesktopAction[]
}

export interface TaskAcceptedMsg { t: 'task.accepted'; id: string }

export interface TaskStatusMsg {
  t: 'task.status'
  id: string
  stage: 'queued' | 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled'
}

/** 任务增量事件 — 主机侧 runner 产出，随 task.chunk 传输 */
export type RunnerEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; argsSummary: string }
  | { type: 'tool_result'; name: string; content: string; success: boolean }

export type TaskChunkDelta = RunnerEvent

export interface TaskChunkMsg {
  t: 'task.chunk'
  id: string
  seq: number
  delta: TaskChunkDelta
}

export interface ApprovalRequestMsg {
  t: 'approval.request'
  reqId: string
  id: string
  tool: string
  summary: string
}

export interface TaskDoneMsg {
  t: 'task.done'
  id: string
  status: 'completed' | 'failed' | 'cancelled'
  result: string
  error?: string
}

export interface ErrorMsg { t: 'error'; code: string; message: string }

export interface PongMsg { t: 'pong' }

export type HostMsg = HelloMsg | TaskAcceptedMsg | TaskStatusMsg | TaskChunkMsg
  | ApprovalRequestMsg | TaskDoneMsg | ErrorMsg | PongMsg | DesktopReplyMsg | DesktopEventMsg

// ---------- desktop-bus（阶段 2，协议 v1 增量）----------
// 桌面本体是 API 总线（headless-first）：窗口/应用是结构化数据，GUI 只是渲染端之一。
// 驾驶舱与主机侧 Agent 共用同一总线 —— 这是「同一办公任务纯 API 零截图完成」的地基。

/** 合法动作集合 — 协议校验与 hello 能力列表的单一来源。
 *  DesktopAction 类型从本数组派生：新增动作只需加进数组（忘加 = 类型不存在，
 *  typecheck 立即红），「union 与数组漂移 → 运行时拒绝合法动作」在结构上不可能发生。 */
export const DESKTOP_ACTIONS = [
  'window.list',   // 结构化窗口树（按进程分组）
  'window.op',     // activate/close/move/resize/minimize/maximize/restore
  'app.launch',    // 启动应用（脱离会话常驻）
  'app.list',      // 运行中的应用（按进程聚合窗口）
  'app.available', // 可启动的应用清单（扫描 .desktop 条目，避免猜应用名）
  'key',           // 按键（如 "ctrl+s"、"Return"）
  'type',          // 输入文本到聚焦窗口
  'active',        // 当前聚焦窗口
  'mouse.move',    // 移动鼠标（x,y）
  'mouse.click',   // 点击（x,y,button）
  'mouse.scroll',  // 滚动（direction: up/down/left/right, amount）
  'screen.size',   // 屏幕几何（width/height，交互坐标映射用）
  'clipboard.read',  // 读剪贴板（读取 GUI 应用内容的最快通路，零截图）
  'clipboard.write', // 写剪贴板（text：随后用 key ctrl+v 粘到目标应用）
  'screen.snapshot', // 单帧截图（base64 data URL）— 纯 API 不够用时的兜底感知
] as const

/** 桌面动作类型 — 由 DESKTOP_ACTIONS 数组派生（单一来源，勿手写 union） */
export type DesktopAction = (typeof DESKTOP_ACTIONS)[number]

/** 可启动应用条目 — app.available 的数据形态（来自 .desktop 条目） */
export interface DesktopAppEntry {
  /** 可执行命令名（app.launch 的 app 参数直接用这个） */
  exec: string
  name: string
  comment?: string
}

/** 屏幕几何 — screen.size 响应 */
export interface DesktopScreenSize {
  width: number
  height: number
}

export interface DesktopRequestMsg {
  t: 'desktop.request'
  reqId: string
  action: DesktopAction
  params?: Record<string, unknown>
}

export interface DesktopReplyMsg {
  t: 'desktop.reply'
  reqId: string
  ok: boolean
  data?: unknown
  error?: string
}

export interface DesktopEventMsg {
  t: 'desktop.event'
  kind: 'window' | 'app'
  /** 变化后的完整快照（窗口列表 / 应用列表），消费方无需自维护增量 */
  data: unknown
}

/** 结构化窗口条目 — window.list 与 desktop.event 的数据形态 */
export interface DesktopWindow {
  /** X 窗口 id，形如 0x03c00007 */
  id: string
  pid: number
  /** 进程名（/proc/<pid>/comm），空串表示未知 */
  app: string
  title: string
  x: number
  y: number
  w: number
  h: number
}

// ---------- REST 查询通道 ----------

/** 主机任务记录 — REST /api/tasks 与 WS 增量共同描述同一实体 */
export interface HostTaskRecord {
  id: string
  task: string
  status: 'queued' | 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled'
  chunks: RunnerEvent[]
  result: string
  error?: string
  createdAt: number
  finishedAt?: number
}

/** GET /api/health 响应 */
export interface HostHealth {
  ok: boolean
  name?: string
  version?: number
  mode?: string
  /** 桌面栈状态（阶段 B）— CI 冒烟据此断言 X 会话在位 */
  desktop?: { enabled: boolean; display: string }
  /** 沙箱模式（阶段 D5）— 'uid'=每任务专用系统用户；'process'=仅进程隔离（能力降级） */
  sandbox?: { mode: 'uid' | 'process'; pool: number; reason?: string }
  error?: string
}

/** GET /api/screen/snapshot 响应 — 画面流不可用时的兜底渲染源 */
export interface HostScreenSnapshot {
  ok: boolean
  screenshot?: string
  error?: string
}

// ---------- 驾驶舱侧连接状态 ----------

export type HostStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface HostStatusInfo {
  status: HostStatus
  /** 连接目标地址（脱敏后，不含令牌） */
  url: string
  /** 最近一次失败原因 */
  error?: string
}
