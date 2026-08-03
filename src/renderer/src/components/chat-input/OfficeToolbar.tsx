import { FolderOpen, X, Globe, CircleDot, Cpu } from 'lucide-react'
import { SkillPicker } from './SkillPicker'

interface OfficeToolbarProps {
  projectPath: string
  onOpenProject: () => void
  onClearProject: () => void
  browserOpen: boolean
  onToggleBrowser: () => void
  isBrowserRecording: boolean
  onToggleRecording: () => void
  computerUseRunning: boolean
  onToggleComputerUse: () => void
}

/** Office 模式底部工具栏：项目目录 + 内嵌浏览器 + 录制 + 技能 + 操控电脑 */
export function OfficeToolbar({
  projectPath, onOpenProject, onClearProject,
  browserOpen, onToggleBrowser,
  isBrowserRecording, onToggleRecording,
  computerUseRunning, onToggleComputerUse
}: OfficeToolbarProps): React.ReactElement {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <button
        onClick={onOpenProject}
        className="chip flex items-center gap-1 px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary transition-all duration-200 active:scale-95"
      >
        <FolderOpen size={11} />
        {projectPath ? projectPath.split(/[/\\]/).pop() : '打开项目目录'}
      </button>
      {projectPath && (
        <button
          onClick={onClearProject}
          className="text-[11px] text-text-muted hover:text-red-400 transition-colors"
          title="清除路径"
        >
          <X size={11} />
        </button>
      )}
      <span className="mx-1 text-text-muted/30">|</span>

      {/* 内嵌浏览器 */}
      <button
        onClick={onToggleBrowser}
        className={`chip flex items-center gap-1 px-2 py-0.5 text-[11px] transition-all duration-200 active:scale-95 ${
          browserOpen
            ? 'border-accent/30 text-accent bg-accent/10'
            : 'text-text-muted hover:text-text-secondary'
        }`}
        title={browserOpen ? (isBrowserRecording ? '正在录制，点击先保存录制内容' : '关闭内嵌浏览器') : '打开内嵌浏览器'}
      >
        <Globe size={10} />
        浏览器
      </button>

      {/* 录制技能 */}
      <button
        onClick={onToggleRecording}
        disabled={!browserOpen}
        className={`chip flex items-center gap-1 px-2 py-0.5 text-[11px] transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed ${
          isBrowserRecording
            ? 'border-red-500/30 text-red-400 bg-red-500/10'
            : browserOpen
              ? 'text-text-secondary hover:text-red-400 hover:border-red-500/30'
              : ''
        }`}
        title={browserOpen ? (isBrowserRecording ? '停止录制' : '录制浏览器操作') : '需先打开浏览器'}
      >
        <CircleDot size={10} />
        {isBrowserRecording ? '停止录制' : '录制'}
      </button>

      {/* 调用技能 — SkillPicker 自管理状态 */}
      <SkillPicker />

      {/* 操控电脑 */}
      <button
        onClick={() => void onToggleComputerUse()}
        className={`chip flex items-center gap-1.5 px-2 py-0.5 text-[11px] transition-all duration-200 active:scale-95 ${
          computerUseRunning
            ? 'border-green-500/30 text-green-400 bg-green-500/10'
            : 'text-text-muted hover:text-text-secondary'
        }`}
        title={computerUseRunning ? '操控电脑运行中 — 点击关闭' : '启动操控电脑'}
      >
        <Cpu size={10} />
        操控电脑
        <span
          className={`relative inline-flex h-3 w-5 items-center rounded-full transition-colors duration-200 ${
            computerUseRunning ? 'bg-green-500/40' : 'bg-border'
          }`}
        >
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full bg-white transition-transform duration-200 ${
              computerUseRunning ? 'translate-x-2' : 'translate-x-0.5'
            }`}
          />
        </span>
      </button>
    </div>
  )
}
