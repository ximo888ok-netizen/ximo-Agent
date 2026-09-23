import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useStore } from './store/useStore'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { RightSidebar } from './components/RightSidebar'
import { ResizableDivider } from './components/ResizableDivider'
import { ConfirmDialog } from './components/ConfirmDialog'
import { StartupAnimation } from './components/startup/StartupAnimation'
import { CursorEffects } from './components/startup/CursorEffects'
import { VoiceOrb } from './components/voice/VoiceOrb'
import { useAppEffects, useConfirmDialog } from './hooks/useAppEffects'

// 懒加载布局组件 — 只有当前模式的布局被加载
const OfficeLayout = lazy(() => import('./components/layouts/OfficeLayout').then(m => ({ default: m.OfficeLayout })))
const CodingLayout = lazy(() => import('./components/layouts/CodingLayout').then(m => ({ default: m.CodingLayout })))
const DesignLayout = lazy(() => import('./components/layouts/DesignLayout').then(m => ({ default: m.DesignLayout })))

// 懒加载弹窗组件 — 首次打开时才加载
const SettingsModal = lazy(() => import('./components/settings/SettingsModal').then(m => ({ default: m.SettingsModal })))
const AgentExpertPanel = lazy(() => import('./components/panels/AgentExpertPanel').then(m => ({ default: m.AgentExpertPanel })))
const MemoryPanel = lazy(() => import('./components/panels/MemoryPanel').then(m => ({ default: m.MemoryPanel })))
const KnowledgePanel = lazy(() => import('./components/panels/KnowledgePanel').then(m => ({ default: m.KnowledgePanel })))
const McpPanel = lazy(() => import('./components/panels/McpPanel').then(m => ({ default: m.McpPanel })))
const SkillPanel = lazy(() => import('./components/panels/SkillPanel').then(m => ({ default: m.SkillPanel })))
const PlanSpecDialog = lazy(() => import('./components/panels/PlanSpecDialog').then(m => ({ default: m.PlanSpecDialog })))
const TokenStatsModal = lazy(() => import('./components/panels/TokenStatsModal').then(m => ({ default: m.TokenStatsModal })))

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

  // 通知主进程显示窗口 — 等 React 渲染好开屏动画/主界面且浏览器完成绘制后再 show，
  // 避免出现黑窗（ready-to-show 时 React 尚未挂载，只看到空暗色占位）
  // 双层 rAF：第一帧在 commit 后、paint 前；第二帧在 paint 后，确保新帧已上屏
  useEffect(() => {
    if (loaded && settings) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void window.api.window.ready()
        })
      })
    }
  }, [loaded, settings])

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
  // 窄窗口降级要在 resize 回调里读到最新宽度（effect 只注册一次，不能闭包捕获初值）
  const leftWidthRef = useRef(leftWidth)
  leftWidthRef.current = leftWidth

  // ---- 右侧栏收起状态 ----
  const rightPanelCollapsed = useStore((s) => s.rightPanelCollapsed)
  const setRightPanelCollapsed = useStore((s) => s.setRightPanelCollapsed)
  const browserOpen = useStore((s) => s.browserOpen)
  const collapseRightPanel = useCallback((): void => setRightPanelCollapsed(true), [setRightPanelCollapsed])
  const expandRightPanel = useCallback((): void => setRightPanelCollapsed(false), [setRightPanelCollapsed])

  // 确认弹窗的「不再提示」直接切换自动化等级 —— 不再走 sessionStorage 私标记，
  // 避免出现"输入框选了手动审批、弹窗却照样不弹"的第二套真相
  const setAutoModeLevel = useStore((s) => s.setAutoModeLevel)

  // 内嵌浏览器由右栏承载（webview + 抓包 + 录制），收起会让它卸载并丢失录制现场，
  // 因此浏览器开启期间锁定为展开态 — 对应「工具在跑就展开，不跑就收着」
  const rightPanelHidden = rightPanelCollapsed && !browserOpen

  // ---- 窄窗口降级 ----
  // 全仓原先 0 个尺寸断点：窗口窄化时左右栏固定占用，会话区被压到不可用。
  // 桌面应用的布局宽度由状态驱动（不是 CSS 栅格），所以用窗口宽度驱动状态，
  // 而不是媒体查询。只在"变窄"时收敛，用户手动拖宽的值记下来，窗口恢复到
  // 阈值以上时还原 —— 避免把用户的偏好永久改掉。
  const NARROW_WIDTH = 1100
  const NARROW_SIDEBAR = 180
  const widthBeforeNarrowRef = useRef<number | null>(null)

  useEffect(() => {
    const apply = (): void => {
      const narrow = window.innerWidth < NARROW_WIDTH
      document.documentElement.classList.toggle('window-narrow', narrow)
      if (narrow) {
        if (widthBeforeNarrowRef.current === null) widthBeforeNarrowRef.current = leftWidthRef.current
        setRightPanelCollapsed(true)
        if (leftWidthRef.current > NARROW_SIDEBAR) setLeftWidth(NARROW_SIDEBAR)
      } else if (widthBeforeNarrowRef.current !== null) {
        setLeftWidth(widthBeforeNarrowRef.current)
        widthBeforeNarrowRef.current = null
      }
    }
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
  }, [setRightPanelCollapsed])

  // 空会话 → 会话区与输入框作为一组垂直居中；一旦产生消息，输入框立刻沉到底部
  const hasMessages = useStore(
    (s) => (s.conversations.find((c) => c.id === s.currentConversationId)?.messages.length ?? 0) > 0
  )

  // 切换模式时不再自动展开右栏 —— 三模式统一默认收起，需要时用右上角按钮 / Ctrl+B 展开

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

        <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${hasMessages ? '' : 'justify-center'}`}>
          <div className={`flex min-h-0 min-w-0 flex-col overflow-hidden ${hasMessages ? 'flex-1' : 'shrink-0'}`}>
            <Suspense fallback={null}>
              {currentMode === 'office' && <OfficeLayout />}
              {currentMode === 'coding' && <CodingLayout />}
              {currentMode === 'design' && <DesignLayout />}
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <GlobalChatInput emptyState={!hasMessages} />
          </Suspense>
        </div>

        {rightPanelHidden ? (
          /* 收起态 — 保留 24px 窄条作为展开入口，避免用户找不到如何唤回 */
          <button aria-label="展开右侧栏 (Ctrl+B)"
            onClick={expandRightPanel}
            title="展开右侧栏 (Ctrl+B)"
            className="group flex h-full w-6 shrink-0 flex-col items-center justify-center border-l border-border-subtle glass text-text-muted transition-colors hover:text-accent active:scale-[0.97]"
          >
            <ChevronLeft size={13} className="transition-transform duration-fast group-hover:-translate-x-0.5" />
          </button>
        ) : (
          <>
            <ResizableDivider
              side="right"
              width={rightWidth}
              minWidth={240}
              maxWidth={800}
              onResize={setRightWidth}
              snapThreshold={browserOpen ? undefined : 200}
              onSnapCollapse={browserOpen ? undefined : collapseRightPanel}
              onCollapseClick={browserOpen ? undefined : collapseRightPanel}
              collapseTitle="收起右侧栏 (Ctrl+B)"
            />
            <div style={{ width: `${rightWidth}px`, flexShrink: 0 }} className="h-full">
              <RightSidebar />
            </div>
          </>
        )}
      </div>

      {/* 弹窗区 */}
      <Suspense fallback={null}><SettingsModal /></Suspense>
      <Suspense fallback={null}><AgentExpertPanel /></Suspense>
      <Suspense fallback={null}><MemoryPanel /></Suspense>
      <Suspense fallback={null}><KnowledgePanel /></Suspense>
      <Suspense fallback={null}><McpPanel /></Suspense>
      <Suspense fallback={null}><SkillPanel /></Suspense>
      <Suspense fallback={null}><PlanSpecDialog /></Suspense>
      <ConfirmDialog
        open={confirmState !== null}
        title="确认执行操作"
        message={confirmState?.message ?? ''}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        onRemember={() => setAutoModeLevel('yolo')}
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

      {/* 悬浮语音圆球 — STT 输入 + TTS 播报 */}
      <VoiceOrb />
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
