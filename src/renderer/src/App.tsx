import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useStore } from './store/useStore'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { RightSidebar } from './components/RightSidebar'
import { ResizableDivider } from './components/ResizableDivider'
import { ConfirmDialog } from './components/ConfirmDialog'
import { StartupAnimation } from './components/StartupAnimation'
import { CursorEffects } from './components/CursorEffects'
import { TaskListPanel } from './components/TaskListPanel'
import { useAppEffects, useConfirmDialog } from './hooks/useAppEffects'

// 懒加载布局组件 — 只有当前模式的布局被加载
const OfficeLayout = lazy(() => import('./components/layouts/OfficeLayout').then(m => ({ default: m.OfficeLayout })))
const CodingLayout = lazy(() => import('./components/layouts/CodingLayout').then(m => ({ default: m.CodingLayout })))
const DesignLayout = lazy(() => import('./components/layouts/DesignLayout').then(m => ({ default: m.DesignLayout })))

// 懒加载弹窗组件 — 首次打开时才加载
const SettingsModal = lazy(() => import('./components/SettingsModal').then(m => ({ default: m.SettingsModal })))
const AgentExpertPanel = lazy(() => import('./components/AgentExpertPanel').then(m => ({ default: m.AgentExpertPanel })))
const MemoryPanel = lazy(() => import('./components/MemoryPanel').then(m => ({ default: m.MemoryPanel })))
const KnowledgePanel = lazy(() => import('./components/KnowledgePanel').then(m => ({ default: m.KnowledgePanel })))
const PlanSpecDialog = lazy(() => import('./components/PlanSpecDialog').then(m => ({ default: m.PlanSpecDialog })))
const TokenStatsModal = lazy(() => import('./components/TokenStatsModal').then(m => ({ default: m.TokenStatsModal })))

// 懒加载输入框 — 1193 行 + 大量 lucide 图标 + agents 数据，首屏不需要
const GlobalChatInput = lazy(() => import('./components/GlobalChatInput').then(m => ({ default: m.GlobalChatInput })))

export default function App(): React.ReactElement {
  const init = useStore((s) => s.init)
  const settings = useStore((s) => s.settings)
  const currentMode = useStore((s) => s.currentMode)
  const [loaded, setLoaded] = useState(false)
  const [animationDone, setAnimationDone] = useState(false)

  // ---- 副作用（键盘快捷键、主题、窗口状态） ----
  useAppEffects(loaded)

  // ---- 危险操作确认弹窗 ----
  const { confirmState, handleConfirm, handleCancel } = useConfirmDialog()

  useEffect(() => {
    void init().then(() => setLoaded(true))
  }, [init])

  // 启动动画完成回调 — useCallback 保证引用稳定
  const handleAnimationComplete = useCallback((): void => setAnimationDone(true), [])

  // 开屏动画总开关 — 关闭时直接进入主界面
  const showStartupAnimation = settings?.startupAnimationEnabled ?? true

  // 开屏动画期间在 <html> 上标记 startup-active，用于隐藏边框光线等
  useEffect(() => {
    const isActive = !animationDone && loaded && !!settings && showStartupAnimation
    document.documentElement.classList.toggle('startup-active', isActive)
  }, [animationDone, loaded, settings, showStartupAnimation])

  // ---- 侧栏拖拽宽度 ----
  const [leftWidth, setLeftWidth] = useState(240)
  const [rightWidth, setRightWidth] = useState(280)

  // 主界面内容
  const mainContent = (loaded && settings) ? (
    <div className="relative flex h-full flex-col overflow-hidden bg-bg-base">
      {/* 极光环境光背景 */}
      <div className="ambient-stage" aria-hidden="true">
        <div className="ambient-orb ambient-orb-1" />
        <div className="ambient-orb ambient-orb-2" />
        <div className="ambient-orb ambient-orb-3" />
      </div>

      <TitleBar />

      {/* 主体区域：左侧边栏 + 主内容区 + 右侧辅助栏 */}
      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        <div style={{ width: `${leftWidth}px`, flexShrink: 0 }} className="h-full">
          <Sidebar />
        </div>
        <ResizableDivider
          side="left"
          width={leftWidth}
          minWidth={180}
          maxWidth={480}
          onResize={setLeftWidth}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <Suspense fallback={null}>
              {currentMode === 'office' && <OfficeLayout />}
              {currentMode === 'coding' && <CodingLayout />}
              {currentMode === 'design' && <DesignLayout />}
            </Suspense>
          </div>
          <TaskListPanel />
          <Suspense fallback={null}>
            <GlobalChatInput />
          </Suspense>
        </div>

        <ResizableDivider
          side="right"
          width={rightWidth}
          minWidth={240}
          maxWidth={800}
          onResize={setRightWidth}
        />
        <div style={{ width: `${rightWidth}px`, flexShrink: 0 }} className="h-full">
          <RightSidebar />
        </div>
      </div>

      {/* 弹窗区 */}
      <Suspense fallback={null}><SettingsModal /></Suspense>
      <Suspense fallback={null}><AgentExpertPanel /></Suspense>
      <Suspense fallback={null}><MemoryPanel /></Suspense>
      <Suspense fallback={null}><KnowledgePanel /></Suspense>
      <Suspense fallback={null}><PlanSpecDialog /></Suspense>
      <ConfirmDialog
        open={confirmState !== null}
        title="确认执行操作"
        message={confirmState?.message ?? ''}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
      <Suspense fallback={null}><TokenStatsModal /></Suspense>

      {/* 鼠标特效全局层 — 跟随 + 点击动画 */}
      <CursorEffects
        enabled={settings.cursorEffectsEnabled ?? false}
        trailStyle={settings.cursorTrailStyle ?? 'trail'}
        clickStyle={settings.cursorClickStyle ?? 'ripple'}
        color={settings.cursorEffectColor ?? ''}
        scale={settings.cursorEffectScale ?? 1}
        intensity={settings.cursorEffectIntensity ?? 1}
        trailCount={settings.cursorTrailCount ?? 20}
        clickCount={settings.cursorClickCount ?? 16}
        duration={settings.cursorEffectDuration ?? 900}
      />
    </div>
  ) : (
    <div className="h-full bg-bg-base" />
  )

  // 启动动画
  if (!animationDone && loaded && settings && showStartupAnimation) {
    return (
      <StartupAnimation onComplete={handleAnimationComplete} config={settings}>
        {mainContent}
      </StartupAnimation>
    )
  }

  return mainContent
}
