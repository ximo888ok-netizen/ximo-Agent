// ── Transcript — 会话区主组件 ─────────────────────────────────────────
// 三层分区 (Hot/Warm/Cold) + TurnCollapse 过程折叠 + 滚动管理

import {
  memo, useCallback, useEffect, useLayoutEffect,
  useMemo, useRef, useState, type ReactNode,
} from 'react'
import { ArrowDown } from 'lucide-react'
import type { TranscriptItem, LiveStream } from '@renderer/lib/transcriptTypes'
import {
  HOT_TURNS, WARM_PAGE_SIZE,
  buildTurnGroups, computeHotStartIdx, buildQuestions, questionTurnsById,
  lastQuestionTurn, questionAnchorId,
  warmPagination, createWarmLayerState, warmLayerWithNextColdPage, warmLayerWithExpandedTurn,
  scrollVersion, partitionTurnItems, turnWorkDurationMs,
  type QuestionAnchor, type WarmLayerState,
} from '@renderer/lib/transcriptGrouping'
import { useScrollManager } from '@renderer/lib/useScrollManager'
import { UserMessage } from './UserMessage'
import { LiveAssistantMessage, LiveStreamContext } from './AssistantMessage'
import { TurnActions } from './TurnActions'
import { QuestionJumpBar } from './QuestionJumpBar'
import { TurnCollapse } from './TurnCollapse'
import { WarmZone } from './WarmZone'
import { NoticeCard } from './Cards'

const QUESTION_NAV_MIN_COUNT = 2

interface TranscriptProps {
  items: TranscriptItem[]
  live?: LiveStream
  running?: boolean
  turnStartAt?: number
  onPrompt?: (text: string) => void
  onEditMessage?: (turn: number, text: string) => boolean | void | Promise<boolean | void>
  onRegenerate?: () => void
  canRegenerate?: boolean
  hydrating?: boolean
}

