import { useEffect, useRef, useState } from 'react'

// mermaid 延迟加载 — 首次渲染 mermaid 图表时才动态导入
let mermaidPromise: Promise<typeof import('mermaid')['default']> | null = null

function loadMermaid(): Promise<typeof import('mermaid')['default']> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
        fontFamily: 'system-ui, sans-serif'
      })
      return mermaid
    })
  }
  return mermaidPromise
}

let renderIndex = 0

interface MermaidBlockProps {
  chart: string
}

export function MermaidBlock({ chart }: MermaidBlockProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    const id = `mermaid-${renderIndex++}`

    loadMermaid()
      .then((mermaid) => mermaid.render(id, chart))
      .then(({ svg: result }) => {
        if (!cancelled) {
          setSvg(result)
          setError('')
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
        }
      })

    return () => {
      cancelled = true
    }
  }, [chart])

  if (error) {
    return (
      <div className="my-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400 animate-fade-scale">
        <p className="font-semibold mb-1">Mermaid 图表渲染失败</p>
        <pre className="text-xs whitespace-pre-wrap text-red-300/80">{error}</pre>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="ios-card my-3 flex justify-center overflow-x-auto p-4"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
