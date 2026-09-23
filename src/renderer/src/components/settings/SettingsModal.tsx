import { useState, useRef, useEffect } from 'react'
import { X, Key, Cpu, Users, Wrench, Gauge, Info } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import type { AppSettings, TestResult, TransitionAnimationFile } from '@shared/types'
import { FALLBACK_SETTINGS, type TabId, type TestState } from './shared-components'
import { ApiTab } from './ApiTab'
import { ModelTab } from './ModelTab'
import { AgentTab } from './AgentTab'
import { ToolsTab } from './ToolsTab'
import { AppearanceTab } from './AppearanceTab'
import { AboutTab } from './AboutTab'

const TABS: { id: TabId; label: string; icon: typeof Key }[] = [
  { id: 'api', label: 'API 配置', icon: Key },
  { id: 'model', label: '模型与推理', icon: Cpu },
  { id: 'agent', label: 'Agent 编排', icon: Users },
  { id: 'tools', label: '工具设置', icon: Wrench },
  { id: 'appearance', label: '外观与数据', icon: Gauge },
  { id: 'about', label: '关于', icon: Info }
]

export function SettingsModal(): React.ReactElement | null {
  const settings = useStore((s) => s.settings)
  const showSettings = useStore((s) => s.showSettings)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const updateSettings = useStore((s) => s.updateSettings)
  const clearAllConversations = useStore((s) => s.clearAllConversations)
  const convoCount = useStore((s) => s.conversations.length)
  const [activeTab, setActiveTab] = useState<TabId>('api')
  const [local, setLocal] = useState<AppSettings>(settings ?? FALLBACK_SETTINGS)
  // localRef 始终指向最新 local — 供事件回调（handleSave）读取，避免闭包捕获旧值
  const localRef = useRef(local)
  localRef.current = local
  const [showKey, setShowKey] = useState(false)

  // 连接测试状态
  const [testState, setTestState] = useState<TestState>('idle')
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  // 导入状态
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 转场样式导入/导出
  const [transitionMsg, setTransitionMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const transitionFileRef = useRef<HTMLInputElement>(null)

  // 每次打开弹窗时同步最新设置
  useEffect(() => {
    if (showSettings && settings) {
      setLocal(settings)
      setTestState('idle')
      setTestResult(null)
      setImportMsg(null)
      setTransitionMsg(null)
    }
  }, [showSettings, settings])

  // 主题色实时预览：选色时即时生效，关闭弹窗时恢复已保存的颜色
  useEffect(() => {
    if (showSettings) {
      document.documentElement.style.setProperty('--theme-color', local.themeColor)
    } else if (settings?.themeColor) {
      document.documentElement.style.setProperty('--theme-color', settings.themeColor)
    }
  }, [showSettings, local.themeColor, settings?.themeColor])

  if (!showSettings || !settings) return null

  const update = (patch: Partial<AppSettings>): void => {
    setLocal({ ...local, ...patch })
  }

  const handleSave = async (): Promise<void> => {
    // 使用函数式更新读取最新 local，避免闭包捕获旧值导致外部设置被覆盖
    await updateSettings(localRef.current)
    setShowSettings(false)
  }

  const handleReset = (): void => {
    setLocal(FALLBACK_SETTINGS)
    setTestState('idle')
    setTestResult(null)
  }

  // 连接测试
  const handleTest = async (): Promise<void> => {
    setTestState('testing')
    setTestResult(null)
    const result = await window.api.chat.test(local.apiKey, local.baseUrl, local.model)
    setTestResult(result)
    setTestState(result.success ? 'success' : 'error')
  }

  // 导出会话
  const handleExport = (): void => {
    const convos = useStore.getState().conversations
    const data = JSON.stringify(convos, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ximo-agent-conversations-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // 导入会话
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (): void => {
      try {
        const parsed = JSON.parse(reader.result as string)
        if (!Array.isArray(parsed)) {
          setImportMsg({ ok: false, text: '文件格式错误：不是有效的会话数组' })
          return
        }
        // 重建 currentConversationIds — 为每个模式找到最近的会话
        // 否则导入后切换模式时 setMode 会用过期的 ID 查找，导致 UI 空白
        const currentConversationIds: Record<string, string | null> = { office: null, coding: null, design: null }
        for (const mode of ['office', 'coding', 'design']) {
          const latest = parsed
            .filter((c: { mode?: string }) => c.mode === mode)
            .sort((a: { updatedAt?: number }, b: { updatedAt?: number }) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0]
          if (latest) currentConversationIds[mode] = latest.id
        }
        useStore.setState({
          conversations: parsed,
          currentConversationId: null,
          currentConversationIds: currentConversationIds as Record<'office' | 'coding' | 'design', string | null>,
        })
        void useStore.getState()._persist()
        setImportMsg({ ok: true, text: `成功导入 ${parsed.length} 个会话` })
      } catch {
        setImportMsg({ ok: false, text: '文件解析失败：不是有效的 JSON' })
      }
    }
    reader.readAsText(file)
    e.target.value = '' // 重置以允许重复导入同一文件
  }

  // 导入转场动画文件
  const handleImportTransition = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (): void => {
      try {
        const parsed = JSON.parse(reader.result as string) as TransitionAnimationFile
        if (!parsed || typeof parsed !== 'object' || !parsed.particleClass || !parsed.css || !parsed.vars) {
          setTransitionMsg({ ok: false, text: '文件格式错误：不是有效的转场动画文件' })
          return
        }
        update({
          burstTransitionStyle: 'custom',
          customTransitionAnimation: JSON.stringify(parsed),
        })
        setTransitionMsg({ ok: true, text: `已导入动画"${parsed.name ?? '未命名'}"，样式已切换为自定义` })
      } catch {
        setTransitionMsg({ ok: false, text: '文件解析失败：不是有效的 JSON' })
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const hasChanges = JSON.stringify(local) !== JSON.stringify(settings)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in"
      onClick={() => setShowSettings(false)}
    >
      <div
        className="glass-panel flex h-[620px] max-h-[85vh] w-[900px] max-w-[94vw] flex-col overflow-hidden animate-fade-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
          <h2 className="text-base font-semibold text-text-primary">设置</h2>
          <button
            onClick={() => setShowSettings(false)}
            className="icon-btn rounded-card p-1.5"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* 左侧标签栏 */}
          <nav className="glass w-44 flex-shrink-0 border-r border-border-subtle p-2">
            {TABS.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`mb-0.5 flex w-full items-center gap-2 rounded-card px-3 py-2 text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              )
            })}
          </nav>

          {/* 右侧内容区 */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {activeTab === 'api' && (
              <ApiTab
                local={local}
                update={update}
                showKey={showKey}
                setShowKey={setShowKey}
                testState={testState}
                testResult={testResult}
                onTest={handleTest}
              />
            )}
            {activeTab === 'model' && <ModelTab local={local} update={update} />}
            {activeTab === 'agent' && <AgentTab local={local} update={update} />}
            {activeTab === 'tools' && <ToolsTab local={local} update={update} />}
            {activeTab === 'appearance' && (
              <AppearanceTab
                local={local}
                update={update}
                onExport={handleExport}
                onImport={handleImport}
                onClearAll={clearAllConversations}
                importMsg={importMsg}
                fileInputRef={fileInputRef}
                convoCount={convoCount}
                transitionFileRef={transitionFileRef}
                transitionMsg={transitionMsg}
                onImportTransition={handleImportTransition}
              />
            )}
            {activeTab === 'about' && <AboutTab />}
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-between border-t border-border-subtle px-5 py-3">
          <button
            onClick={handleReset}
            className="text-xs text-text-muted transition-colors hover:text-text-primary active:scale-[0.97]"
          >
            恢复默认
          </button>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <span className="text-xs text-amber-400/80 animate-pulse-dot">有未保存的更改</span>
            )}
            <button
              onClick={() => setShowSettings(false)}
              className="btn-ghost rounded-panel px-4 py-2 text-sm"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="btn-liquid rounded-panel px-5 py-2 text-sm font-medium"
            >
              保存设置
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