export function Transcript({
  items, live, running = false, turnStartAt, onEditMessage, onRegenerate, canRegenerate = false, hydrating = false,
}: TranscriptProps): React.ReactElement {
  const {
    scrollRef, stick, onScroll, onWheelIntent,
    onTouchStartIntent, onTouchMoveIntent, onKeyScrollIntent,
    isAtBottom, smoothScrollTo, scrollToBottomAfterLayout,
    trackQuestions, scheduleRepinIfWasPinned,
  } = useScrollManager()

  const autoScrollFrame = useRef<number | null>(null)
  const cancelStreamingAutoScroll = useCallback(() => {
    if (autoScrollFrame.current !== null) { cancelAnimationFrame(autoScrollFrame.current); autoScrollFrame.current = null }
  }, [])

  const handleWheelIntent = useCallback((event: React.WheelEvent<HTMLElement>) => { if (onWheelIntent(event)) cancelStreamingAutoScroll() }, [cancelStreamingAutoScroll, onWheelIntent])
  const handleTouchMoveIntent = useCallback((event: React.TouchEvent<HTMLElement>) => { if (onTouchMoveIntent(event)) cancelStreamingAutoScroll() }, [cancelStreamingAutoScroll, onTouchMoveIntent])
  const handleKeyScrollIntent = useCallback((event: React.KeyboardEvent<HTMLElement>) => { if (onKeyScrollIntent(event)) cancelStreamingAutoScroll() }, [cancelStreamingAutoScroll, onKeyScrollIntent])

  const questions = useMemo<QuestionAnchor[]>(() => buildQuestions(items), [items])
  const showQuestionNav = questions.length >= QUESTION_NAV_MIN_COUNT
  useEffect(() => { trackQuestions(questions.length) }, [questions.length, trackQuestions])

  const contentVersion = useMemo(() => scrollVersion(items), [items])
  const liveLenBucket = ((live?.text?.length ?? 0) + (live?.reasoning?.length ?? 0)) >> 4
  useEffect(() => {
    if (items.length === 0 || !stick.current || autoScrollFrame.current !== null) return
    autoScrollFrame.current = requestAnimationFrame(() => {
      autoScrollFrame.current = null
      if (!stick.current) return
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [contentVersion, liveLenBucket, items.length, stick, scrollRef])

  useEffect(() => {
    return () => { if (autoScrollFrame.current !== null) { cancelAnimationFrame(autoScrollFrame.current); autoScrollFrame.current = null } }
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => { if (items.length > 0) scheduleRepinIfWasPinned(0) })
    observer.observe(el)
    return () => observer.disconnect()
  }, [items.length, scheduleRepinIfWasPinned])

  const turnGroups = useMemo(() => buildTurnGroups(items), [items])
  const hotStartIdx = useMemo(() => computeHotStartIdx(items, HOT_TURNS), [items])

  const sessionKey = useMemo(() => `${items[0]?.id ?? ''}|${items[items.length - 1]?.id ?? ''}`, [items])
  const [warmLayerState, setWarmLayerState] = useState<WarmLayerState>(() => createWarmLayerState(sessionKey))
  const activeWarmLayer = warmLayerState.sessionKey === sessionKey ? warmLayerState : createWarmLayerState(sessionKey)
  const { expandedWarmTurns, coldPage } = activeWarmLayer

  const { warmStartTurn, warmEndTurn, coldTurnCount } = useMemo(
    () => warmPagination({ turnCount: turnGroups.length, hotTurns: HOT_TURNS, pageSize: WARM_PAGE_SIZE, coldPage }),
    [coldPage, turnGroups.length],
  )

  const userTurn = useMemo(() => questionTurnsById(questions), [questions])
  const lastTurn = useMemo(() => lastQuestionTurn(questions), [questions])

  const pendingQuestionJump = useRef<QuestionAnchor | null>(null)
  const handleJumpToQuestion = useCallback((question: QuestionAnchor) => {
    pendingQuestionJump.current = question
    const warmTurnStart = turnGroups.length - HOT_TURNS
    if (question.turn < warmTurnStart) {
      setWarmLayerState((prev) => warmLayerWithExpandedTurn(warmLayerWithNextColdPage(prev, sessionKey), sessionKey, question.turn, true))
    }
    const node = document.getElementById(questionAnchorId(question.id))
    if (node) { stick.current = false; smoothScrollTo(node, 12) }
  }, [turnGroups.length, sessionKey, smoothScrollTo, stick])

  const empty = items.length === 0
  const liveId = live?.id
  const liveHasAnswerText = Boolean(live?.text.trim())
  const liveHasReasoning = Boolean(live?.reasoning)

  const hotZoneNodes = useMemo<ReactNode[]>(() => {
    const out: ReactNode[] = []

    const pushTurnActions = (turn: number | undefined, turnItems: readonly TranscriptItem[]) => {
      if (turn == null) return
      let actionText = ''
      for (const item of turnItems) {
        if (item.kind !== 'assistant' || item.streaming || !item.text.trim()) continue
        actionText += item.text
      }
      if (!actionText.trim()) return
      out.push(<TurnActions key={`ta-${turn}`} text={actionText} canRegenerate={canRegenerate && turn === lastTurn && !running} onRegenerate={onRegenerate} />)
    }

    const pushTurnBody = (key: string, turnItems: readonly TranscriptItem[], turnIsActive: boolean) => {
      const segments = partitionTurnItems(turnItems, liveId, liveHasAnswerText, liveHasReasoning)
      const turnHasOutsideContent = segments.some((s) => s.outsideItems.length > 0)
      segments.forEach((segment, segmentIndex) => {
        const isLastSegment = segmentIndex === segments.length - 1
        if (segment.processItems.length > 0) {
          out.push(
            <TurnCollapse
              key={`turn-process-${key}-${segment.processItems[0].id}`}
              items={segment.processItems}
              durationMs={isLastSegment ? turnWorkDurationMs(turnItems) : 0}
              turnActive={turnIsActive && isLastSegment}
              turnStartAt={turnIsActive && isLastSegment ? turnStartAt : undefined}
              hasOutsideContent={turnHasOutsideContent}
              live={live}
            />
          )
        }
        for (const item of segment.outsideItems) {
          if (item.kind === 'notice') {
            out.push(<NoticeCard key={item.id} item={item} />)
          } else {
            out.push(
              <LiveAssistantMessage
                key={item.id}
                item={{ ...item, reasoning: '', reasoningComplete: true }}
                defaultExpanded={false}
                expandWhileStreaming={false}
                truncateStreamingReasoning={true}
              />
            )
          }
        }
      })
    }

    const hotGroups = turnGroups.filter((g) => g.startIdx >= hotStartIdx)
    const firstHotStart = hotGroups[0]?.startIdx ?? items.length
    if (hotStartIdx < firstHotStart) pushTurnBody('prelude', items.slice(hotStartIdx, firstHotStart), false)

    for (let index = 0; index < hotGroups.length; index++) {
      const group = hotGroups[index]
      const user = group.userItem
      if (user.kind !== 'user') continue
      const turn = userTurn.get(user.id)
      const turnItems = items.slice(group.startIdx + 1, group.endIdx)
      const turnIsActive = running && index === hotGroups.length - 1
      out.push(<UserMessage key={user.id} item={user} anchorId={questionAnchorId(user.id)} turn={turn} onEdit={onEditMessage} />)
      pushTurnBody(user.id, turnItems, turnIsActive)
      if (!turnIsActive) pushTurnActions(turn, turnItems)
    }

    return out
  }, [hotStartIdx, items, turnGroups, userTurn, running, turnStartAt, live, liveId, liveHasAnswerText, liveHasReasoning, onEditMessage, onRegenerate, canRegenerate, lastTurn])

  useLayoutEffect(() => {
    if (!empty) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = 0
    stick.current = false
  }, [empty, scrollRef, stick])

  return (
    <LiveStreamContext.Provider value={live}>
      <div className="transcript-shell">
        <div
          className={`transcript${empty ? ' transcript--empty' : ''}`}
          ref={scrollRef}
          onScroll={onScroll}
          onWheelCapture={handleWheelIntent}
          onTouchStartCapture={onTouchStartIntent}
          onTouchMoveCapture={handleTouchMoveIntent}
          onKeyDownCapture={handleKeyScrollIntent}
        >
          {turnGroups.length > HOT_TURNS && (
            <WarmZone
              turnGroups={turnGroups}
              expandedWarmTurns={expandedWarmTurns}
              warmStartTurn={warmStartTurn}
              warmEndTurn={warmEndTurn}
              coldTurnCount={coldTurnCount}
              items={items}
              onToggleColdPage={() => setWarmLayerState((prev) => warmLayerWithNextColdPage(prev, sessionKey))}
              onToggleWarmTurn={(g, expand) => setWarmLayerState((prev) => warmLayerWithExpandedTurn(prev, sessionKey, g, expand))}
            />
          )}
          {hotZoneNodes}
        </div>

        {!empty && showQuestionNav && (
          <QuestionJumpBar questions={questions} onJump={handleJumpToQuestion} />
        )}

        {!empty && !isAtBottom && (
          <button
            type="button"
            className="transcript__jump-bottom"
            onClick={() => scrollToBottomAfterLayout(2)}
            aria-label="回到底部"
            title="回到底部"
          >
            <ArrowDown size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
        )}
      </div>
    </LiveStreamContext.Provider>
  )
}
