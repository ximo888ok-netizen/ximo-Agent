// ── ChatMessage → TranscriptItem 适配器 ─────────────────────────────────
// 把我们的嵌套 ChatMessage[] (toolCalls/toolResults 挂在消息上)
// 转成 DeepSeek-Reasonix 风格的扁平 Item[] (每个工具/通知是独立条目)

import type { ChatMessage, ToolResult } from '@shared/types'
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
  if (output) {
    const firstLine = output.split('\n')[0]?.slice(0, 80)
    if (firstLine) return firstLine
  }
  return ''
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
 * - 流式工具调用状态 → 从 streamingToolCalls 构建 running tool items
 * - 流式占位消息 → 即使 content/reasoning 都为空，也输出一个 streaming assistant item
 */
export function adaptMessages(
  messages: ChatMessage[],
  streamingToolCalls?: { name: string; status: 'thinking' | 'calling' | 'done'; args?: string; result?: string; toolCallId?: string }[],
  streamingAssistantId?: string | null,
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

      if (hasReasoning) {
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
      if (msg.toolCalls) {
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
        } as AssistantItem)
      }
      continue
    }
  }

  // 追加流式中的 tool items — 包括正在执行和已完成的
  // 已完成的工具调用在持久化前不会出现在 msg.toolCalls 中，
  // 必须在此处渲染，否则工具一旦完成就从 UI 消失
  if (streamingToolCalls) {
    for (const stc of streamingToolCalls) {
      const isRunning = stc.status === 'calling' || stc.status === 'thinking'
      items.push({
        kind: 'tool',
        id: stc.toolCallId || `streaming-tool-${seq++}`,
        name: stc.name,
        args: stc.args || '',
        readOnly: isReadOnlyTool(stc.name),
        status: isRunning ? 'running' : 'done',
        output: stc.result,
        summary: stc.result ? stc.result.slice(0, 80).replace(/\n/g, ' ') : undefined,
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
