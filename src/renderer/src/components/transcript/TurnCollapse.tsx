import { useState, useEffect, useMemo, useRef } from 'react'
import { ChevronRight } from 'lucide-react'
import type { TranscriptItem, ToolItem, AssistantItem, LiveStream } from '@renderer/lib/transcriptTypes'
import { isCreationGroupableTool, isReadOnlyTool, toolGroupKind, type ToolGroupKind } from '@renderer/lib/transcriptTypes'
import { ToolCard, ToolGroup, ReadOnlyBatch } from './ToolCard'
import { PhaseCard, NoticeCard } from './Cards'
import { ReasoningBody } from './ReasoningText'

export interface TurnCollapseProps {
  items: TranscriptItem[]
  durationMs: number
  turnActive?: boolean
  turnStartAt?: number
  hasOutsideContent?: boolean
  live?: LiveStream
}

/**
 * 过程折叠组件 — 工具调用和推理链自动折叠/展开
 *
 * ## 为什么是扁平的
 *
 * 过程区曾有一版"执行时间线"：一条贯穿轨道 + 每步一个状态节点。它**退掉了**，
 * 因为时间线是**回顾**的隐喻，而这里要表达的是**正在流出**：
 * 轨道与缩进让内容像是"被放进一个容器里"，读起来比内容本身还抢眼；
 * 参考的成熟实现（Claude Code 那类）也都是纯平铺 —— 一条一条往下追加，
 * 没有任何东西固定在某处更新。
 *
 * 于是这里只保留两件事：
 *   · **按发生顺序**依次输出（遍历 displayItems，不重排、不聚合到别处）
 *   · **状态跟着内容走** —— 哪一步在跑，那一步自己带状态（行内文字 + 左侧强调条），
 *     而不是把状态汇总到一个位置
 */
