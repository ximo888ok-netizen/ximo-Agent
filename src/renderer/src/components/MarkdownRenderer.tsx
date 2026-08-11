import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from './CodeBlock'
import { MermaidBlock } from './MermaidBlock'

interface MarkdownRendererProps {
  content: string
}

// 模块级常量 — 引用永久稳定，避免每次渲染重建对象导致 ReactMarkdown 不必要的重渲染
const REMARK_PLUGINS = [remarkGfm]

const MD_COMPONENTS = {
  // 代码块：区分 mermaid 与普通代码
  code({ className, children, ...props }: { className?: string; children?: React.ReactNode }) {
    const match = /language-(\w+)/.exec(className || '')
    const lang = match ? match[1] : ''
    const text = String(children).replace(/\n$/, '')

    // mermaid 代码块
    if (lang === 'mermaid') {
      return <MermaidBlock chart={text} />
    }

    // 带语言标注的多行代码块
    if (lang) {
      return <CodeBlock language={lang} value={text} />
    }

    // 行内代码
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },
  // 链接新窗口打开
  a({ children, href }: { children?: React.ReactNode; href?: string }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  },
} as const

export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: MarkdownRendererProps): React.ReactElement {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        components={MD_COMPONENTS}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})
