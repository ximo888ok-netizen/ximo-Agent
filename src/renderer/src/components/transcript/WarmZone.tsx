import { memo } from 'react'
import { ChevronRight } from 'lucide-react'
import type { TranscriptItem } from '@renderer/lib/transcriptTypes'
import type { TurnGroup } from '@renderer/lib/transcriptGrouping'
import { HOT_TURNS, compactQuestionText, questionAnchorId, partitionTurnItems } from '@renderer/lib/transcriptGrouping'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import { TurnCollapse } from './TurnCollapse'
import { NoticeCard } from './Cards'

export interface WarmZoneProps {
  turnGroups: TurnGroup[]
  expandedWarmTurns: ReadonlySet<number>
  warmStartTurn: number
  warmEndTurn: number
  coldTurnCount: number
  items: readonly TranscriptItem[]
  onToggleColdPage: () => void
  onToggleWarmTurn: (g: number, expand: boolean) => void
}

/** 温区/冷区 — 历史对话折叠显示 */
export const WarmZone = memo(function WarmZone({
  turnGroups, expandedWarmTurns, warmStartTurn, warmEndTurn, coldTurnCount,
  items, onToggleColdPage, onToggleWarmTurn,
}: WarmZoneProps): React.ReactNode {
  const out: React.ReactNode[] = []

  if (coldTurnCount > 0) {
    out.push(
      <button key="cold-load-more" type="button" className="warm-collapse" onClick={onToggleColdPage}>
        显示更早的 {coldTurnCount} 轮对话
      </button>
    )
  }

  if (turnGroups.length > HOT_TURNS) {
    for (let g = warmStartTurn; g < warmEndTurn; g++) {
      const group = turnGroups[g]
      if (!group) continue
      const expanded = expandedWarmTurns.has(g)

      out.push(
        <WarmTurnCard
          key={`warm-${g}`}
          userText={compactQuestionText(group.userItem.text)}
          assistantPreview={group.assistantPreview}
          toolCount={group.toolCount}
          expanded={expanded}
          onToggle={() => onToggleWarmTurn(g, !expanded)}
        >
          {expanded && <WarmTurnItems group={group} items={items} />}
        </WarmTurnCard>
      )
    }
  }

  return <>{out}</>
})

function WarmTurnCard({
  userText, assistantPreview, toolCount, expanded, onToggle, children,
}: {
  userText: string
  assistantPreview: string
  toolCount: number
  expanded: boolean
  onToggle: () => void
  children?: React.ReactNode
}): React.ReactElement {
  return (
    <div className={`warm-turn${expanded ? ' warm-turn--expanded' : ''}`}>
      <button type="button" className="warm-turn__head" onClick={onToggle} aria-expanded={expanded}>
        <span className="warm-turn__chevron">
          <ChevronRight size={13} className={expanded ? 'warm-turn__chevron--open' : ''} />
        </span>
        <span className="warm-turn__preview">{userText}</span>
        <span className="warm-turn__meta">
          {toolCount > 0 && <span>{toolCount} 次工具</span>}
        </span>
      </button>
      {expanded && <div className="warm-turn__content">{children}</div>}
      {!expanded && assistantPreview && (
        <div className="warm-turn__assistant">{assistantPreview}</div>
      )}
    </div>
  )
}

function WarmTurnItems({ group, items }: { group: TurnGroup; items: readonly TranscriptItem[] }): React.ReactNode {
  const turnItems = items.slice(group.startIdx + 1, Math.min(group.endIdx, items.length))
  const segments = partitionTurnItems(turnItems)
  const nodes: React.ReactNode[] = []

  nodes.push(<UserMessage key={group.userItem.id} item={group.userItem} anchorId={questionAnchorId(group.userItem.id)} />)

  segments.forEach((segment) => {
    if (segment.processItems.length > 0) {
      nodes.push(
        <TurnCollapse
          key={`warm-process-${segment.processItems[0].id}`}
          items={segment.processItems}
          durationMs={0}
          hasOutsideContent={segment.outsideItems.length > 0}
        />
      )
    }
    for (const item of segment.outsideItems) {
      if (item.kind === 'notice') {
        nodes.push(<NoticeCard key={item.id} item={item} />)
      } else {
        nodes.push(<AssistantMessage key={item.id} item={{ ...item, reasoning: '', reasoningComplete: true }} />)
      }
    }
  })

  return <>{nodes}</>
}
