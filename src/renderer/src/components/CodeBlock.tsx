import { memo, useState, useRef, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { Check, Copy } from 'lucide-react'

interface CodeBlockProps {
  language: string
  value: string
}

// react-syntax-highlighter 延迟加载 — 首次渲染代码块时才动态导入
// 使用 PrismLight 按需注册语言，避免打包全部 987 个语言定义（~2.4 MB）
type SyntaxHighlighterStyle = Record<string, CSSProperties>
let highlighterPromise: Promise<{ Component: React.FC<Record<string, unknown>>; style: SyntaxHighlighterStyle }> | null = null

function loadHighlighter(): Promise<{ Component: React.FC<Record<string, unknown>>; style: SyntaxHighlighterStyle }> {
  if (!highlighterPromise) {
    highlighterPromise = Promise.all([
      import('react-syntax-highlighter').then((mod) => {
        const PrismLight = mod.PrismLight
        // 注册常用语言（20 种覆盖绝大多数编程场景）
        const langs: Record<string, () => Promise<unknown>> = {
          javascript: () => import('react-syntax-highlighter/dist/esm/languages/prism/javascript'),
          typescript: () => import('react-syntax-highlighter/dist/esm/languages/prism/typescript'),
          jsx: () => import('react-syntax-highlighter/dist/esm/languages/prism/jsx'),
          tsx: () => import('react-syntax-highlighter/dist/esm/languages/prism/tsx'),
          python: () => import('react-syntax-highlighter/dist/esm/languages/prism/python'),
          java: () => import('react-syntax-highlighter/dist/esm/languages/prism/java'),
          go: () => import('react-syntax-highlighter/dist/esm/languages/prism/go'),
          rust: () => import('react-syntax-highlighter/dist/esm/languages/prism/rust'),
          c: () => import('react-syntax-highlighter/dist/esm/languages/prism/c'),
          cpp: () => import('react-syntax-highlighter/dist/esm/languages/prism/cpp'),
          csharp: () => import('react-syntax-highlighter/dist/esm/languages/prism/csharp'),
          html: () => import('react-syntax-highlighter/dist/esm/languages/prism/markup'),
          css: () => import('react-syntax-highlighter/dist/esm/languages/prism/css'),
          json: () => import('react-syntax-highlighter/dist/esm/languages/prism/json'),
          yaml: () => import('react-syntax-highlighter/dist/esm/languages/prism/yaml'),
          xml: () => import('react-syntax-highlighter/dist/esm/languages/prism/markup'),
          markdown: () => import('react-syntax-highlighter/dist/esm/languages/prism/markdown'),
          sql: () => import('react-syntax-highlighter/dist/esm/languages/prism/sql'),
          bash: () => import('react-syntax-highlighter/dist/esm/languages/prism/bash'),
          shell: () => import('react-syntax-highlighter/dist/esm/languages/prism/bash')
        }
        return Promise.all(
          Object.entries(langs).map(async ([name, loader]) => {
            const langMod = await loader()
            PrismLight.registerLanguage(name, (langMod as { default: unknown }).default)
          })
        ).then(() => PrismLight)
      }),
      import('react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus')
    ]).then(([PrismLight, styleMod]) => ({
      Component: PrismLight as unknown as React.FC<Record<string, unknown>>,
      style: (styleMod as { default: SyntaxHighlighterStyle }).default
    }))
  }
  return highlighterPromise
}

export const CodeBlock = memo(function CodeBlock({ language, value }: CodeBlockProps): React.ReactElement {
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [highlighter, setHighlighter] = useState<{ Component: React.FC<Record<string, unknown>>; style: SyntaxHighlighterStyle } | null>(null)

  useEffect(() => {
    if (!highlighter) {
      let cancelled = false
      loadHighlighter().then((result) => {
        if (!cancelled) setHighlighter(result)
      })
      return () => { cancelled = true }
    }
  }, [highlighter])

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current)
    }
  }, [])

  const handleCopy = (): void => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="group relative my-3 overflow-hidden rounded-xl border border-border-subtle bg-[#0d1117] shadow-glass transition-all hover:border-border-hover">
      {/* 语言标签 + 复制按钮 */}
      <div className="flex items-center justify-between border-b border-border-subtle bg-bg-elevated/60 backdrop-blur-sm px-3 py-1.5">
        <span className="text-xs font-mono text-text-secondary">{language || 'text'}</span>
        <button
          onClick={handleCopy}
          className="icon-btn flex items-center gap-1 rounded-md px-2 py-0.5 text-xs"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      {highlighter ? (
        <highlighter.Component
          language={language || 'text'}
          style={highlighter.style}
          customStyle={{
            margin: 0,
            padding: '14px 16px',
            background: 'transparent',
            fontSize: '13.5px',
            lineHeight: '1.6'
          }}
          codeTagProps={{ style: { fontFamily: 'JetBrains Mono, Consolas, monospace' } }}
          wrapLongLines={false}
        >
          {value}
        </highlighter.Component>
      ) : (
        <pre className="overflow-x-auto" style={{ margin: 0, padding: '14px 16px', background: 'transparent', fontSize: '13.5px', lineHeight: '1.6', fontFamily: 'JetBrains Mono, Consolas, monospace' }}>
          <code>{value}</code>
        </pre>
      )}
    </div>
  )
})
