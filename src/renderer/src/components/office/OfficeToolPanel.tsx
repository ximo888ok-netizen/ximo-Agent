import { useState, useEffect, useMemo } from 'react'
import type React from 'react'
import { useStore } from '@renderer/store/useStore'
import { CircleDot, Play, ListTree, Globe, Camera, Monitor, Radio, Circle, Square } from 'lucide-react'
import type { Skill } from '@shared/types'

/**
 * OfficeToolPanel — 办公模式右侧工具面板
 * 包含：技能录制、技能列表、浏览器工具、抓包分析
 */
export function OfficeToolPanel(): React.ReactElement {
  const sendMessage = useStore((s) => s.sendMessage)
  const [searchQuery, setSearchQuery] = useState('')
  const [skills, setSkills] = useState<Skill[]>([])
  const [isRecording, setIsRecording] = useState(false)
  const [recordingStepCount, setRecordingStepCount] = useState(0)
  const [rrwebEventCount, setRrwebEventCount] = useState(0)

  // 加载技能列表和录制状态
  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const loaded = await window.api.skills.load()
        setSkills(loaded)
        const status = await window.api.skills.recordingStatus()
        setIsRecording(status.isRecording)
        if (status.session) {
          setRecordingStepCount(status.session.steps.length)
        }
        setRrwebEventCount(status.rrwebEventCount)
      } catch { /* ignore */ }
    }
    void load()
    // 定期刷新录制状态
    const interval = setInterval(async () => {
      try {
        const status = await window.api.skills.recordingStatus()
        setIsRecording(status.isRecording)
        if (status.session) {
          setRecordingStepCount(status.session.steps.length)
        }
        setRrwebEventCount(status.rrwebEventCount)
      } catch { /* ignore */ }
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  // 定期刷新技能列表（当流式结束后可能有新技能）
  const isStreaming = useStore((s) => s.isStreaming)
  useEffect(() => {
    if (!isStreaming) {
      window.api.skills.load().then(setSkills).catch(() => {})
    }
  }, [isStreaming])

  const handleSearch = (): void => {
    if (!searchQuery.trim()) return
    sendMessage(`请帮我搜索以下内容：${searchQuery}\n\n请使用 web_search 工具在互联网上搜索，并给出引用来源。`)
    setSearchQuery('')
  }

  // 录制操作
  const handleStartRecording = (): void => {
    sendMessage('请使用 skill_record 工具开始录制技能。先导航到目标页面，然后执行操作序列，最后停止录制。', { skipNetworkHint: true })
  }

  // 停止录制
  const handleStopRecording = (): void => {
    sendMessage('请使用 skill_record(action="stop") 结束录制并生成技能。', { skipNetworkHint: true })
  }

  // 调用已有技能
  const handleInvokeSkill = (skill: Skill): void => {
    sendMessage(`请使用 skill_invoke(skill_name="${skill.name}") 调用已有技能 "${skill.name}"。`, { skipNetworkHint: true })
  }

  // 查看技能列表
  const handleViewSkills = (): void => {
    sendMessage('请使用 skill_record(action="status") 列出所有已保存的技能。', { skipNetworkHint: true })
  }

  // 删除技能
  const handleDeleteSkill = async (skillId: string): Promise<void> => {
    const updated = skills.filter(s => s.id !== skillId)
    setSkills(updated)
    await window.api.skills.save(updated)
  }

  const toolButtons = [
    { section: '电脑操作', tools: [
      { label: '📷 屏幕截图', prompt: '请截取当前屏幕并分析上面的内容。' },
      { label: '🔍 查找窗口', prompt: '请列出当前打开的所有窗口。' },
    ]},
    { section: '浏览器', tools: [
      { label: '🌐 打开网页', prompt: '请用浏览器打开 [URL] 并截图确认。' },
      { label: '📸 页面截图', prompt: '请截取当前浏览器的页面截图。' },
      { label: '📄 获取内容', prompt: '请获取当前页面的文本内容。' },
    ]},
    { section: '抓包与分析', tools: [
      { label: '📋 捕获请求', prompt: '请捕获当前页面的所有网络请求。' },
      { label: '💾 存储检查', prompt: '请检查当前页面的 localStorage/sessionStorage/cookies。' },
      { label: '🪝 JS Hook', prompt: '请在当前页面注入 XHR/Fetch Hook 脚本。' },
      { label: '🔌 API 提取', prompt: '请分析当前页面的 API 端点。' },
    ]},
  ]

  return (
    <div className="glass flex w-72 flex-col border-l border-border-subtle overflow-y-auto">
      {/* 录制状态指示器 */}
      {isRecording && (
        <div className="px-3 py-2.5 bg-red-500/10 border-b border-red-500/20 animate-pulse-subtle">
          <div className="flex items-center gap-2">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </div>
            <span className="text-xs font-medium text-red-400">rrweb 录制中</span>
            <span className="text-[10px] text-red-400/70 ml-auto">{recordingStepCount} 步 · {rrwebEventCount} 事件</span>
          </div>
          <button
            onClick={handleStopRecording}
            className="mt-1.5 w-full flex items-center justify-center gap-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 px-2.5 py-1.5 text-xs text-red-400 transition-all"
          >
            <Square size={11} />
            停止录制并生成技能
          </button>
        </div>
      )}

      {/* 技能录制与复用 */}
      <div className="border-b border-border-subtle">
        <div className="px-3 pt-3 pb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">技能录制与复用</span>
          {!isRecording && (
            <button
              onClick={handleStartRecording}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-accent hover:bg-accent/10 rounded-lg transition-all"
              title="开始录制技能"
            >
              <CircleDot size={11} />
              录制
            </button>
          )}
        </div>

        {/* 已有技能列表 */}
        {skills.length > 0 ? (
          <div className="px-2 pb-2 space-y-1.5 max-h-32 overflow-y-auto">
            {skills.map((skill) => (
              <div
                key={skill.id}
                className="group flex items-center gap-2 rounded-lg px-2.5 py-1.5 bg-bg-hover/50 hover:bg-bg-hover transition-all"
              >
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
                  <Play size={10} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-text-primary truncate">{skill.name}</p>
                  <p className="text-[10px] text-text-muted truncate">{skill.description}</p>
                </div>
                <span className="text-[9px] text-text-muted/60">{skill.invokeCount}次 {skill.rrwebEvents ? '🎬' : '📋'}</span>
                <button
                  onClick={() => handleInvokeSkill(skill)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity icon-btn rounded-md p-1 text-accent hover:bg-accent/10"
                  title={`调用技能 "${skill.name}"`}
                >
                  <Play size={10} />
                </button>
                <button
                  onClick={() => void handleDeleteSkill(skill.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity icon-btn rounded-md p-1 text-text-muted hover:text-red-400"
                  title="删除技能"
                >
                  <span className="text-[10px]">×</span>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-3 pb-2 text-[11px] text-text-muted text-center">
            <p>暂无技能</p>
            <p className="mt-0.5 text-[10px]">点击「录制」开始创建（基于 rrweb 网页录制技术）</p>
          </div>
        )}

        <div className="px-2 pb-1.5 flex gap-1">
          <button
            onClick={handleViewSkills}
            className="chip flex items-center gap-1 px-2 py-1 text-[10px] text-text-secondary hover:text-text-primary hover:border-accent/30 transition-all"
          >
            <ListTree size={10} />
            查看全部
          </button>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="p-3 border-b border-border-subtle">
        <label className="text-[11px] font-medium text-text-muted uppercase tracking-wider mb-1.5 block">快速搜索</label>
        <div className="flex gap-1.5">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="搜索关键词..."
            className="flex-1 rounded-lg border border-border bg-bg-input px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none transition-colors"
          />
          <button
            onClick={handleSearch}
            className="btn-liquid rounded-lg px-3 py-1.5 text-xs font-medium"
          >
            搜索
          </button>
        </div>
      </div>

      {/* 工具分组 */}
      {toolButtons.map((group) => (
        <div key={group.section} className="border-b border-border-subtle last:border-b-0">
          <div className="px-3 pt-3 pb-1.5">
            <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">{group.section}</span>
          </div>
          <div className="px-2 pb-2 space-y-0.5">
            {group.tools.map((tool) => (
              <button
                key={tool.label}
                onClick={() => sendMessage(tool.prompt)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-text-secondary transition-all duration-200 hover:bg-bg-hover hover:text-text-primary hover:translate-x-0.5 text-left"
              >
                {tool.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
