import { useState, useEffect, useRef, useMemo } from 'react'
import { X, HelpCircle, FileCheck, Check, XCircle, Circle, CheckCircle2, MessageSquareText } from 'lucide-react'
import { parseQuestion, type ParsedQuestion } from '@renderer/components/planSpec/parseQuestion'

interface UserInputRequest {
  type: 'ask' | 'review'
  title: string
  content: string
}

/**
 * PlanSpecDialog — Plan 提问 / Spec 审核弹窗
 *
 * 由 Agent 通过 plan_ask / spec_review 工具触发：
 * - type='ask'：向用户提问，自动检测问题类型并渲染对应 UI
 *   - 选择题（A/B/C 选项）→ 可点击的单选卡片
 *   - 确认题（请确认...？）→ 接受/拒绝按钮
 *   - 开放题 → 文本输入框
 *   所有类型均附带自定义输入框，方便用户补充
 * - type='review'：展示规范文档，用户审核后确认或打回
 */
export function PlanSpecDialog(): React.ReactElement | null {
  const [request, setRequest] = useState<UserInputRequest | null>(null)
  const [response, setResponse] = useState('')
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const cleanup = window.api.userInput.onRequest((data) => {
      setRequest(data)
      setResponse('')
      setSelectedOption(null)
    })
    return cleanup
  }, [])

  // 弹窗打开时自动聚焦输入框
  useEffect(() => {
    if (request) {
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [request])

  // 解析 ask 类型的问题
  const parsed: ParsedQuestion | null = useMemo(() => {
    if (!request || request.type !== 'ask') return null
    return parseQuestion(request.content)
  }, [request])

  const handleConfirm = (): void => {
    window.api.userInput.respond({ confirmed: true, response: response.trim() || undefined })
    setRequest(null)
  }

  const handleReject = (): void => {
    window.api.userInput.respond({ confirmed: false, response: response.trim() || undefined })
    setRequest(null)
  }

  const handleClose = (): void => {
    window.api.userInput.respond({ confirmed: false })
    setRequest(null)
  }

  // 选择题提交
  const handleChoiceSubmit = (): void => {
    if (selectedOption === null) return
    const opt = parsed?.kind === 'choice' ? parsed.options[selectedOption] : null
    if (!opt) return
    let text = `${opt.label}. ${opt.text}`
    if (response.trim()) {
      text += `\n\n补充：${response.trim()}`
    }
    window.api.userInput.respond({ confirmed: true, response: text })
    setRequest(null)
  }

  // 确认题 — 接受
  const handleAccept = (): void => {
    window.api.userInput.respond({ confirmed: true, response: response.trim() || undefined })
    setRequest(null)
  }

  // 确认题 — 拒绝
  const handleDecline = (): void => {
    const text = response.trim() || '用户拒绝了方案'
    window.api.userInput.respond({ confirmed: false, response: text })
    setRequest(null)
  }

  if (!request) return null

  const isAsk = request.type === 'ask'
  const isChoice = parsed?.kind === 'choice'
  const isConfirm = parsed?.kind === 'confirm'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={handleClose}
    >
      <div
        className="glass-panel flex h-[80vh] w-[720px] max-w-[94vw] flex-col overflow-hidden animate-fade-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-lg ${
              isAsk
                ? 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/20'
                : 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/20'
            }`}>
              {isAsk ? <HelpCircle size={18} className="text-white" /> : <FileCheck size={18} className="text-white" />}
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">{request.title}</h2>
              <p className="text-xs text-text-muted">
                {isAsk ? 'Agent 需要你的回答才能继续' : '请审核以下规范文档，确认后 Agent 将严格执行'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="icon-btn rounded-lg p-1.5">
            <X size={18} />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex min-h-0 flex-1 flex-col px-5 py-4 overflow-y-auto">
          {/* ── 问题正文 / 规范文档 ── */}
          <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-border bg-bg-input px-4 py-3">
            <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text-primary" style={{ fontFamily: 'inherit' }}>
              {isChoice ? parsed!.body || request.content : request.content}
            </pre>
          </div>

          {/* ── 选择题选项卡片 ── */}
          {isChoice && parsed!.kind === 'choice' && (
            <div className="mt-3 space-y-2">
              {parsed!.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedOption(i)}
                  className={`flex w-full items-start gap-3 rounded-xl border px-4 py-2.5 text-left text-sm transition-all duration-200 ${
                    selectedOption === i
                      ? 'border-accent bg-accent/10 text-text-primary shadow-glow'
                      : 'border-border bg-bg-input text-text-secondary hover:border-accent/30 hover:bg-accent/5'
                  }`}
                >
                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    selectedOption === i ? 'border-accent bg-accent' : 'border-border-subtle'
                  }`}>
                    {selectedOption === i && <Check size={12} className="text-white" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-accent mr-1.5">{opt.label}.</span>
                    <span>{opt.text}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* ── 确认题：接受/拒绝按钮 ── */}
          {isConfirm && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                onClick={handleAccept}
                className="flex items-center justify-center gap-2 rounded-xl border-2 border-green-500/30 bg-green-500/10 px-4 py-3 text-sm font-medium text-green-400 transition-all duration-200 hover:border-green-500/50 hover:bg-green-500/15 active:scale-[0.98]"
              >
                <CheckCircle2 size={18} />
                接受方案
              </button>
              <button
                onClick={handleDecline}
                className="flex items-center justify-center gap-2 rounded-xl border-2 border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-400 transition-all duration-200 hover:border-red-500/50 hover:bg-red-500/15 active:scale-[0.98]"
              >
                <XCircle size={18} />
                拒绝方案
              </button>
            </div>
          )}

          {/* ── 自定义输入框 — 所有类型都显示 ── */}
          <div className="mt-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-text-muted">
              <MessageSquareText size={11} />
              <span>{isChoice ? '补充说明（可选）— 选择选项后可追加其他想法' : isConfirm ? '修改意见（可选）— 拒绝时填写具体原因' : '在此输入你的回答...（Ctrl+Enter 发送）'}</span>
            </div>
            <textarea
              ref={textareaRef}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  if (isChoice) {
                    if (selectedOption !== null) handleChoiceSubmit()
                  } else if (isConfirm) {
                    handleAccept()
                  } else {
                    handleConfirm()
                  }
                }
              }}
              placeholder={
                isChoice
                  ? '选了选项后还想说点别的？在此输入...'
                  : isConfirm
                    ? '有修改意见？在此输入...'
                    : '输入你的回答...（Ctrl+Enter 发送）'
              }
              rows={isChoice || isConfirm ? 2 : 3}
              className="w-full resize-none rounded-xl border border-border bg-bg-input px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20"
              style={{ fontFamily: 'inherit', lineHeight: 1.6 }}
            />
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-5 py-3">
          {isChoice ? (
            <>
              <button
                onClick={handleClose}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-hover px-4 py-2 text-xs font-medium text-text-secondary transition-all hover:bg-red-500/10 hover:text-red-400 hover:border-red-400/30 active:scale-95"
              >
                <XCircle size={14} />
                跳过
              </button>
              <button
                onClick={handleChoiceSubmit}
                disabled={selectedOption === null}
                className="btn-liquid flex items-center gap-1.5 rounded-lg px-5 py-2 text-xs font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check size={14} />
                确认选择
              </button>
            </>
          ) : isConfirm ? (
            <button
              onClick={handleClose}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-hover px-4 py-2 text-xs font-medium text-text-secondary transition-all hover:bg-bg-hover/80 active:scale-95"
            >
              <X size={14} />
              关闭
            </button>
          ) : isAsk ? (
            <>
              <button
                onClick={handleReject}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-hover px-4 py-2 text-xs font-medium text-text-secondary transition-all hover:bg-red-500/10 hover:text-red-400 hover:border-red-400/30 active:scale-95"
              >
                <XCircle size={14} />
                跳过此问题
              </button>
              <button
                onClick={handleConfirm}
                disabled={!response.trim()}
                className="btn-liquid flex items-center gap-1.5 rounded-lg px-5 py-2 text-xs font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check size={14} />
                发送回答
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleReject}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-hover px-4 py-2 text-xs font-medium text-text-secondary transition-all hover:bg-red-500/10 hover:text-red-400 hover:border-red-400/30 active:scale-95"
              >
                <XCircle size={14} />
                打回修改
              </button>
              <button
                onClick={handleConfirm}
                className="btn-liquid flex items-center gap-1.5 rounded-lg px-5 py-2 text-xs font-semibold transition-all active:scale-95"
              >
                <Check size={14} />
                确认执行
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default PlanSpecDialog
