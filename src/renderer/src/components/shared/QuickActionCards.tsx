import type React from 'react'
import type { ActionGroup, QuickAction } from '@shared/types'
import { Icon } from '@renderer/components/Icon'

interface QuickActionCardsProps {
  actionGroups: ActionGroup[]
  onAction: (action: QuickAction) => void
}

/**
 * QuickActionCards — 分组快捷操作卡片
 * 将 WelcomeScreen 中的网格替换为分组卡片形式
 */
export function QuickActionCards({ actionGroups, onAction }: QuickActionCardsProps): React.ReactElement {
  return (
    <div className="space-y-6">
      {actionGroups.map((group) => (
        <ActionCategory key={group.category} group={group} onAction={onAction} />
      ))}
    </div>
  )
}

function ActionCategory({ group, onAction }: { group: ActionGroup; onAction: (a: QuickAction) => void }): React.ReactElement {
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        <Icon name={group.icon} size={14} className="text-accent" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">{group.category}</h3>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {group.actions.map((action) => (
          <button
            key={action.id}
            onClick={() => onAction(action)}
            className="ios-card group flex flex-col gap-1.5 p-3.5 text-left"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent transition-all duration-300 group-hover:bg-accent/20 group-hover:shadow-glow group-hover:scale-105">
                <Icon name={action.icon} size={14} />
              </div>
              <span className="text-sm font-medium text-text-primary">{action.label}</span>
            </div>
            {action.description && (
              <p className="text-[11px] leading-tight text-text-muted">{action.description}</p>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
