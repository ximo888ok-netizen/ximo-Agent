import { ArrowLeft, ArrowRight, RotateCw, X, Search, Plus, Loader2 } from 'lucide-react'
import type { TabState, WebviewAPI } from './types'
import { urlToTitle } from './utils'
import { safeCall } from './utils'

interface TabBarProps {
  tabs: TabState[]
  activeTabId: string
  onSelect: (id: string) => void
  onClose: (id: string, e: React.MouseEvent) => void
  onNewTab: (url: string) => void
}

/** 标签栏 */
export function TabBar({ tabs, activeTabId, onSelect, onClose, onNewTab }: TabBarProps): React.ReactElement {
  return (
    <div className="flex items-center gap-0.5 border-b border-border-subtle px-1 pt-1 shrink-0 bg-bg-surface-soft overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          className={`group flex items-center gap-1.5 rounded-t-control px-3 py-1 cursor-pointer max-w-[140px] min-w-[80px] transition-colors ${
            tab.id === activeTabId
              ? 'bg-bg-base text-text-primary border-t border-l border-r border-border-subtle -mb-px'
              : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover-soft'
          }`}
        >
          {tab.loading ? (
            <Loader2 size={11} className="shrink-0 animate-spin" />
          ) : (
            <span className="shrink-0 h-2.5 w-2.5 rounded-full bg-accent/30" />
          )}
          <span className="min-w-0 flex-1 truncate text-caption font-medium" title={tab.url}>
            {tab.title || urlToTitle(tab.url)}
          </span>
          <button
            onClick={(e) => onClose(tab.id, e)}
            className="shrink-0 rounded-control p-0.5 opacity-0 group-hover:opacity-100 hover:bg-bg-hover transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] active:scale-[0.97]"
            title="关闭标签页"
          >
            <X size={11} />
          </button>
        </div>
      ))}
      <button
        onClick={() => onNewTab('https://www.bing.com')}
        className="shrink-0 rounded-control p-1 text-text-muted hover:text-accent hover:bg-bg-hover-soft transition-colors active:scale-[0.97]"
        title="新建标签页"
      >
        <Plus size={13} />
      </button>
    </div>
  )
}

interface UrlBarProps {
  tab: TabState | undefined
  urlInputRef: React.RefObject<HTMLInputElement>
  onNavigate: (url: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onClose: () => void
}

/** URL 导航栏 */
export function UrlBar({ tab, urlInputRef, onNavigate, onKeyDown, onBack, onForward, onReload, onClose }: UrlBarProps): React.ReactElement {
  return (
    <div className="flex items-center gap-1 border-b border-border-subtle px-2 py-1.5 shrink-0">
      <button aria-label="后退" onClick={onBack} disabled={!tab?.canGoBack} className="icon-btn rounded-control p-1 disabled:opacity-30" title="后退">
        <ArrowLeft size={13} />
      </button>
      <button aria-label="前进" onClick={onForward} disabled={!tab?.canGoForward} className="icon-btn rounded-control p-1 disabled:opacity-30" title="前进">
        <ArrowRight size={13} />
      </button>
      <button aria-label="刷新" onClick={onReload} className="icon-btn rounded-control p-1" title="刷新">
        {tab?.loading ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />}
      </button>
      <input
        ref={urlInputRef}
        type="text"
        defaultValue={tab?.url || ''}
        onKeyDown={onKeyDown}
        className="min-w-0 flex-1 rounded-control border border-border-subtle bg-bg-base px-2 py-1 text-caption text-text-primary focus:border-accent/40 focus-ring"
        placeholder="输入 URL 或搜索..."
      />
      <button onClick={() => onNavigate(urlInputRef.current?.value || tab?.url || '')} className="icon-btn rounded-control p-1" title="前往">
        <Search size={13} />
      </button>
      <button aria-label="关闭浏览器" onClick={onClose} className="icon-btn rounded-control p-1 text-red-400 hover:text-red-500" title="关闭浏览器">
        <X size={13} />
      </button>
    </div>
  )
}

interface RecordingBarProps {
  eventCount: number
  requestCount: number
  onStop: () => void
}

/** 录制状态栏 */
export function RecordingBar({ eventCount, requestCount, onStop }: RecordingBarProps): React.ReactElement {
  return (
    <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/8 px-2 py-1 shrink-0">
      <div className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
      </div>
      <span className="text-caption font-medium text-red-400">录制中</span>
      <span className="text-caption text-red-400/70">{eventCount} 步 · {requestCount} 个请求</span>
      <button onClick={onStop} className="ml-auto rounded-control bg-red-500/20 px-2 py-0.5 text-caption font-medium text-red-400 hover:bg-red-500/30 transition-colors active:scale-[0.97]">
        停止并保存
      </button>
    </div>
  )
}

/** webview 操作辅助函数集 */
export function createWebviewOps(getWv: () => HTMLElement | undefined) {
  return {
    goBack: (): void => { safeCall(() => (getWv() as unknown as WebviewAPI | undefined)?.goBack()) },
    goForward: (): void => { safeCall(() => (getWv() as unknown as WebviewAPI | undefined)?.goForward()) },
    reload: (): void => { safeCall(() => (getWv() as unknown as WebviewAPI | undefined)?.reload()) },
  }
}
