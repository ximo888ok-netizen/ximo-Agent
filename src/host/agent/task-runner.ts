/**
 * task-runner v1 — 复用主应用 agent-loop（ximo-OS 阶段 0.5）
 *
 * 与 v0 的差异：Agent 循环、权限审批、上下文压缩、规划轮全部来自主应用
 * deepseek 层（已确认零 electron 依赖）；工具域从主应用可移植模块组加载
 * （file_system / terminal / git / web_intelligence / memory / skill），
 * Windows 专属域（Browser/ComputerUse/VirtualDesktop/AgentWorkspace）不上主机。
 *
 * 隔离模型（阶段 0 形态，阶段 3 升级为按任务用户/沙箱）：
 * - 任务串行执行，进程 cwd 切到任务工作区（文件工具的相对路径语义）
 * - security-guard 写白名单锁死工作区
 * - electron 以 shim 替身提供（store/paths 的 app.getPath 指向主机数据目录）
 */
import '../electron-shim'
import { agentLoop } from '../../main/deepseek/agent-loop'
import { ensureModuleGroupsLoaded } from '../../main/tools/lazy-registry'
export { ensureModuleGroupsLoaded }
import { toolRegistry } from '../../main/tools/ToolRegistry'
export { toolRegistry }
import { setAllowedWriteRoots } from '../../main/security-guard'
import { loadSettings, saveSettings } from '../../main/store'
import { evaluate, getConfigForMode } from '../../main/Permission'
import { DesktopBusTool } from '../tools/desktop-tool'
import { OfficeDocsTool } from '../tools/office-docs-tool'
import { BrowserTool } from '../tools/browser-tool'
import { HOST_TOOL_GROUPS, HOST_TOOL_NAMES } from './tool-inventory'
import type { DesktopBus } from '../desktop/bus'
import type { ApiMessage, AppSettings, ChatRequest, ModelId, Mode, StreamChunk, ToolContext, RunnerEvent } from '../../shared/types'

// 事件类型与 cockpit-link 契约同源（@shared/types/cockpit），驾驶舱 HostClient 直接消费
export type { RunnerEvent }
// 清单本体在 tool-inventory（纯数据模块，对账测试直接消费）— 此处 re-export 保持导入方零改动
export { HOST_TOOL_GROUPS, HOST_TOOL_NAMES }

export interface TaskInput {
  id: string
  task: string
  mode: string
  workspace: string
  baseUrl: string
  apiKey: string
  model: string
  /** 桌面 API 总线 — 提供时注册 desktop 工具（阶段 2 纯 API 零截图路径） */
  desktopBus?: DesktopBus
  signal: AbortSignal
  onEvent: (e: RunnerEvent) => void
  /** ask 类工具的审批回调（server 侧实现超时与广播） */
  approval: (tool: string, summary: string) => Promise<boolean>
}

export interface TaskOutput {
  status: 'completed' | 'failed' | 'cancelled'
  result: string
  error?: string
}

/** 权限矩阵启动自检（铁门槛⑥）— 主机无人值守：未匹配清单的工具 = 显式拒绝 */
/** 权限矩阵快照（纯函数，供自检脚本与启动日志共用）—
 *  返回每工具的工具级决策与「是否有显式规则」（subject 级规则也算覆盖）。 */
export function buildPermissionMatrix(toolNames: string[], mode: string): {
  mode: string
  total: number
  rows: { name: string; decision: string; hasRule: boolean }[]
  noRule: string[]
} {
  const config = { ...getConfigForMode(mode), defaultDecision: 'deny' as const }
  const rules = [...config.allow, ...config.ask, ...config.deny]
  const rows = toolNames.map((name) => {
    const mine = rules.filter((r) => r.tool === name)
    const subjectOnly = mine.length > 0 && mine.every((r) => r.subject !== undefined)
    // decision 是工具级（subject=''）评估 — subject 级规则覆盖的工具级显示为 deny/默认，
    // 实显示「subject」标注以免误读为不可用（实际以调用时 extractSubject 的评估为准）
    return {
      name,
      decision: subjectOnly ? 'subject' : evaluate(config, name, ''),
      hasRule: mine.length > 0,
    }
  })
  return { mode, total: toolNames.length, rows, noRule: rows.filter((r) => !r.hasRule).map((r) => r.name) }
}

function logPermissionMatrix(toolNames: string[], mode: string): void {
  const m = buildPermissionMatrix(toolNames, mode)
  console.log(`[task-runner] 权限矩阵（mode=${mode}，default=deny 显式注入）:`)
  for (const r of m.rows) console.log(`[task-runner]   ${r.decision.padEnd(5)} ${r.hasRule ? '' : '⚠无规则 '}${r.name}`)
  if (m.noRule.length > 0) {
    console.warn(`[task-runner] ⚠️ ${m.noRule.length} 个工具没有任何权限规则（一律按默认决策拒绝）: ${m.noRule.join(', ')}`)
  }
}

const ORIGINAL_CWD = process.cwd()

