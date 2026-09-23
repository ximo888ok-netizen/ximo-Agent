// ── ChatMessage → TranscriptItem 适配器 ─────────────────────────────────
// 把我们的嵌套 ChatMessage[] (toolCalls/toolResults 挂在消息上)
// 转成 DeepSeek-Reasonix 风格的扁平 Item[] (每个工具/通知是独立条目)

import type { ChatMessage, ToolResult, StreamingSegment } from '@shared/types'
import type { TranscriptItem, ToolItem, AssistantItem, LiveStream } from './transcriptTypes'

// 工具名 → 中文标签
const TOOL_LABELS: Record<string, string> = {
  web_search: '联网搜索', web_fetch: '网页抓取', web_research: '深度研究',
  file_read: '读取文件', file_write: '写入文件', file_list: '列出文件',
  file_search: '搜索文件', file_edit: '编辑文件', file_delete: '删除文件',
  multi_edit: '批量编辑', move_file: '移动文件', terminal_exec: '执行命令',
  git_operations: 'Git 操作', code_execute: '运行代码', code_lint: '代码检查',
  code_format: '代码格式化', dependency_check: '依赖检查',
  project_context: '项目扫描', ui_generate: 'UI 生成',
  browser_navigate: '浏览器导航', browser_screenshot: '浏览器截图',
  browser_click: '点击', browser_type: '输入', browser_get_content: '提取内容',
  browser_execute_js: '执行JS', browser_network_monitor: '网络监控',
  screen_capture: '截屏', find_roots: '查找窗口', observe_ui: '观察UI',
  search_ui: '搜索UI', act_ui: '操作UI', read_text: '读取文本',
  wait_for: '等待', network_capture: '抓包', network_replay: '重放',
  storage_inspect: '存储检查', js_hook: 'Hook', api_extract: 'API提取',
  skill_record: '录制技能', skill_invoke: '调用技能',
  design_preview: '设计预览', design_critique: '设计审查',
  design_audit: '质量审计', design_a11y: '无障碍检查', design_color: '颜色分析',
}

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] || name
}

// 只读工具判断
const READ_ONLY_TOOLS = new Set([
  'file_read', 'file_list', 'file_search', 'web_fetch', 'web_search',
  'web_research', 'project_context', 'code_index', 'screen_capture',
  'browser_screenshot', 'browser_get_content', 'observe_ui', 'search_ui',
  'read_text', 'code_lint', 'dependency_check', 'design_preview',
  'design_critique', 'design_audit', 'design_a11y', 'design_color',
])

function isReadOnlyTool(name: string): boolean {
  return READ_ONLY_TOOLS.has(name)
}

function isShellTool(name: string): boolean {
  return name === 'terminal_exec' || name === 'bash' || name === 'bash_output'
}

/** 从 ToolResult 提取摘要 */
/**
 * 无参数可提取的工具 → 用固定标签。
 * 这些工具（项目扫描类）的入参里没有 path/query/command，
 * 之前会回退到"拿输出的首行当标题"，于是 markdown 标题原样漏进了行内摘要，
 * 例如 `## 📁 项目上下文：\`D:\...\`` —— 又长又脏，还把真正的信息淹掉了。
 */
const STATIC_TOOL_LABELS: Record<string, string> = {
  project_context: '项目上下文',
  project_index: '项目语义索引',
  file_list: '目录列表'
}

