interface InlineTerminalOutputProps {
  command: string
  output: string
  exitCode?: number
  duration?: string
}

export function InlineTerminalOutput({
  command,
  output,
  exitCode,
  duration
}: InlineTerminalOutputProps): React.ReactElement {
  const isSuccess = exitCode === undefined || exitCode === 0

  return (
    <div className="my-2 overflow-hidden rounded-panel border border-border-subtle bg-[#0d1117] shadow-glass">
      {/* 命令行栏 */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-subtle-soft bg-bg-surface-soft backdrop-blur-sm">
        <span className="text-xs text-text-muted font-mono">$ {command}</span>
        {duration && <span className="text-caption text-text-muted">{duration}</span>}
      </div>
      {/* 输出区 */}
      <div className="p-3 font-mono text-xs max-h-48 overflow-y-auto">
        {output ? (
          <pre className={`whitespace-pre-wrap break-all ${isSuccess ? 'text-green-400' : 'text-red-400'}`}>
            {output}
          </pre>
        ) : (
          <span className="text-text-muted">(无输出)</span>
        )}
      </div>
    </div>
  )
}
