import type React from 'react'
import type { ToolResult } from '@shared/types'
import { CodeBlock } from '@renderer/components/CodeBlock'
import { InlineFileEdit } from '@renderer/components/coding/InlineFileEdit'

interface ToolResultCardProps {
  result: ToolResult
}

/**
 * ToolResultCard — 工具执行结果内联渲染卡片
 * 根据 displayType 选择合适的渲染方式
 */
export function ToolResultCard({ result }: ToolResultCardProps): React.ReactElement {
  if (!result.success) {
    return (
      <div className="my-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400 backdrop-blur-sm">
        ⚠ {result.error || result.content}
      </div>
    )
  }

  if (result.screenshot) {
    return (
    <div className="my-2 overflow-hidden rounded-xl border border-border-subtle ios-card">
      <div className="flex items-center justify-between border-b border-border-subtle bg-bg-surface/40 px-3 py-1.5">
          <span className="text-[11px] text-text-muted">{result.toolName} — 截图</span>
          <span className="text-[11px] text-green-500">✓ 完成</span>
        </div>
        <img src={result.screenshot} alt="工具执行截图" className="w-full" />
      </div>
    )
  }

  // 文件编辑/写入/批量编辑/移动 — 内联 Diff 查看
  if (result.toolName === 'file_edit' || result.toolName === 'file_write' || result.toolName === 'multi_edit' || result.toolName === 'move_file') {
    const meta = result.metadata || {}
    const fileName = (meta.fileName as string) || (meta.filePath as string)?.split(/[/\\]/).pop() || ''
    if (fileName) {
      return (
        <div className="my-2">
          <InlineFileEdit
            fileName={fileName}
            additions={(meta.additions as number) ?? 0}
            deletions={(meta.deletions as number) ?? 0}
            status="done"
            oldContent={meta.oldContent as string | undefined}
            newContent={meta.newContent as string | undefined}
          />
        </div>
      )
    }
  }

  // todo_write 不在消息流内联渲染 — 顶部 TaskListPanel 是唯一展示位置，避免重复
  if (result.toolName === 'todo_write') {
    return <></>
  }

  switch (result.displayType) {
    case 'code':
      return (
        <div className="my-2 overflow-hidden rounded-xl border border-border-subtle ios-card">
          <div className="flex items-center justify-between border-b border-border-subtle bg-bg-surface/40 px-3 py-1.5">
            <span className="text-[11px] text-text-muted">{result.toolName}</span>
            <span className="text-[11px] text-green-500">✓ 完成</span>
          </div>
          <CodeBlock language={(result.metadata?.language as string) || 'text'} value={result.content} />
        </div>
      )
    case 'search-results':
      return (
        <div className="my-2 ios-card border-accent/20 p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <span className="text-[11px] font-medium text-text-secondary">搜索结果</span>
            <span className="ml-auto text-[10px] text-green-500">✓</span>
          </div>
          {/* 尝试解析结构化搜索结果 */}
          {result.metadata?.results && Array.isArray(result.metadata.results) ? (
            <div className="space-y-2">
              {(result.metadata.results as Array<{ title?: string; url?: string; snippet?: string }>).slice(0, 5).map((r, i) => (
                <div key={i} className="rounded-xl border border-border/50 p-2 hover:border-accent/30 hover:bg-accent/3 transition-all duration-200">
                  {r.title && (
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-accent hover:underline">
                      {r.title}
                    </a>
                  )}
                  {r.snippet && <p className="mt-0.5 text-[11px] text-text-muted leading-tight">{r.snippet}</p>}
                  {r.url && <p className="mt-0.5 text-[10px] text-text-muted/60 truncate">{r.url}</p>}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-text-secondary whitespace-pre-wrap">{result.content}</div>
          )}
        </div>
      )
    default:
      // 只有非空内容时才渲染
      if (result.content && result.content.trim()) {
        return (
          <div className="my-2 ios-card px-3 py-2">
            <div className="text-xs text-text-secondary whitespace-pre-wrap">{result.content}</div>
          </div>
        )
      }
      return (<></>)
  }
}
