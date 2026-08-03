import { memo } from 'react'
import { ChevronRight, ChevronDown, Folder, Plus, X } from 'lucide-react'
import type { Conversation } from '@shared/types'
import { ConversationItem } from './ConversationItem'

interface ProjectGroupProps {
  projectPath: string
  folderName: string
  conversations: Conversation[]
  isCollapsed: boolean
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  onToggle: (projectPath: string) => void
  onNewConversation: () => void
  onRemove: () => void
  contextMenuId: string | null
  onContextMenu: (id: string | null) => void
}

// 项目分组组件
export const ProjectGroup = memo(function ProjectGroup({
  projectPath,
  folderName,
  conversations,
  isCollapsed,
  activeId,
  onSelect,
  onDelete,
  onRename,
  onToggle,
  onNewConversation,
  onRemove,
  contextMenuId,
  onContextMenu
}: ProjectGroupProps): React.ReactElement {
  return (
    <div className="mb-1">
      {/* 项目头部 */}
      <div className="group flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-bg-hover transition-colors">
        <button
          onClick={() => onToggle(projectPath)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          {isCollapsed ? <ChevronRight size={12} className="text-text-muted shrink-0" /> : <ChevronDown size={12} className="text-text-muted shrink-0" />}
          <Folder size={13} className="text-accent shrink-0" />
          <span className="truncate text-xs font-medium text-text-primary">{folderName}</span>
          <span className="shrink-0 text-[10px] text-text-muted">({conversations.length})</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onNewConversation()
          }}
          className="shrink-0 text-text-muted hover:text-accent rounded p-0.5 hover:bg-bg-hover transition-colors"
          title="在此项目下新建会话"
        >
          <Plus size={12} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="shrink-0 text-text-muted hover:text-red-400 rounded p-0.5 hover:bg-bg-hover transition-colors"
          title="从列表中移除项目"
        >
          <X size={12} />
        </button>
      </div>
      {/* 会话列表 */}
      {!isCollapsed && (
        <div className="ml-[18px] border-l border-border-subtle">
          {conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conv={conv}
              activeId={activeId}
              onSelect={onSelect}
              onDelete={onDelete}
              onRename={onRename}
              contextMenuId={contextMenuId}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  )
})
