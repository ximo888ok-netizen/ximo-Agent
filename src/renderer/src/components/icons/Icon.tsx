/**
 * 图标系统 · 统一封装组件
 *
 * 与 lucide-react 配套使用，保证：
 *  1. 统一描边粗细（默认 2px）和尺寸令牌
 *  2. 业务语义名（aliases）↔ lucide 组件名 双向往返
 *  3. 类 Tailwind 的 `spin` 助记 + 友好可访问性（aria-hidden / aria-label）
 *  4. 树摇优化：仅静态导入 catalog 中出现的图标
 */
/// <reference types="vite/client" />
import type { FC } from 'react'
import {
  Menu, Home, Search, Settings, User, FolderOpen, MessageSquare, Bell,
  History, Star, HelpCircle, LogOut, ChevronDown, ChevronRight,
  MoreHorizontal, MoreVertical,
  Plus, Edit3, Trash2, Save, X, Check, Copy, Clipboard, Send, Download,
  Upload, RefreshCw, Undo2, Redo2, ArrowLeft, ArrowRight, ArrowUp, Filter,
  Share2, Lock, Eye, EyeOff, Play, Square, Reply, RotateCcw, FileEdit,
  SearchCheck, ClipboardCheck,
  CheckCircle2, AlertTriangle, XCircle, Info, Loader2, Ban, Clock, Bug,
  Type, AlignLeft, ListFilter, CheckSquare, CircleDot, ToggleLeft,
  CalendarDays, Hash, Paperclip, Image, AtSign,
  List as ListIcon, LayoutGrid, Table, LayoutDashboard, KanbanSquare,
  Columns, GripVertical, Inbox, ListChecks, ArrowUpDown,
  Sparkles, Bot, Brain, Wand2, Zap, Terminal, Globe, Monitor, Smartphone,
  Mail, Tag, ShieldCheck, Database, FileText, Code2, FileCode2, PenTool,
  Camera, Pin, Bookmark, Key, Layout, Briefcase, Users, BookOpen,
  FlaskConical, Network, Webhook, GitCompare, Workflow, Cpu, Store,
  Radio, GitBranch, FolderSearch, LayoutPanelTop, Rocket, Lightbulb, Calendar
} from 'lucide-react'
import type { LucideIcon as LucideIconType } from 'lucide-react'

import {
  DEFAULT_SIZE,
  DEFAULT_STROKE_WIDTH,
  ICON_SIZE_MAP
} from './types'
import type { IconProps, IconSize } from './types'
import { ICON_CATALOG } from './catalog'

/** lucide 组件静态表（保证树摇） */
const LUCIDE_COMPONENTS: Record<string, LucideIconType> = {
  Menu, Home, Search, Settings, User, FolderOpen, MessageSquare, Bell,
  History, Star, HelpCircle, LogOut, ChevronDown, ChevronRight,
  MoreHorizontal, MoreVertical,
  Plus, Edit3, Trash2, Save, X, Check, Copy, Clipboard, Send, Download,
  Upload, RefreshCw, Undo2, Redo2, ArrowLeft, ArrowRight, ArrowUp, Filter,
  Share2, Lock, Eye, EyeOff, Play, Square, Reply, RotateCcw, FileEdit,
  SearchCheck, ClipboardCheck,
  CheckCircle2, AlertTriangle, XCircle, Info, Loader2, Ban, Clock, Bug,
  Type, AlignLeft, ListFilter, CheckSquare, CircleDot, ToggleLeft,
  CalendarDays, Hash, Paperclip, Image, AtSign,
  List: ListIcon, LayoutGrid, Table, LayoutDashboard, KanbanSquare,
  Columns, GripVertical, Inbox, ListChecks, ArrowUpDown,
  Sparkles, Bot, Brain, Wand2, Zap, Terminal, Globe, Monitor, Smartphone,
  Mail, Tag, ShieldCheck, Database, FileText, Code2, FileCode2, PenTool,
  Camera, Pin, Bookmark, Key, Layout, Briefcase, Users, BookOpen,
  FlaskConical, Network, Webhook, GitCompare, Workflow, Cpu, Store,
  Radio, GitBranch, FolderSearch, LayoutPanelTop, Rocket, Lightbulb, Calendar
}

/** 名称解析：lucide 组件名 / 语义别名 → lucide 组件 */
const NAME_MAP: Record<string, LucideIconType> = {}
for (const m of ICON_CATALOG) {
  const Cmp = LUCIDE_COMPONENTS[m.name]
  if (!Cmp) continue
  NAME_MAP[m.name] = Cmp
  if (m.aliases) {
    for (const a of m.aliases) NAME_MAP[a] = Cmp
  }
  // 兼容 lucide 名按小写匹配（"CheckCircle2" 与 "checkcircle2" 等价）
  NAME_MAP[m.name.toLowerCase()] = Cmp
}

function resolveSize(size: IconSize | undefined): number {
  if (typeof size === 'number') return size
  if (size && size in ICON_SIZE_MAP) {
    return ICON_SIZE_MAP[size as Exclude<IconSize, number>]
  }
  // 兜底
  return typeof DEFAULT_SIZE === 'number'
    ? DEFAULT_SIZE
    : ICON_SIZE_MAP[DEFAULT_SIZE as Exclude<IconSize, number>]
}

function resolveName(name: string): LucideIconType | null {
  // 优先精确匹配，其次小写，最后 lucide 原名（兼容未在 catalog 的旧图标）
  return (
    NAME_MAP[name] ??
    NAME_MAP[name.toLowerCase()] ??
    LUCIDE_COMPONENTS[name] ??
    null
  )
}

export const Icon: FC<IconProps> = ({
  name,
  size = DEFAULT_SIZE,
  strokeWidth = DEFAULT_STROKE_WIDTH,
  spin = false,
  className,
  title
}) => {
  const Cmp = resolveName(name)
  if (!Cmp) {
    if (import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[Icon] Unknown icon name: "${name}"`)
    }
    return null
  }
  const cls = [spin ? 'animate-spin' : '', className].filter(Boolean).join(' ')
  const a11y = title
    ? ({ role: 'img' as const, 'aria-label': title } as const)
    : ({ 'aria-hidden': true } as const)
  return (
    <Cmp
      size={resolveSize(size)}
      strokeWidth={strokeWidth}
      className={cls}
      {...a11y}
    />
  )
}

export default Icon