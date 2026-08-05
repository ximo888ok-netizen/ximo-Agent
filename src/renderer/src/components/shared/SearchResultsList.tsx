import type React from 'react'

interface SearchResult {
  title: string
  url: string
  snippet: string
  engine?: string
}

interface SearchResultsListProps {
  results: SearchResult[]
  query: string
}

/**
 * SearchResultsList — 搜索结果专用渲染
 * 解析 metadata.results 数组，渲染标题+URL+摘要+来源
 */
export function SearchResultsList({ results, query }: SearchResultsListProps): React.ReactElement {
  return (
    <div className="my-2 space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-text-muted">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <span>搜索结果: <span className="text-text-primary">{query}</span> ({results.length} 条)</span>
      </div>
      {results.map((r, i) => (
        <a
          key={`${r.url}-${i}`}
          href={r.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ios-card block p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-medium text-text-primary line-clamp-1">{r.title}</h4>
            {r.engine && (
              <span className="shrink-0 rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] text-text-muted">{r.engine}</span>
            )}
          </div>
          {r.snippet && (
            <p className="mt-1 text-xs leading-relaxed text-text-secondary line-clamp-2">{r.snippet}</p>
          )}
          <p className="mt-1 text-[11px] text-text-muted truncate">{r.url}</p>
        </a>
      ))}
    </div>
  )
}