/** 输出的首行是否"像一个标签" —— 拒绝 markdown 结构行与「标题：长内容」这类句子 */
function isLabelLike(line: string): boolean {
  const t = line.trim()
  if (!t || t.length > 40) return false
  if (/^[#>*\-+`|\d]/.test(t)) return false // markdown 结构行 / 有序列表
  if (/[：:]\s*\S{10,}/.test(t)) return false // 「标题：一长串内容」
  return true
}

function summarizeToolResult(name: string, args: string, output?: string): string {
  try {
    const parsed = JSON.parse(args)
    if (parsed.query || parsed.question) return `"${parsed.query || parsed.question}"`
    if (parsed.path || parsed.filePath) {
      const p = parsed.path || parsed.filePath
      return p.split(/[/\\]/).pop() || p
    }
    if (parsed.command) return `$ ${parsed.command}`
    if (parsed.url) return parsed.url
  } catch { /* ignore */ }
  const fixed = STATIC_TOOL_LABELS[name]
  if (fixed) return fixed
  if (output) {
    const firstLine = output.split('\n')[0]?.slice(0, 80) ?? ''
    if (isLabelLike(firstLine)) return firstLine
  }
  return ''
}

/**
 * 把「有序事件流」转成按真实发生顺序排列的过程项。
 *
 * 为什么需要它：流式和持久化的**扁平数据都是同类型堆叠**的 ——
 * `streamingReasoning` 是所有轮次推理拼成的一个大字符串、`streamingToolCalls`
 * 是全部工具调用一个数组；持久化侧的 `reasoningContent` + `toolCalls` 同理。
 * 按这两份数据渲染，只能得到「先一大段推理，再把所有工具框堆在最后」。
 *
 * 而 `StreamingSegment.events` 恰好记录了**真实发生顺序**
 * （类型注释原话：「按实际发生顺序记录，渲染时按序输出而非同类型堆叠」），
 * **流式与持久化两侧都有**，所以两侧都改用它 —— 这样一轮任务在
 * 「进行中」和「结束后」看到的顺序完全一致，不会跑完就跳回底部。
 *
 * 没有 events 的老数据退回同类型堆叠，保证不丢内容。
 *
 * @param flat 扁平侧的工具数据 —— **状态与结果的权威来源**。
 *   事件流里的 `status` 可能滞后（例如按工具名兜底匹配时漏更新事件），
 *   而扁平数组（streamingToolCalls / msg.toolCalls+toolResults）是同步维护的。
 *   两者按 toolCallId 对齐，事件负责**顺序**，扁平侧负责**状态与结果**。
 */
function processItemsFromSegments(
  segments: StreamingSegment[],
  assistantId: string,
  flat?: {
    calls: { id: string; name: string; args: string; status: string; result?: string }[]
    results: ToolResult[]
  },
): TranscriptItem[] {
  const out: TranscriptItem[] = []
  /** 最后一个 reasoning 项 —— 若事件流的末尾仍是 reasoning，它就是"正在写"的那一段 */
  let lastReasoningId: string | null = null
  let lastEventType: string | null = null

  const flatById = new Map<string, { id: string; name: string; args: string; status: string; result?: string }>()
  for (const c of flat?.calls ?? []) if (c.id) flatById.set(c.id, c)
  const resultById = new Map<string, ToolResult>()
  for (const r of flat?.results ?? []) resultById.set(r.toolCallId, r)

  /** 用事件（定顺序）+ 扁平数据（定状态与结果）合成一条工具项 */
  const buildToolItem = (
    id: string,
    evName: string,
    evArgs: string,
    evResult: string | undefined,
    evCalling: boolean,
  ): ToolItem => {
    const info = flatById.get(id)
    const res = resultById.get(id)
    const name = info?.name || evName
    const args = info?.args || evArgs
    const output = res?.content ?? info?.result ?? evResult
    // 扁平侧有状态就以它为准（它是同步维护的），否则退回事件里的 calling/done
    const calling = info ? info.status === 'calling' || info.status === 'thinking' : evCalling
    const isErr = Boolean(res && !res.success)
    return {
      kind: 'tool',
      id,
      name,
      args,
      readOnly: isReadOnlyTool(name),
      status: calling ? 'running' : isErr ? 'error' : 'done',
      output,
      error: res?.error,
      summary: summarizeToolResult(name, args, output),
      isShell: isShellTool(name),
    } as ToolItem
  }

  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si]
    const events = seg.events
    // 防御：segment 来自持久化数据时字段可能缺失，缺字段不该让整块过程渲染不出来
    const segTools = seg.toolCalls ?? []

    if (!events || events.length === 0) {
      if (seg.reasoning?.trim()) {
        const id = `${assistantId}-r${si}`
        out.push({
          kind: 'assistant', id, text: '', reasoning: seg.reasoning,
          streaming: false, reasoningComplete: true,
        } as AssistantItem)
        lastReasoningId = id
      }
      for (let ti = 0; ti < segTools.length; ti++) {
        const tc = segTools[ti]
        const id = tc.toolCallId ?? `${assistantId}-t${si}-${ti}`
        out.push(buildToolItem(id, tc.name, tc.args ?? '', tc.result, tc.status === 'calling' || tc.status === 'thinking'))
      }
      if (segTools.length > 0) lastEventType = 'tool'
      continue
    }

    for (let ei = 0; ei < events.length; ei++) {
      const ev = events[ei]
      if (ev.type === 'reasoning') {
        if (!ev.text?.trim()) continue
        const id = `${assistantId}-r${si}-${ei}`
        out.push({
          kind: 'assistant', id, text: '', reasoning: ev.text,
          streaming: false, reasoningComplete: true,
        } as AssistantItem)
        lastReasoningId = id
        lastEventType = 'reasoning'
      } else if (ev.type === 'tool') {
        out.push(buildToolItem(
          ev.toolCallId ?? `${assistantId}-t${si}-${ei}`,
          ev.toolName ?? '',
          ev.args ?? '',
          ev.result,
          ev.status === 'calling',
        ))
        lastEventType = 'tool'
      }
      // content 事件是最终回答，不属于过程区，跳过
    }
  }

  // 事件流末尾仍是 reasoning ⇒ 模型此刻正在写思考，给它挂上"进行中"标记
  if (lastEventType === 'reasoning' && lastReasoningId) {
    const target = out.find((it) => it.id === lastReasoningId)
    if (target && target.kind === 'assistant') {
      target.streaming = true
      target.reasoningComplete = false
    }
  }

  return out
}

