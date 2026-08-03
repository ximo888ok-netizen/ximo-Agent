import { useState, useMemo } from 'react'
import { Plus, Users, Brain, Library, RefreshCw, BarChart3, Settings, Folder } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { MODE_CONFIGS } from '@renderer/modes'
import { ProjectGroup } from './sidebar/ProjectGroup'
import { ConversationItem } from './sidebar/ConversationItem'

export function Sidebar(): React.ReactElement {
  const allConversations = useStore((s) => s.conversations)
  const currentConversationId = useStore((s) => s.currentConversationId)
  const currentMode = useStore((s) => s.currentMode)
  const newConversation = useStore((s) => s.newConversation)
  const selectConversation = useStore((s) => s.selectConversation)
  const deleteConversation = useStore((s) => s.deleteConversation)
  const renameConversation = useStore((s) => s.renameConversation)
  const reloadConversations = useStore((s) => s.reloadConversations)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const setShowTokenStats = useStore((s) => s.setShowTokenStats)
  const openProject = useStore((s) => s.openProject)
  const memoryEnabled = useStore((s) => s.settings?.memoryEnabled ?? true)
  const collapsedProjects = useStore((s) => s.collapsedProjects)
  const toggleProjectCollapsed = useStore((s) => s.toggleProjectCollapsed)
  const newConversationForProject = useStore((s) => s.newConversationForProject)
  const removeProject = useStore((s) => s.removeProject)

  // 按当前模式过滤会话列表
  const conversations = allConversations.filter((c) => c.mode === currentMode)
  const modeConfig = MODE_CONFIGS[currentMode]

  const isProjectMode = currentMode === 'coding' || currentMode === 'design'

  const handleNew = (): void => {
    if (isProjectMode) {
      void openProject()
    } else {
      newConversation()
    }
  }

  const [contextMenuId, setContextMenuId] = useState<string | null>(null)

  const handleRefresh = async (): Promise<void> => {
    await reloadConversations()
  }

  const handleAgentPanel = (): void => {
    useStore.getState().setShowAgentPanel(true)
  }

  const handleMemory = (): void => {
    useStore.getState().setShowMemoryPanel(true)
  }

  const handleKnowledge = (): void => {
    useStore.getState().setShowKnowledgePanel(true)
  }

  // coding/design 模式：按 projectPath 分组
  const projectGroups = useMemo(() => {
    if (!isProjectMode) return []
    const groups: Record<string, typeof conversations> = {}
    for (const conv of conversations) {
      const path = conv.projectPath || ''
      if (!groups[path]) groups[path] = []
      groups[path].push(conv)
    }
    // 每组内按 updatedAt 降序
    for (const path of Object.keys(groups)) {
      groups[path].sort((a, b) => b.updatedAt - a.updatedAt)
    }
    // 项目按组内最新会话时间降序
    return Object.entries(groups).sort(([, a], [, b]) => {
      const aLatest = a[0]?.updatedAt ?? 0
      const bLatest = b[0]?.updatedAt ?? 0
      return bLatest - aLatest
    })
  }, [conversations, isProjectMode])

  return (
    <aside className="flex h-full w-full flex-col border-r border-border-subtle glass">
      {/* 顶部三按钮 */}
      <div className="flex items-center gap-1.5 px-3 pt-3.5 pb-2">
        <button
          onClick={handleNew}
          className="btn-liquid flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold"
        >
          <Plus size={14} strokeWidth={2.5} />
          {isProjectMode ? '打开项目' : '新建任务'}
        </button>
        <button
          onClick={handleAgentPanel}
          className="btn-ghost flex items-center justify-center rounded-xl px-2 py-2 text-xs"
          title="AI 专家库"
        >
          <Users size={14} />
        </button>
        {memoryEnabled && (
          <button
            onClick={handleMemory}
            className="btn-ghost flex items-center justify-center rounded-xl px-2 py-2 text-xs"
            title="记忆"
          >
            <Brain size={14} />
          </button>
        )}
        {memoryEnabled && (
          <button
            onClick={handleKnowledge}
            className="btn-ghost flex items-center justify-center rounded-xl px-2 py-2 text-xs"
            title="知识库"
          >
            <Library size={14} />
          </button>
        )}
      </div>

      {/* 列表标题 */}
      <div className="flex items-center justify-between px-3.5 pt-3 pb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          {modeConfig.name} · {isProjectMode ? '项目' : '任务'}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            className="icon-btn rounded-md p-1"
            title="刷新列表"
          >
            <RefreshCw size={12} />
          </button>
          {!isProjectMode && (
            <button
              onClick={handleNew}
              className="icon-btn rounded-md p-1"
              title="新增任务"
            >
              <Plus size={12} />
            </button>
          )}
        </div>
      </div>

      {/* 列表内容 */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {isProjectMode ? (
          /* 项目分组列表 */
          <>
            {projectGroups.map(([projectPath, convs]) => {
              const isCollapsed = collapsedProjects[projectPath] ?? false
              const folderName = projectPath ? projectPath.split(/[/\\]/).pop() || projectPath : '未分组'
              return (
                <ProjectGroup
                  key={projectPath || '__ungrouped__'}
                  projectPath={projectPath}
                  folderName={folderName}
                  conversations={convs}
                  isCollapsed={isCollapsed}
                  activeId={currentConversationId}
                  onSelect={selectConversation}
                  onDelete={deleteConversation}
                  onRename={renameConversation}
                  onToggle={toggleProjectCollapsed}
                  onNewConversation={() => newConversationForProject(projectPath)}
                  onRemove={() => removeProject(projectPath)}
                  contextMenuId={contextMenuId}
                  onContextMenu={setContextMenuId}
                />
              )
            })}
            {projectGroups.length === 0 && (
              <div className="mt-8 flex flex-col items-center gap-3 px-4 text-center animate-fade-scale">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent shadow-glow edge-light">
                  <Folder size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <p className="text-xs font-medium text-text-secondary">还没有项目</p>
                  <p className="mt-0.5 text-[11px] text-text-muted">点击上方「打开项目」开始</p>
                </div>
              </div>
            )}
          </>
        ) : (
          /* office 模式：扁平列表 */
          <>
            {conversations.map((conv, idx) => (
              <div
                key={conv.id}
                className="animate-slide-up"
                style={{ animationDelay: `${Math.min(idx * 30, 240)}ms`, animationFillMode: 'backwards' }}
              >
                <ConversationItem
                  conv={conv}
                  activeId={currentConversationId}
                  onSelect={selectConversation}
                  onDelete={deleteConversation}
                  onRename={renameConversation}
                  contextMenuId={contextMenuId}
                  onContextMenu={setContextMenuId}
                />
              </div>
            ))}
            {conversations.length === 0 && (
              <div className="mt-8 flex flex-col items-center gap-3 px-4 text-center animate-fade-scale">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent shadow-glow edge-light">
                  <Plus size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <p className="text-xs font-medium text-text-secondary">还没有任务</p>
                  <p className="mt-0.5 text-[11px] text-text-muted">点击上方「新建任务」开始</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 底部：Token 统计 + 设置按钮 */}
      <div className="flex-shrink-0 border-t border-border-subtle px-3 py-2.5 space-y-1.5">
        <button
          onClick={() => setShowTokenStats(true)}
          className="ios-card flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary active:scale-[0.98]"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <BarChart3 size={13} />
          </span>
          Token 统计
        </button>
        <button
          onClick={() => setShowSettings(true)}
          className="ios-card flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary active:scale-[0.98]"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Settings size={13} />
          </span>
          设置
        </button>
      </div>
    </aside>
  )
}
