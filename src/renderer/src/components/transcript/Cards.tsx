import { Info, TriangleAlert } from 'lucide-react'
import type { NoticeItem } from '@renderer/lib/transcriptTypes'

/** 阶段卡片 */
export function PhaseCard({ text }: { text: string }): React.ReactElement {
  return <div className="phase"><span>{text}</span></div>
}

/** 通知卡片 — 信息/警告 */
export function NoticeCard({ item }: { item: NoticeItem }): React.ReactElement {
  const Icon = item.level === 'warn' ? TriangleAlert : Info
  return (
    <div className={`notice-line notice-line--${item.level}`}>
      <Icon size={14} className="notice-line__icon" />
      <div className="notice-line__text">
        {item.title && <div className="notice-line__title">{item.title}</div>}
        <div className="notice-line__body">{item.text}</div>
        {item.detail && (
          <details className="notice-line__details">
            <summary>详情</summary>
            <div>{item.detail}</div>
          </details>
        )}
      </div>
    </div>
  )
}
