import { useState, useEffect, useRef } from 'react'
import { Cpu, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'
import {
  SectionTitle,
  Divider,
  InfoCard,
  FeatureRow,
  LinkRow
} from './shared-components'
import { formatBytes } from '@shared/utils'

type UpdateState = 'idle' | 'checking' | 'up-to-date' | 'downloading' | 'downloaded' | 'error'

export function AboutTab(): React.ReactElement {
  const [updateState, setUpdateState] = useState<UpdateState>('idle')
  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion?: string
    latestVersion?: string
    downloadUrl?: string
    giteeDownloadUrl?: string
    fileName?: string
    fileSize?: number
    error?: string
    switchMessage?: string
  }>({})
  const [progress, setProgress] = useState({ downloaded: 0, total: 0 })
  const [appVersion, setAppVersion] = useState('加载中...')
  const filePathRef = useRef<string>('')
  const hasAutoStartedRef = useRef(false)

  // 获取应用版本
  useEffect(() => {
    window.api.getVersion().then(setAppVersion).catch(() => setAppVersion('未知'))
  }, [])

  // 注册下载进度事件监听器
  useEffect(() => {
    const unsubProgress = window.api.update.onProgress((data) => {
      setProgress(data)
    })
    const unsubComplete = window.api.update.onDownloadComplete((data) => {
      filePathRef.current = data.filePath
      setUpdateState('downloaded')
    })
    const unsubSwitch = window.api.update.onDownloadSwitch((data) => {
      setUpdateInfo((prev) => ({ ...prev, switchMessage: data.message }))
    })
    return () => {
      unsubProgress()
      unsubComplete()
      unsubSwitch()
    }
  }, [])

  // 下载完成后自动安装
  useEffect(() => {
    if (updateState === 'downloaded' && !hasAutoStartedRef.current) {
      hasAutoStartedRef.current = true
      window.api.update.install(filePathRef.current).catch(() => {
        setUpdateInfo((prev) => ({ ...prev, error: '无法启动安装程序，请手动运行下载的文件' }))
        setUpdateState('error')
      })
    }
  }, [updateState])

  const handleCheckUpdate = async (): Promise<void> => {
    setUpdateState('checking')
    hasAutoStartedRef.current = false
    try {
      const result = await window.api.update.check()
      if (result.success) {
        if (result.hasUpdate) {
          setUpdateInfo({
            currentVersion: result.currentVersion,
            latestVersion: result.latestVersion,
            downloadUrl: result.downloadUrl,
            giteeDownloadUrl: result.giteeDownloadUrl,
            fileName: result.fileName,
            fileSize: result.fileSize
          })
          // 自动开始下载
          startDownload(result.downloadUrl ?? '', result.giteeDownloadUrl ?? '', result.fileSize ?? 0)
        } else {
          setUpdateInfo({ currentVersion: result.currentVersion })
          setUpdateState('up-to-date')
        }
      } else {
        setUpdateInfo({ error: result.error })
        setUpdateState('error')
      }
    } catch {
      setUpdateInfo({ error: '检查更新失败，请检查网络连接' })
      setUpdateState('error')
    }
  }

  const startDownload = async (downloadUrl: string, fallbackUrl: string, fileSize: number): Promise<void> => {
    if (!downloadUrl) return
    setUpdateState('downloading')
    setProgress({ downloaded: 0, total: fileSize })
    try {
      const result = await window.api.update.download(downloadUrl, fallbackUrl)
      if (!result.success) {
        setUpdateInfo((prev) => ({ ...prev, error: result.error ?? '下载失败' }))
        setUpdateState('error')
      }
    } catch {
      setUpdateInfo((prev) => ({ ...prev, error: '下载失败，请检查网络连接' }))
      setUpdateState('error')
    }
  }

  const progressPercent = progress.total > 0
    ? Math.round((progress.downloaded / progress.total) * 100)
    : 0

  return (
    <div className="space-y-5">
      {/* 应用信息 */}
      <div className="flex items-center gap-4 rounded-xl border border-border bg-bg-elevated p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-muted shadow-lg shadow-accent/20">
          <Cpu size={28} className="text-white" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-text-primary">XimoAgent</h3>
          <p className="text-sm text-text-secondary">DeepSeek-V4 全能 Agent 工作台</p>
          <p className="mt-0.5 text-xs text-text-muted">版本 {appVersion} · MIT License</p>
        </div>
      </div>

      {/* 检查更新 */}
      <SectionTitle title="版本更新" desc="检查 GitHub Releases 是否有新版本" />
      <div className="space-y-3">
        <button
          onClick={handleCheckUpdate}
          disabled={updateState === 'checking' || updateState === 'downloading'}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-bg-elevated px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={15} className={updateState === 'checking' ? 'animate-spin' : ''} />
          {updateState === 'checking' ? '正在检查...' : '检查更新'}
        </button>

        {updateState === 'up-to-date' && (
          <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-sm text-green-400">
            <CheckCircle size={15} />
            已是最新版本 v{updateInfo.currentVersion}
          </div>
        )}

        {updateState === 'downloading' && (
          <div className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-3">
            <div className="flex items-center gap-2 mb-1.5">
              <RefreshCw size={13} className="animate-spin text-accent" />
              <span className="text-sm font-medium text-accent">
                正在下载 v{updateInfo.latestVersion}...
              </span>
            </div>
            {updateInfo.switchMessage && (
              <p className="mb-1.5 text-xs text-yellow-400">{updateInfo.switchMessage}</p>
            )}
            <div className="h-2 w-full rounded-full bg-bg-base overflow-hidden mb-1.5">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-text-muted">
              <span>{progressPercent}%</span>
              <span>
                {formatBytes(progress.downloaded)}
                {progress.total > 0 ? ` / ${formatBytes(progress.total)}` : ''}
              </span>
            </div>
          </div>
        )}

        {updateState === 'downloaded' && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <CheckCircle size={15} className="text-green-400" />
              <span className="text-sm font-medium text-green-400">
                下载完成，正在启动安装程序...
              </span>
            </div>
          </div>
        )}

        {updateState === 'error' && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
            <AlertCircle size={15} />
            {updateInfo.error ?? '检查更新失败'}
          </div>
        )}
      </div>

      <Divider />
      <SectionTitle title="DeepSeek-V4 模型" desc="由深度求索于 2026 年 4 月发布的新一代旗舰大模型" />

      <div className="grid grid-cols-2 gap-2.5">
        <InfoCard label="上下文窗口" value="1M tokens" />
        <InfoCard label="架构" value="MoE 稀疏注意力" />
        <InfoCard label="V4-Pro 参数" value="1.6T / 49B 激活" />
        <InfoCard label="V4-Flash 参数" value="284B / 13B 激活" />
      </div>

      <Divider />

      {/* 三大模式 */}
      <SectionTitle title="功能模式" desc="针对不同场景优化的 Agent 能力" />
      <div className="space-y-2">
        <FeatureRow icon="📋" title="办公模式" desc="文档撰写、邮件、会议纪要、工作计划" />
        <FeatureRow icon="💻" title="编程模式" desc="代码生成、审查、解释、Bug 修复、重构" />
        <FeatureRow icon="🎨" title="设计模式" desc="架构设计、UI/UX、数据库建模、API 设计" />
      </div>

      <Divider />

      {/* 技术栈 */}
      <SectionTitle title="技术栈" />
      <div className="flex flex-wrap gap-1.5">
        {['Electron 33', 'React 18', 'TypeScript', 'Vite', 'TailwindCSS', 'Zustand', 'Mermaid 11'].map(
          (tech) => (
            <span
              key={tech}
              className="rounded-md border border-border bg-bg-elevated px-2.5 py-1 text-xs text-text-secondary"
            >
              {tech}
            </span>
          )
        )}
      </div>

      <Divider />

      {/* 链接 */}
      <SectionTitle title="相关链接" />
      <div className="space-y-2">
        <LinkRow href="https://platform.deepseek.com" label="DeepSeek 开放平台" />
        <LinkRow href="https://api-docs.deepseek.com" label="DeepSeek API 文档" />
        <LinkRow href="https://chat.deepseek.com" label="DeepSeek 在线体验" />
      </div>

      <p className="pt-2 text-center text-xs text-text-muted">
        内容由 AI 生成，仅供参考
      </p>
    </div>
  )
}
