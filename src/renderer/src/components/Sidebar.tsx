import { useState, useMemo, useRef } from 'react'
import { Plus, Users, Brain, Library, Server, Puzzle, RefreshCw, BarChart3, Settings, Folder } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { MODE_CONFIGS } from '@renderer/modes'
import { ProjectGroup } from './sidebar/ProjectGroup'
import { ConversationItem } from './sidebar/ConversationItem'
import { SidebarNavItem } from './sidebar/SidebarNavItem'
import { useSidebarNavCounts } from './sidebar/useSidebarNavCounts'

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
  const activeExperts = useStore((s) => s.activeExperts)
  // 导航项右侧徽标的真实计数（记忆行数 / 知识库条数 / MCP 启用数 / 技能数）
  const counts = useSidebarNavCounts()
  // 技能 = 导入 + 录制两套存储之和（悬停提示里给出分解）
  const skillTotal = counts.skillImported === null && counts.skillRecorded === null
    ? null
    : (counts.skillImported ?? 0) + (counts.skillRecorded ?? 0)
  const collapsedProjects = useStore((s) => s.collapsedProjects)
  const toggleProjectCollapsed = useStore((s) => s.toggleProjectCollapsed)
  const newConversationForProject = useStore((s) => s.newConversationForProject)
  const removeProject = useStore((s) => s.removeProject)

  // 按当前模式过滤会话列表 — useMemo 避免每次 store 更新都重新 filter
  const conversations = useMemo(
    () => allConversations.filter((c) => c.mode === currentMode),
    [allConversations, currentMode],
  )
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

  // 交错动画仅在首次挂载播放，后续 re-render 不重播
  const mountedRef = useRef(false)
  const shouldAnimateList = !mountedRef.current
  mountedRef.current = true

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

  const handleMcp = (): void => {
    useStore.getState().setShowMcpPanel(true)
  }

  const handleSkill = (): void => {
    useStore.getState().setShowSkillPanel(true)
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
      {/* 主操作 */}
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={handleNew}
          className="btn-liquid flex w-full items-center justify-center gap-1.5 rounded-panel px-2 py-2 text-xs font-semibold"
        >
          <Plus size={13} strokeWidth={2} />
          {isProjectMode ? '打开项目' : '新建任务'}
        </button>
      </div>

      {/* 导航 · 上下文组 — 跟随当前任务 */}
      <div className="px-2 pb-1">
        <div className="flex items-baseline gap-1.5 px-2 pb-0.5">
          <span className="text-caption text-text-muted">上下文</span>
          <span className="text-caption text-text-quaternary">跟随当前任务</span>
        </div>
        <SidebarNavItem
          icon={Brain}
          label="记忆"
          onClick={handleMemory}
          badge={!memoryEnabled ? '已关闭' : counts.memoryLines === null ? undefined : counts.memoryLines > 0 ? `${counts.memoryLines} 行` : '空'}
          tone={memoryEnabled ? 'default' : 'off'}
          title={memoryEnabled ? '打开记忆面板' : '记忆已关闭 — 可在面板中重新开启'}
        />
        <SidebarNavItem
          icon={Library}
          label="知识库"
          onClick={handleKnowledge}
          badge={counts.knowledgeTotal === null ? undefined : String(counts.knowledgeTotal)}
          title="打开知识库面板"
        />
      </div>

      {/* 导航 · 能力组 — 全局配置，与任务无关 */}
      <div className="border-t border-border-subtle px-2 pt-1.5 pb-1">
        <div className="flex items-baseline gap-1.5 px-2 pb-0.5">
          <span className="text-caption text-text-muted">能力</span>
          <span className="text-caption text-text-quaternary">全局配置</span>
        </div>
        <SidebarNavItem
          icon={Users}
          label="专家库"
          onClick={handleAgentPanel}
          badge={activeExperts.length > 0 ? `已激活 ${activeExperts.length}` : undefined}
          tone="accent"
          title="打开 AI 专家库"
        />
        <SidebarNavItem
          icon={Server}
          label="MCP 服务器"
          onClick={handleMcp}
          badge={counts.mcpTotal === null || counts.mcpTotal === 0 ? undefined : `${counts.mcpEnabled}/${counts.mcpTotal}`}
          tone={counts.mcpTotal !== null && counts.mcpTotal > 0 && counts.mcpEnabled !== counts.mcpTotal ? 'warn' : 'default'}
          title="管理 MCP 服务器"
        />
        <SidebarNavItem
          icon={Puzzle}
          label="技能"
          onClick={handleSkill}
          badge={skillTotal === null ? undefined : String(skillTotal)}
          title={
            counts.skillImported === null && counts.skillRecorded === null
              ? '管理技能'
              : `导入 ${counts.skillImported ?? 0} 个 · 录制 ${counts.skillRecorded ?? 0} 个`
          }
        />
      </div>

      {/* 列表标题 */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
        <span className="text-caption font-semibold uppercase tracking-wider text-text-muted">
          {modeConfig.name} · {isProjectMode ? '项目' : '任务'}
        </span>
        <div className="flex items-center gap-1">
          <button aria-label="刷新列表"
            onClick={handleRefresh}
            className="icon-btn rounded-control p-1"
            title="刷新列表"
          >
            <RefreshCw size={13} />
          </button>
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
                <div className="flex h-12 w-12 items-center justify-center rounded-panel bg-accent/10 text-accent shadow-glow edge-light">
                  <Folder size={20} strokeWidth={2} />
                </div>
                <div>
                  <p className="text-xs font-medium text-text-secondary">还没有项目</p>
                  <p className="mt-0.5 text-caption text-text-muted">点击上方「打开项目」开始</p>
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
                className={shouldAnimateList ? 'animate-slide-up' : ''}
                style={shouldAnimateList ? { animationDelay: `${Math.min(idx * 30, 240)}ms`, animationFillMode: 'backwards' } : undefined}
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
                <div className="flex h-12 w-12 items-center justify-center rounded-panel bg-accent/10 text-accent shadow-glow edge-light">
                  <Plus size={20} strokeWidth={2} />
                </div>
                <div>
                  <p className="text-xs font-medium text-text-secondary">还没有任务</p>
                  <p className="mt-0.5 text-caption text-text-muted">点击上方「新建任务」开始</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 底部：Token 统计 + 设置按钮 */}
      <div className="flex-shrink-0 border-t border-border-subtle px-3 py-2 space-y-1.5">
        <button
          onClick={() => setShowTokenStats(true)}
          className="ios-card flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary active:scale-[0.98]"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-card bg-accent/10 text-accent">
            <BarChart3 size={13} />
          </span>
          Token 统计
        </button>
        <button
          onClick={() => setShowSettings(true)}
          className="ios-card flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary active:scale-[0.98]"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-card bg-accent/10 text-accent">
            <Settings size={13} />
          </span>
          设置
        </button>
      </div>
    </aside>
  )
}