/**
 * 把 ChatMessage[] 转成扁平的 TranscriptItem[]
 *
 * 转换规则：
 * - user 消息 → user item
 * - assistant 消息 → 如果有 reasoning，先输出一个 reasoning-only assistant item
 *                    如果有 text，再输出一个 answer assistant item
 * - toolCalls → 每个变成独立的 tool item (status=done)
 * - toolResults → 匹配到对应 tool item 并补充 output
 * - 流式：优先用 streamingSegments[].events 的**真实顺序**交错输出；
 *        没有 events 时退回"reasoning 一段 + 工具追加在末尾"
 * - 流式占位消息 → 即使 content/reasoning 都为空，也输出一个 streaming assistant item
 */
export function adaptMessages(
  messages: ChatMessage[],
  streamingToolCalls?: { name: string; status: 'thinking' | 'calling' | 'done'; args?: string; result?: string; toolCallId?: string }[],
  streamingAssistantId?: string | null,
  streamingSegments?: StreamingSegment[],
): TranscriptItem[] {
  const items: TranscriptItem[] = []
  let seq = 0

  for (const msg of messages) {
    if (msg.role === 'user') {
      items.push({
        kind: 'user',
        id: msg.id,
        text: msg.content,
        timestamp: msg.timestamp,
        slashCommand: msg.slashCommand,
      })
      continue
    }

    if (msg.role === 'assistant') {
      const hasReasoning = Boolean(msg.reasoningContent?.trim())
      const hasText = Boolean(msg.content?.trim())
      const isStreamingPlaceholder = streamingAssistantId === msg.id

      // 优先走「有序事件流」—— 让推理与工具按真实发生顺序交错，
      // 而不是"推理一大段 + 工具全堆在末尾"。
      //
      // **流式与持久化两侧都要走**：只修流式的话，任务一结束就切回持久化路径，
      // 工具会整体跳回底部 —— 表现成"跑完又跑回底部了"。
      //
      // ⚠️ 必须**只有在它真能产出内容时**才采信：events 里可能只有 content 事件
      //（没有 reasoning / tool），此时有序路径产出 0 项。若无条件采信，就会
      // 同时跳过下面的 reasoning 兜底与末尾的工具追加 —— 结果是整块过程**全部不可见**，
      // 表现为"一直正在思考、不出内容"。
      const orderedSource = isStreamingPlaceholder
        ? (streamingSegments?.some((s) => s.events?.length) ? streamingSegments : null)
        : (msg.segments?.some((s) => s.events?.length) ? msg.segments : null)
      const orderedProcess = orderedSource
        ? processItemsFromSegments(orderedSource, msg.id, {
            // 流式侧用 streamingToolCalls 的实时状态，持久化侧用 msg 上的记录 ——
            // 两者都是同步维护的，作为状态与结果的权威
            calls: isStreamingPlaceholder
              ? (streamingToolCalls ?? []).map((tc) => ({
                  id: tc.toolCallId ?? '', name: tc.name, args: tc.args ?? '', status: tc.status, result: tc.result,
                }))
              : (msg.toolCalls ?? []).map((tc) => ({
                  id: tc.id, name: tc.name, args: JSON.stringify(tc.arguments), status: 'done',
                })),
            results: msg.toolResults ?? [],
          })
        : null
      const useOrdered = Boolean(orderedProcess && orderedProcess.length > 0)
      if (useOrdered && orderedProcess) {
        for (const it of orderedProcess) items.push(it)
      } else if (hasReasoning) {
        // reasoning 作为过程材料独立输出（无论是否有 text）
        items.push({
          kind: 'assistant',
          id: `${msg.id}-r`,
          text: '',
          reasoning: msg.reasoningContent!,
          streaming: false,
          reasoningComplete: true,
        })
      }

      // 工具调用 → 独立 tool items
      // 走有序事件流时跳过 —— 那些工具已经按真实顺序插在推理之间了（否则会渲染两遍）
      if (msg.toolCalls && !useOrdered) {
        const resultMap = new Map<string, ToolResult>()
        if (msg.toolResults) {
          for (const tr of msg.toolResults) {
            resultMap.set(tr.toolCallId, tr)
          }
        }

        for (const tc of msg.toolCalls) {
          const result = resultMap.get(tc.id)
          const argsStr = JSON.stringify(tc.arguments)
          const isErr = result && !result.success
          items.push({
            kind: 'tool',
            id: tc.id,
            name: tc.name,
            args: argsStr,
            readOnly: isReadOnlyTool(tc.name),
            status: result ? (isErr ? 'error' : 'done') : 'done',
            output: result?.content,
            error: result?.error,
            summary: summarizeToolResult(tc.name, argsStr, result?.content),
            isShell: isShellTool(tc.name),
          } as ToolItem)
        }
      }

      // text 作为回答 assistant item
      if (hasText) {
        items.push({
          kind: 'assistant',
          id: msg.id,
          text: msg.content,
          reasoning: '',
          streaming: false,
          reasoningComplete: true,
          model: msg.model,
        } as AssistantItem)
      } else if (isStreamingPlaceholder) {
        // 流式占位消息：content 和 reasoning 都为空，但仍需输出一个 streaming assistant item
        // 这样 live 数据才能通过 id 匹配注入
        items.push({
          kind: 'assistant',
          id: msg.id,
          text: '',
          reasoning: '',
          streaming: true,
          reasoningComplete: false,
          // 有序流里推理已经输出过了 —— 这一项只用来承接正文，不要再吃 live.reasoning
          ...(useOrdered ? { liveTextOnly: true } : {}),
        } as AssistantItem)
      }
      continue
    }
  }

  // 追加流式中的 tool items — 包括正在执行和已完成的
  // 已完成的工具调用在持久化前不会出现在 msg.toolCalls 中，
  // 必须在此处渲染，否则工具一旦完成就从 UI 消失。
  //
  // 走有序事件流时，工具已经按真实顺序插在推理之间了；这里按 **toolCallId 去重**后
  // 只补事件流里没有的那些 —— 而不是整个跳过。
  // 原因：events 有可能不完整（某一轮没写事件），一刀跳过会让那几件工具**彻底消失**；
  // 去重补漏则保证"顺序尽量对，且一个都不丢"。
  if (streamingToolCalls) {
    const alreadyEmitted = new Set(
      items.flatMap((it) => (it.kind === 'tool' ? [it.id] : [])),
    )
    for (const stc of streamingToolCalls) {
      const id = stc.toolCallId || `streaming-tool-${seq++}`
      if (alreadyEmitted.has(id)) continue
      const isRunning = stc.status === 'calling' || stc.status === 'thinking'
      items.push({
        kind: 'tool',
        id,
        name: stc.name,
        args: stc.args || '',
        readOnly: isReadOnlyTool(stc.name),
        status: isRunning ? 'running' : 'done',
        output: stc.result,
        // 与持久化路径走同一个摘要函数 —— 否则流式期间显示的是输出原文，
        // 刷新后变成结构化摘要，同一行工具前后长得不一样
        summary: stc.result ? summarizeToolResult(stc.name, stc.args || '', stc.result) : undefined,
        isShell: isShellTool(stc.name),
      } as ToolItem)
    }
  }

  return items
}

/** 从流式数据构建 LiveStream — 只要 isStreaming 就返回对象，让 UI 能显示加载状态 */
export function buildLiveStream(
  assistantId: string,
  content: string,
  reasoning: string,
): LiveStream | undefined {
  return {
    id: assistantId,
    text: content,
    reasoning,
    reasoningComplete: false,
    reasoningStartedAt: reasoning ? Date.now() : undefined,
  }
}
