import { Hand, ShieldCheck, Zap, type LucideIcon } from 'lucide-react'
import type { AutoModeLevel } from '@shared/types'

/**
 * 自动化等级（Auto Mode）—— 全应用单一来源。
 *
 * 输入框下方的下拉选择与设置页的「自动化与安全」共用这一份，
 * 避免两处各自维护标签/描述导致文案漂移（这类漂移之前已经出现过：
 * 输入框写 "手动/Safe/YOLO"，设置页写 "按模式规则/安全模式/YOLO"，
 * 而底层其实是同一组值）。
 */
export interface AutoModeOption {
  value: AutoModeLevel
  label: string
  /** 触发按钮上的短标签（空间有限，用两字） */
  short: string
  desc: string
  icon: LucideIcon
  /**
   * 语义色调：
   * - neutral 手动审批是默认的保守档，不抢视觉
   * - accent  自动审批是推荐的日常档
   * - danger  完全访问会关掉整条确认链路，必须一眼看出来
   */
  tone: 'neutral' | 'accent' | 'danger'
}

export const AUTO_MODE_OPTIONS: readonly AutoModeOption[] = [
  {
    value: 'off',
    label: '手动审批',
    short: '手动',
    desc: '危险操作逐个弹窗确认',
    icon: Hand,
    tone: 'neutral'
  },
  {
    value: 'safe',
    label: '自动审批',
    short: '自动',
    desc: '读取与常规操作自动，危险操作仍确认',
    icon: ShieldCheck,
    tone: 'accent'
  },
  {
    value: 'yolo',
    label: '完全访问',
    short: '完全',
    desc: '全部自动执行，不再询问',
    icon: Zap,
    tone: 'danger'
  }
]

/**
 * 默认等级 —— 手动审批。
 * 这是会写文件、跑命令的 Agent，默认必须让人逐次知情；
 * 用户想要更顺手的体验再自己往上调。
 */
export const AUTO_MODE_DEFAULT: AutoModeLevel = 'off'

/** 归一化任意来源的等级值（settings.json 可能残留手改的非法值） */
export function normalizeAutoMode(value: unknown): AutoModeLevel {
  return AUTO_MODE_OPTIONS.some((o) => o.value === value) ? (value as AutoModeLevel) : AUTO_MODE_DEFAULT
}

/** 取某个等级的选项定义（非法值回落到默认档） */
export function autoModeOption(value: unknown): AutoModeOption {
  const v = normalizeAutoMode(value)
  return AUTO_MODE_OPTIONS.find((o) => o.value === v) ?? AUTO_MODE_OPTIONS[0]
}

/** 触发按钮的色调类 —— 与下拉面板里的勾选色保持一致 */
export const AUTO_MODE_TRIGGER_TONE: Record<AutoModeOption['tone'], string> = {
  neutral: 'text-text-muted hover:text-text-secondary',
  accent: 'border-accent/30 text-accent bg-accent/10',
  danger: 'border-red-500/30 text-red-400 bg-red-500/10'
}