export function TurnCollapse({ items, durationMs, turnActive = false, turnStartAt, hasOutsideContent = true, live }: TurnCollapseProps): React.ReactElement | null {
  const [open, setOpen] = useState(() => !hasOutsideContent)
  const userOverridden = useRef(false)
  const prevRunning = useRef(false)

  const displayItems = useMemo(() => {
    return items.filter((it) => {
      if (it.kind === 'assistant') return Boolean(it.reasoning || (live?.id === it.id && live.reasoning))
      if (it.kind === 'phase') return true
      if (it.kind === 'notice') return true
      if (it.kind !== 'tool') return false
      if (it.name === 'todo_write' || it.name === 'exit_plan_mode') return false
      return true
    })
  }, [items, live?.id, live?.reasoning])

  const hasRunningProcess = displayItems.some((it) => {
    if (it.kind === 'tool') return it.status === 'running'
    if (it.kind !== 'assistant') return false
    if (live?.id === it.id) return !live.reasoningComplete
    return it.streaming && !it.reasoningComplete
  })
  const hasLiveAssistant = displayItems.some((it) => it.kind === 'assistant' && live?.id === it.id)
  const hasRunningWork = turnActive || hasRunningProcess || hasLiveAssistant

  const [, setTick] = useState(0)
  useEffect(() => {
    if (!hasRunningWork) return
    const id = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [hasRunningWork])

  const now = Date.now()
  const runningDurationMs = hasRunningWork
    ? turnStartAt ? Math.max(0, now - turnStartAt)
      : live?.reasoningStartedAt ? Math.max(0, now - live.reasoningStartedAt) : 0
    : 0
  const effectiveDurationMs = hasRunningWork ? Math.max(durationMs, runningDurationMs) : durationMs

  useEffect(() => {
    const wasRunning = prevRunning.current
    prevRunning.current = hasRunningWork
    if (hasRunningWork) {
      if (!wasRunning) userOverridden.current = false
      if (!userOverridden.current) setOpen(true)
    } else if (wasRunning && !userOverridden.current && hasOutsideContent) {
      setOpen(false)
    }
  }, [hasRunningWork, hasOutsideContent])

  if (displayItems.length === 0) return null

  const collapseKind = displayItems.some((it) => it.kind === 'tool') ? 'tool'
    : displayItems.some((it) => it.kind === 'assistant' && Boolean(it.reasoning)) ? 'reasoning' : 'process'

  const seconds = Math.round(effectiveDurationMs / 1000)
  const toolCount = displayItems.reduce((n, it) => n + (it.kind === 'tool' ? 1 : 0), 0)
  const thoughtCount = displayItems.reduce((n, it) => n + (it.kind === 'assistant' ? 1 : 0), 0)
  const countParts: string[] = []
  if (toolCount > 0) countParts.push(`${toolCount} 次工具`)
  if (thoughtCount > 0) countParts.push(`${thoughtCount} 次思考`)
  const baseLabel = hasRunningWork ? (seconds > 0 ? `工作中 · ${seconds}s` : '工作中') : (seconds > 0 ? `已处理 · ${seconds}s` : '已处理')
  const label = countParts.length > 0 ? `${baseLabel} · ${countParts.join(' · ')}` : baseLabel

  const body: React.ReactNode[] = []
  const roBatch: ToolItem[] = []
  const toolBatch: ToolItem[] = []
  let toolBatchKind: ToolGroupKind | null = null

  const flushRO = (): void => {
    if (roBatch.length === 0) return
    body.push(<ReadOnlyBatch key={`rob-${roBatch[0].id}`} items={[...roBatch]} />)
    roBatch.length = 0
  }
  const flushToolBatch = (): void => {
    if (!toolBatchKind || toolBatch.length === 0) return
    body.push(<ToolGroup key={`tg-${toolBatch[0].id}`} kind={toolBatchKind} items={[...toolBatch]} />)
    toolBatch.length = 0
    toolBatchKind = null
  }

  for (const it of displayItems) {
    if (it.kind === 'tool' && isCreationGroupableTool(it as ToolItem)) {
      const kind = toolGroupKind(it as ToolItem)
      if (kind) { if (toolBatchKind && toolBatchKind !== kind) flushToolBatch(); toolBatchKind = kind; toolBatch.push(it as ToolItem); continue }
    }
    if (it.kind !== 'tool') { flushToolBatch(); flushRO() }
    if (it.kind === 'tool' && it.status !== 'running' && isReadOnlyTool(it.name)) { roBatch.push(it as ToolItem); continue }
    if (it.kind === 'tool') { flushToolBatch(); flushRO() }
    switch (it.kind) {
      case 'tool':
        if (it.name === 'todo_write' || it.name === 'exit_plan_mode') break
        body.push(<ToolCard key={it.id} item={it} />)
        break
      case 'phase':
        body.push(<PhaseCard key={it.id} text={it.text} />)
        break
      case 'notice':
        body.push(<NoticeCard key={it.id} item={it} />)
        break
      case 'assistant':
        body.push(<InlineReasoning key={`${it.id}-r`} item={it as AssistantItem} live={live} />)
        break
    }
  }
  flushToolBatch()
  flushRO()

  return (
    <div className={`turn-collapse${open ? ' turn-collapse--open' : ''}`} data-kind={collapseKind}>
      <button
        type="button"
        className="turn-collapse__head"
        onClick={() => { userOverridden.current = true; setOpen((v) => !v) }}
        aria-expanded={open}
      >
        {hasRunningWork && <span className="turn-collapse__live" aria-hidden />}
        <span className="turn-collapse__label">{label}</span>
        <ChevronRight size={13} className={`turn-collapse__chevron${open ? ' turn-collapse__chevron--open' : ''}`} />
      </button>
      <div className="turn-collapse__body">{body}</div>
    </div>
  )
}

/**
 * 内联推理 — 助手消息的思考过程，**直接平铺进流水**。
 *
 * 这里刻意没有分节标题：原先每条带推理的消息都会渲染一个「思考中 / 思考过程」小标题，
 * 一轮里模型交替"推理 → 调工具 → 再推理"时就冒出好几个同名的标题，
 * 读起来像一堆并列的小节，而不是一条连续的思考。
 * 折叠由外层的 TurnCollapse 统一负责，单条推理不需要再自成一节。
 */
export function InlineReasoning({ item, live }: { item: AssistantItem; live?: LiveStream }): React.ReactElement | null {
  const reasoning = (live && live.id === item.id ? live.reasoning : item.reasoning)?.trim()
  if (!reasoning) return null
  const running = live?.id === item.id
    ? !live.reasoningComplete
    : Boolean(item.streaming && !item.reasoningComplete)

  return <ReasoningBody text={reasoning} running={running} />
}
