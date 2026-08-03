import type React from 'react'
import { useStore } from '@renderer/store/useStore'
import { Cpu, Loader2 } from 'lucide-react'

/** 工具名 → 中文标签映射 */
const TOOL_LABELS: Record<string, string> = {
  web_search: '搜索',
  web_fetch: '抓取',
  web_cache: '缓存',
  web_research: '研究',
  browser_navigate: '浏览器',
  browser_screenshot: '截图',
  browser_click: '点击',
  browser_type: '输入',
  browser_get_content: '提取',
  browser_execute_js: 'JS',
  browser_network_monitor: '网络',
  screen_capture: '截屏',
  find_roots: '窗口',
  observe_ui: '观察UI',
  search_ui: '搜索UI',
  act_ui: '操作',
  read_text: '读文本',
  wait_for: '等待',
  network_capture: '抓包',
  network_replay: '重放',
  storage_inspect: '存储',
  js_hook: 'Hook',
  api_extract: 'API',
  file_read: '读取文件',
  file_write: '写入文件',
  file_list: '列出文件',
  file_search: '搜索文件',
  file_edit: '编辑文件',
  file_delete: '删除文件',
  terminal_exec: '执行命令',
  git_operations: 'Git',
  code_execute: '运行代码',
  code_lint: '代码检查',
  code_format: '代码格式化',
  dependency_check: '依赖检查',
  project_context: '项目扫描',
  skill_record: '录制技能',
  skill_invoke: '调用技能'
}

/**
 * ToolPanel — 紧凑工具调用状态
 * 显示一行摘要而非逐个标签，减少视觉干扰
 */
export function ToolPanel(): React.ReactElement | null {
  const toolCalls = useStore((s) => s.streamingToolCalls)
  const isStreaming = useStore((s) => s.isStreaming)

  if (!isStreaming || toolCalls.length === 0) return null

  const done = toolCalls.filter((tc) => tc.status === 'done').length
  const calling = toolCalls.filter((tc) => tc.status === 'calling').length
  const current = toolCalls.find((tc) => tc.status === 'calling')

  return (
    <div className="flex items-center gap-2 px-4 py-1.5">
      {current ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-accent">
          <Loader2 size={11} className="animate-spin" />
          {TOOL_LABELS[current.name] || current.name}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
          <Cpu size={11} />
          思考中…
        </span>
      )}
      {done > 0 && (
        <span className="text-[11px] text-text-muted">
          已完成 {done} 次工具调用
        </span>
      )}
    </div>
  )
}
