import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface InlineFileEditProps {
  fileName: string
  additions: number
  deletions: number
  status: 'pending' | 'done'
  filesCount?: number
  oldContent?: string
  newContent?: string
}

/** LCS diff 类型 */
interface DiffLine {
  type: 'add' | 'del' | 'ctx'
  text: string
  oldNum?: number
  newNum?: number
}

/** LCS 动态规划行级 diff 算法 — 生成最小编辑序列 */
function computeLcsDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const m = oldLines.length
  const n = newLines.length

  // 性能保护：超大文件退化为逐行对比
  if (m * n > 500_000) {
    return computeFallbackDiff(oldLines, newLines)
  }

  // 构建 LCS DP 表
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  // 回溯生成 diff
  const result: DiffLine[] = []
  let i = 0
  let j = 0
  let oldNum = 1
  let newNum = 1

  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      result.push({ type: 'ctx', text: oldLines[i], oldNum, newNum })
      i++; j++; oldNum++; newNum++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'del', text: oldLines[i], oldNum })
      i++; oldNum++
    } else {
      result.push({ type: 'add', text: newLines[j], newNum })
      j++; newNum++
    }
  }
  while (i < m) {
    result.push({ type: 'del', text: oldLines[i], oldNum })
    i++; oldNum++
  }
  while (j < n) {
    result.push({ type: 'add', text: newLines[j], newNum })
    j++; newNum++
  }

  return result
}

/** 超大文件兜底 diff */
function computeFallbackDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const result: DiffLine[] = []
  const maxLen = Math.max(oldLines.length, newLines.length)
  let oldNum = 1
  let newNum = 1
  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i]
    const newLine = newLines[i]
    if (oldLine === newLine) {
      result.push({ type: 'ctx', text: newLine ?? '', oldNum, newNum })
      oldNum++; newNum++
    } else {
      if (oldLine !== undefined) {
        result.push({ type: 'del', text: oldLine, oldNum })
        oldNum++
      }
      if (newLine !== undefined) {
        result.push({ type: 'add', text: newLine, newNum })
        newNum++
      }
    }
  }
  return result
}

export function InlineFileEdit({
  fileName,
  additions,
  deletions,
  status,
  filesCount,
  oldContent,
  newContent
}: InlineFileEditProps): React.ReactElement {
  const isDone = status === 'done'
  const [expanded, setExpanded] = useState(false)

  const hasDiff = oldContent !== undefined && newContent !== undefined
  const diffLines = hasDiff ? computeLcsDiff(oldContent!, newContent!) : []

  return (
    <div className="my-1.5">
      <div
        className={`flex items-center gap-2 px-3 py-1.5 text-xs border-l-2 bg-bg-surface rounded-r-control cursor-pointer transition-colors hover:bg-bg-hover ${
          isDone ? 'border-green-500/60' : 'border-accent'
        }`}
        onClick={() => hasDiff && setExpanded(!expanded)}
      >
        <span className="text-accent font-mono shrink-0">edit</span>
        <span className="text-text-primary font-mono truncate">{fileName}</span>
        {additions > 0 && (
          <span className="text-green-500 font-mono shrink-0">+{additions}</span>
        )}
        {deletions > 0 && (
          <span className="text-red-400 font-mono shrink-0">−{deletions}</span>
        )}
        {isDone && <span className="ml-auto text-green-500 shrink-0">✓</span>}
        {hasDiff && (
          <ChevronDown size={11} className={`shrink-0 text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
        )}
      </div>
      {expanded && diffLines.length > 0 && (
        <div className="mt-0.5 overflow-hidden rounded-card border border-border-subtle bg-[#0d1117] shadow-glass">
          <div className="overflow-x-auto py-1 font-mono text-caption leading-relaxed">
            {diffLines.map((line, i) => (
              <div
                key={i}
                className={`px-3 flex items-start ${
                  line.type === 'add'
                    ? 'bg-green-500/10 text-green-400'
                    : line.type === 'del'
                    ? 'bg-red-500/10 text-red-400'
                    : 'text-text-muted'
                }`}
              >
                <span className="select-none text-text-quaternary w-7 text-right shrink-0">
                  {line.oldNum ?? ''}
                </span>
                <span className="select-none text-text-quaternary w-7 text-right shrink-0 ml-2">
                  {line.newNum ?? ''}
                </span>
                <span className="select-none mx-2 shrink-0">
                  {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
                </span>
                <span className="whitespace-pre-wrap break-all">{line.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {isDone && filesCount && filesCount > 1 && (
        <div className="mt-0.5 text-caption text-text-muted px-3">
          {filesCount} files
        </div>
      )}
    </div>
  )
}
