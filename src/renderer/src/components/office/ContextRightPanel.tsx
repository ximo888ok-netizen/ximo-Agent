import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Plus, Globe, Terminal, FolderOpen, LayoutDashboard, X } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { OfficeOverviewPanel } from './OfficeOverviewPanel'
import { SpinnerBlock } from '@renderer/components/shared/Spinner'

const EmbeddedBrowserPanel = lazy(() => import('./EmbeddedBrowserPanel').then(m => ({ default: m.EmbeddedBrowserPanel })))
const OfficeTerminalPanel = lazy(() => import('./OfficeTerminalPanel').then(m => ({ default: m.OfficeTerminalPanel })))
const OfficeFilePanel = lazy(() => import('./OfficeFilePanel').then(m => ({ default: m.OfficeFilePanel })))

interface PanelDef {
  id: string
  label: string
  icon: LucideIcon
  hint: string
}

/** 「+」可新建的面板 — 三者都走真实通道 */
const PANEL_DEFS: PanelDef[] = [
  { id: 'browser', label: '浏览器', icon: Globe, hint: '浏览及调试网页' },
  { id: 'terminal', label: '终端', icon: Terminal, hint: '执行命令及脚本' },
  { id: 'file', label: '文件', icon: FolderOpen, hint: '浏览和预览任务文件' },
]

const TAB_META: Record<string, { label: string; icon: LucideIcon }> = {
  overview: { label: '概览', icon: LayoutDashboard },
  ...Object.fromEntries(PANEL_DEFS.map((d) => [d.id, { label: d.label, icon: d.icon }])),
}

/**
 * ContextRightPanel — 办公模式右栏工作区
 *
 * 默认是「概览」分层页（任务待办 / 任务产物 / 意识更新），通过左上角「+」按需新建
 * 浏览器 / 终端 / 文件 面板。技能列表已迁出为左栏「能力 · 技能」浮层，不再出现在这里。
 *
 * 面板状态：overview 常驻；browser 由 browserOpen 派生（webview / 抓包 / 录制都挂在它上面，
 * 不能另存一份 tab 状态）；terminal / file 存在 store 的 officePanelTabs 里。
 */
export function ContextRightPanel({ hasConversation: _hasConversation }: { hasConversation: boolean }): React.ReactElement {
  const panelTabs = useStore((s) => s.officePanelTabs)
  const panelActive = useStore((s) => s.officePanelActive)
  const browserOpen = useStore((s) => s.browserOpen)
  const openPanel = useStore((s) => s.openOfficePanel)
  const closePanel = useStore((s) => s.closeOfficePanel)
  const setActive = useStore((s) => s.setOfficePanelActive)
  const [menuOpen, setMenuOpen] = useState(false)

  const tabs = useMemo(() => {
    const list = ['overview', ...panelTabs.filter((t) => t !== 'browser')]
    if (browserOpen) list.push('browser')
    return list
  }, [panelTabs, browserOpen])

  // 当前 tab 被关掉时回落到概览
  const active = tabs.includes(panelActive) ? panelActive : 'overview'

  // 从别处（工具面板 / 斜杠命令）打开内嵌浏览器时，自动切到浏览器 tab，
  // 否则浏览器开了却停在概览页，用户看不到它
  useEffect(() => {
    if (browserOpen) setActive('browser')
  }, [browserOpen, setActive])

  return (
    <aside className="flex h-full w-full flex-col border-l border-border-subtle glass">
      {/* 顶栏：「+ 新建」+ 已打开面板的 tab 条（只有一个面板时不显示 tab 条） */}
      <div className="flex items-center gap-1 border-b border-border-subtle px-1.5 py-1.5 shrink-0">
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={`icon-btn rounded-control p-1 ${menuOpen ? 'bg-bg-hover text-accent' : ''}`}
            title="新建面板"
          >
            <Plus size={13} />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute left-0 top-full z-50 mt-1 w-[248px] rounded-panel border border-border-subtle bg-bg-elevated p-1.5 shadow-glass animate-scale-in">
                <div className="px-2 pb-1 pt-0.5 text-caption text-text-muted">从这里开始</div>
                {PANEL_DEFS.map((def) => {
                  const DefIcon = def.icon
                  const alreadyOpen = tabs.includes(def.id)
                  return (
                    <button
                      key={def.id}
                      onClick={() => { openPanel(def.id); setMenuOpen(false) }}
                      className="flex w-full items-center gap-2 rounded-card px-2 py-2 text-left transition-colors hover:bg-bg-hover active:scale-[0.97]"
                    >
                      <DefIcon size={13} className="shrink-0 text-text-muted" />
                      <span className="text-xs text-text-secondary">{def.label}</span>
                      <span className="ml-auto text-caption text-text-muted">
                        {alreadyOpen ? '已打开' : def.hint}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {tabs.length > 1 && (
          <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
            {tabs.map((id) => {
              const meta = TAB_META[id]
              const TabIcon = meta.icon
              const isActive = id === active
              return (
                <div
                  key={id}
                  className={`group flex shrink-0 items-center rounded-card transition-colors ${
                    isActive ? 'bg-accent/15 text-accent' : 'text-text-muted hover:bg-bg-hover hover:text-text-secondary'
                  }`}
                >
                  <button onClick={() => setActive(id)} className="flex items-center gap-1 py-1 pl-2 pr-1 text-caption">
                    <TabIcon size={11} />
                    {meta.label}
                  </button>
                  {id !== 'overview' && (
                    <button
                      onClick={() => closePanel(id)}
                      className="py-1 pl-0.5 pr-1.5 opacity-0 transition-opacity group-hover:opacity-100 active:scale-[0.97]"
                      title={`关闭${meta.label}`}
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 面板内容 */}
      <div className="flex min-h-0 flex-1 flex-col">
        {active === 'overview' && <OfficeOverviewPanel />}
        {active === 'browser' && (
          <Suspense fallback={<PanelSpinner />}><EmbeddedBrowserPanel /></Suspense>
        )}
        {active === 'terminal' && (
          <Suspense fallback={<PanelSpinner />}><OfficeTerminalPanel /></Suspense>
        )}
        {active === 'file' && (
          <Suspense fallback={<PanelSpinner />}><OfficeFilePanel /></Suspense>
        )}
      </div>
    </aside>
  )
}

function PanelSpinner(): React.ReactElement {
  return <SpinnerBlock className="h-full" />
}
