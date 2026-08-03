// ── QuestionJumpBar — 问题导航条 + 回到底部按钮 ───────────────────────
// 参考 DeepSeek-Reasonix 的 QuestionJumpBar

import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowDown } from 'lucide-react'
import type { QuestionAnchor } from '@renderer/lib/transcriptGrouping'

interface QuestionJumpBarProps {
  questions: QuestionAnchor[]
  onJump: (question: QuestionAnchor) => void
}

export function QuestionJumpBar({ questions, onJump }: QuestionJumpBarProps): React.ReactElement {
  const [hovered, setHovered] = useState<number | null>(null)
  const [active, setActive] = useState<number | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const previewTop = useRef(0)
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    if (questions.length === 0) return
    setActive(questions[questions.length - 1]?.turn ?? null)
  }, [questions])

  useEffect(() => {
    if (active === null) return
    const el = barRef.current?.querySelector(`[data-turn="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const hoverIdx = hovered !== null ? questions.findIndex((q) => q.turn === hovered) : -1
  const hoveredQuestion = hovered !== null ? questions.find((q) => q.turn === hovered) : undefined

  const closestQuestionFromY = useCallback((clientY: number): { question: QuestionAnchor; previewY: number } | null => {
    const el = barRef.current
    if (!el) return null
    const markers = el.querySelectorAll<HTMLElement>('.jump-item')
    const barRect = el.getBoundingClientRect()
    let closest = -1
    let closestDist = Infinity
    let closestY = 0
    markers.forEach((item, index) => {
      const rect = item.getBoundingClientRect()
      const midY = rect.top + rect.height / 2
      const dist = Math.abs(clientY - midY)
      if (dist < closestDist) {
        closestDist = dist
        closest = index
        closestY = midY - barRect.top
      }
    })
    const question = questions[closest]
    if (!question) return null
    return { question, previewY: closestY }
  }, [questions])

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const closest = closestQuestionFromY(e.clientY)
    if (!closest) return
    previewTop.current = closest.previewY
    setHovered(closest.question.turn)
    setShowPreview(true)
  }

  const scrollTo = (question: QuestionAnchor) => {
    setActive(question.turn)
    onJump(question)
  }

  const onRailMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const closest = closestQuestionFromY(e.clientY)
    if (!closest) return
    e.preventDefault()
    previewTop.current = closest.previewY
    setHovered(closest.question.turn)
    setShowPreview(true)
    scrollTo(closest.question)
  }

  const dotProps = (idx: number, turn: number): { style: React.CSSProperties } => {
    const isActive = active === turn
    if (hoverIdx < 0) {
      return { style: { width: isActive ? 18 : 12, background: isActive ? 'var(--theme-color)' : undefined } }
    }
    const d = Math.abs(idx - hoverIdx)
    const width = d === 0 ? 32 : d === 1 ? 20 : d === 2 ? 14 : isActive ? 18 : 12
    const background = d <= 2 ? undefined : isActive ? 'var(--theme-color)' : undefined
    return { style: { width, transitionDelay: `${d * 20}ms`, background } }
  }

  return (
    <nav
      className="jump-bar"
      ref={barRef}
      aria-label="问题导航"
      onMouseMove={onMove}
      onMouseLeave={() => { setHovered(null); setShowPreview(false) }}
    >
      <div className="jump-scroll" onMouseDown={onRailMouseDown} onClick={onRailMouseDown}>
        {questions.map((question, index) => (
          <button
            className="jump-item"
            key={question.id}
            type="button"
            data-turn={question.turn}
            aria-label={`跳转到问题 ${question.turn + 1}`}
            onMouseDown={(e) => { e.preventDefault(); scrollTo(question) }}
            onClick={(e) => { e.stopPropagation(); if (e.detail === 0) scrollTo(question) }}
          >
            <span className="jump-dot" {...dotProps(index, question.turn)} />
          </button>
        ))}
      </div>
      {showPreview && hoveredQuestion && (
        <div className="jump-preview" style={{ top: previewTop.current }} role="tooltip">
          <span className="jump-text">{hoveredQuestion.text}</span>
        </div>
      )}
    </nav>
  )
}

// ── JumpToBottom — 回到底部按钮 ───────────────────────────────────────

export function JumpToBottom({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      className="transcript__jump-bottom"
      onClick={onClick}
      aria-label="回到底部"
      title="回到底部"
    >
      <ArrowDown size={18} strokeWidth={2.2} aria-hidden="true" />
    </button>
  )
}
