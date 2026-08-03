import { useState, useEffect, useCallback } from 'react'
import { X, Brain, Save, Check } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { MODE_CONFIGS } from '@renderer/modes'
import type { Mode } from '@shared/types'

/**
 * MemoryPanel — 模式记忆编辑面板
 * 每个模式（办公/编码/设计）拥有独立的持久化记忆，
 * 内容会在会话开始时注入系统提示词，指导 Agent 的行为。
 */
export function MemoryPanel(): React.ReactElement | null {
  const showMemoryPanel = useStore((s) => s.showMemoryPanel)
  const setShowMemoryPanel = useStore((s) => s.setShowMemoryPanel)
  const currentMode = useStore((s) => s.currentMode) as Mode

  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const modeConfig = MODE_CONFIGS[currentMode]

  // 面板打开时加载当前模式的记忆
  const loadContent = useCallback(async (mode: Mode) => {
    setLoading(true)
    const text = await window.api.memory.load(mode)
    setContent(text)
    setLoading(false)
    setSaved(false)
  }, [])

  useEffect(() => {
    if (showMemoryPanel) {
      void loadContent(currentMode)
    }
  }, [showMemoryPanel, currentMode, loadContent])

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    await window.api.memory.save(currentMode, content)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleClose = (): void => {
    setShowMemoryPanel(false)
  }

  if (!showMemoryPanel) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={handleClose}
    >
      <div
        className="glass-panel flex h-[70vh] w-[640px] max-w-[92vw] flex-col overflow-hidden animate-fade-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-muted shadow-lg shadow-accent/20">
              <Brain size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">{modeConfig.name} · 记忆</h2>
              <p className="text-xs text-text-muted">持久化指令 · 每次对话自动注入</p>
            </div>
          </div>
          <button onClick={handleClose} className="icon-btn rounded-lg p-1.5">
            <X size={18} />
          </button>
        </div>

        {/* 编辑区 */}
        <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
          {loading ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          ) : (
            <>
              <textarea
                value={content}
                onChange={(e) => { setContent(e.target.value); setSaved(false) }}
                placeholder={`在此写入 ${modeConfig.name} 的持久记忆...\n\n只记录三类内容：\n• 用户习惯 — 偏好的格式、风格、工作方式\n• 踩过的坑 — 犯过的错误及纠正方法\n• 工具语法 — 本项目工具调用的正确用法\n\n每条一行，保持精简。Agent 也会自主更新记忆。`}
                className="flex-1 resize-none rounded-xl border border-border bg-bg-input px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20"
                style={{ fontFamily: 'inherit', lineHeight: 1.7 }}
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-text-muted">
                  {content.length > 0 ? `${content.length} 字符 · 约 ${Math.ceil(content.length / 4)} token` : '空内容时不会注入记忆'}
                </span>
                <button
                  onClick={() => void handleSave()}
                  disabled={saving || saved}
                  className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition-all ${
                    saved
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : saving
                        ? 'bg-bg-hover text-text-muted'
                        : 'btn-liquid'
                  }`}
                >
                  {saved ? <Check size={13} /> : <Save size={13} />}
                  {saved ? '已保存' : saving ? '保存中...' : '保存'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* 底部提示 */}
        <div className="border-t border-border-subtle px-5 py-2.5">
          <p className="text-[11px] leading-relaxed text-text-muted">
            记忆内容会在每次对话开始时自动注入 Agent 的系统提示词。三个模式的记忆相互独立，切换模式时自动加载对应记忆。
          </p>
        </div>
      </div>
    </div>
  )
}

export default MemoryPanel