function argsSummary(args: unknown): string {
  if (typeof args !== 'object' || args === null) return ''
  return Object.entries(args as Record<string, unknown>)
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v.slice(0, 60) : JSON.stringify(v)?.slice(0, 60)}`)
    .join(', ')
}

// settings 引导 — 把主机配置写进主应用 settings（provider 解析由此走通），只写一次
// 返回已加载设置：vision 配置等非主机专属字段沿用主应用默认值（如免费视觉模型）
let settingsReady: Promise<AppSettings> | null = null
/**
 * 父进程预写 settings（阶段 D5 沙箱）— worker 降权到任务用户后，写共享的
 * settings.json 会因属主不同而 EACCES（首个 worker 创建的文件归它自己）。
 * 由 supervisor（root）在 fork 前写一次，worker 读到匹配值即不再写。
 */
export function ensureHostSettings(cfg: { baseUrl: string; apiKey: string; model: string }): Promise<AppSettings> {
  return ensureSettings(cfg)
}

function ensureSettings(cfg: { baseUrl: string; apiKey: string; model: string }): Promise<AppSettings> {
  settingsReady ??= (async () => {
    const s = await loadSettings()
    if (s.apiKey !== cfg.apiKey || s.baseUrl !== cfg.baseUrl || s.model !== cfg.model) {
      const next = { ...s, apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model as ModelId }
      await saveSettings(next)
      return next
    }
    return s
  })().catch((e) => { settingsReady = null; throw e })
  return settingsReady
}

export async function runTask(input: TaskInput): Promise<TaskOutput> {
  process.chdir(input.workspace)
  setAllowedWriteRoots([input.workspace])

  let result = ''
  let failedError: string | undefined

  try {
    const settings = await ensureSettings({ baseUrl: input.baseUrl, apiKey: input.apiKey, model: input.model })
    await ensureModuleGroupsLoaded(HOST_TOOL_GROUPS)

    // desktop 工具 — 总线可用时注册并纳入工具清单（每次运行覆盖注册，保持单例一致）
    const toolNames = [...HOST_TOOL_NAMES]
    if (input.desktopBus?.enabled) {
      toolRegistry.register(new DesktopBusTool(input.desktopBus))
      toolNames.push('desktop')
    }
    // office 文档工具 — 零依赖 OOXML 读写（主应用 OfficeDocsTool 依赖 Windows
    // officecli.exe，Linux 主机不可用；此处走 python 标准库 helper）
    toolRegistry.register(new OfficeDocsTool())
    toolNames.push('office_docs')
    // 浏览器语义化工具（阶段 D1）— 镜像/部署设 XIMO_HOST_BROWSER=1 启用
    // （CDP 直连 chromium；worker fork 继承 env，与父同开关）
    if (process.env.XIMO_HOST_BROWSER === '1') {
      toolRegistry.register(new BrowserTool())
      toolNames.push('browser')
    }

    // 权限自检（铁门槛⑥）— 每次任务打印工具×决策矩阵，无规则工具立即告警
    logPermissionMatrix(toolNames, input.mode)

    const request: ChatRequest = {
      mode: input.mode as Mode,
      model: input.model as ModelId,
      // 无人值守默认决策显式声明 — 未命中权限清单的工具直接拒绝（fail-closed），
      // 而非静默回退 ask（主机上 ask = 审批超时拒绝 = 功能不可用，必须可见）
      defaultDecisionOverride: 'deny',
      thinkingMode: true,
      reasoningEffort: 'high',
      temperature: 0.7,
      maxTokens: 8192,
      messages: [{ role: 'user', content: input.task }] as ApiMessage[],
      tools: toolRegistry.getByNames(toolNames).map(t => t.definition),
      sessionId: input.id,
      autoModeLevel: 'off', // ask 类操作 → requestConfirmation → 驾驶舱审批
    }

    const handlers = {
      onChunk: (chunk: StreamChunk): void => {
        if (chunk.content) {
          result += chunk.content
          input.onEvent({ type: 'text', text: chunk.content })
        }
        if (chunk.toolCall) {
          input.onEvent({ type: 'tool', name: chunk.toolCall.name, argsSummary: argsSummary(chunk.toolCall.arguments) })
        }
        if (chunk.toolResult) {
          input.onEvent({
            type: 'tool_result',
            name: chunk.toolResult.toolName ?? '',
            content: (chunk.toolResult.success
              ? chunk.toolResult.content
              : `失败：${chunk.toolResult.error ?? '未知错误'}`).slice(0, 2000),
            success: chunk.toolResult.success ?? false,
          })
        }
        if (chunk.done && chunk.error) failedError = chunk.error
      },
      signal: input.signal,
      requestConfirmation: (toolName: string, message: string): Promise<boolean> => input.approval(toolName, message),
      autoModeLevel: 'off' as const,
    }

    const toolContext: ToolContext = {
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      model: input.model,
      reasoningEffort: 'high',
      terminalTimeout: 120,
      terminalOutputLimit: 50_000,
      codeExecTimeout: 60,
      webFetchMaxLength: 8000,
      webCacheEnabled: true,
      helperCommandTimeout: 30,
      mcpConnectTimeout: 30,
      visionApiKey: settings.visionApiKey ?? '',
      visionBaseUrl: settings.visionBaseUrl ?? 'https://api.agnes-ai.cn/v1',
      visionModel: settings.visionModel ?? 'agnes-2.5-flash',
      mode: input.mode as Mode,
    }

    await agentLoop(input.apiKey, input.baseUrl, request, handlers, toolContext, input.id)

    if (input.signal.aborted) return { status: 'cancelled', result: '' }
    if (failedError) return { status: 'failed', result, error: failedError }
    return { status: 'completed', result: result || '(无输出)' }
  } catch (e) {
    if (input.signal.aborted) return { status: 'cancelled', result: '' }
    return { status: 'failed', result, error: (e as Error).message.slice(0, 300) }
  } finally {
    try { process.chdir(ORIGINAL_CWD) } catch { /* 目录可能已被清理 */ }
    setAllowedWriteRoots([])
  }
}
