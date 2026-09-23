import { useState, lazy, Suspense } from 'react'
import { Eye, LayoutGrid } from 'lucide-react'
import { SpinnerBlock } from '@renderer/components/shared/Spinner'

// 懒加载设计组件/风格面板
const DesignTemplatePanel = lazy(() => import('./DesignTemplatePanel').then(m => ({ default: m.DesignTemplatePanel })))
// 懒加载自由画布面板
const FreeCanvas = lazy(() => import('./free-canvas').then(m => ({ default: m.FreeCanvas })))

/** 设计模式右侧面板 — 自由画布 + 组件库 */
export function DesignRightPanel({ hasConversation: _hasConversation }: { hasConversation: boolean }): React.ReactElement {
  const [rightView, setRightView] = useState<'canvas' | 'templates'>('canvas')

  return (
    <aside className="flex h-full w-full flex-col border-l border-border-subtle glass">
      <div className="flex items-center gap-0.5 border-b border-border-subtle px-2 py-1.5 shrink-0">
        <button
          onClick={() => setRightView('canvas')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-card px-3 py-1.5 text-xs font-medium transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] duration-fast ${rightView === 'canvas' ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated-soft'}`}
        >
          <Eye size={13} />画布
        </button>
        <button
          onClick={() => setRightView('templates')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-card px-3 py-1.5 text-xs font-medium transition-[color,background-color,border-color,opacity,transform,box-shadow,filter] duration-fast ${rightView === 'templates' ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated-soft'}`}
        >
          <LayoutGrid size={13} />组件
        </button>
      </div>

      {rightView === 'templates' && (
        <Suspense fallback={<SpinnerBlock className="h-full" />}><DesignTemplatePanel /></Suspense>
      )}
      {rightView === 'canvas' && (
        <Suspense fallback={<SpinnerBlock className="h-full" />}><FreeCanvas /></Suspense>
      )}
    </aside>
  )
}
