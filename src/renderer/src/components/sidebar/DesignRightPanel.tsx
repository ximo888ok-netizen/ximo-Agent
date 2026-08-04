import { useState, lazy, Suspense } from 'react'
import { Eye, LayoutGrid } from 'lucide-react'

// 懒加载设计组件/风格面板
const DesignTemplatePanel = lazy(() => import('../design/DesignTemplatePanel').then(m => ({ default: m.DesignTemplatePanel })))
// 懒加载自由画布面板
const FreeCanvas = lazy(() => import('../design/free-canvas').then(m => ({ default: m.FreeCanvas })))

/** 设计模式右侧面板 — 自由画布 + 组件库 */
export function DesignRightPanel({ hasConversation: _hasConversation }: { hasConversation: boolean }): React.ReactElement {
  const [rightView, setRightView] = useState<'canvas' | 'templates'>('canvas')

  return (
    <aside className="flex h-full w-full flex-col border-l border-border-subtle glass">
      {/* 视图切换栏 */}
      <div className="flex items-center gap-0.5 border-b border-border-subtle px-2 py-1.5 shrink-0">
        <button
          onClick={() => setRightView('canvas')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
            rightView === 'canvas' ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated/50'
          }`}
        >
          <Eye size={13} />
          画布
        </button>
        <button
          onClick={() => setRightView('templates')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
            rightView === 'templates' ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated/50'
          }`}
        >
          <LayoutGrid size={13} />
          组件
        </button>
      </div>

      {/* 组件视图 */}
      {rightView === 'templates' && (
        <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-accent/20 border-t-accent" /></div>}>
          <DesignTemplatePanel />
        </Suspense>
      )}

      {/* 自由画布视图 */}
      {rightView === 'canvas' && (
        <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-accent/20 border-t-accent" /></div>}>
          <FreeCanvas />
        </Suspense>
      )}
    </aside>
  )
}
