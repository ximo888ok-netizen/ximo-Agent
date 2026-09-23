/**
 * 图标系统 · 语义目录
 *
 * 提供业务视角的图标组织 + 语义别名（aliases）：
 * - `name` 必须与 lucide-react 命名导出完全一致。
 * - `aliases` 可选：让 <Icon name="add" /> 等价于 <Icon name="Plus" />。
 *
 * 列表底部"兼容旧 Icon.tsx 的图标"块保留了项目既有的 27 个 lucide 名称，
 * 保证对所有历史 call-site 零侵入兼容。
 */
import type { IconCategory, IconMeta } from './types'

export const ICON_CATALOG: IconMeta[] = [
  // ============== 导航 Navigation ==============
  { name: 'Menu',           category: 'navigation', zh: '菜单',       aliases: ['menu', 'sidebar'] },
  { name: 'Home',           category: 'navigation', zh: '首页' },
  { name: 'Search',         category: 'navigation', zh: '搜索',       aliases: ['find', 'lookup'] },
  { name: 'Settings',       category: 'navigation', zh: '设置',       aliases: ['config', 'preferences'] },
  { name: 'User',           category: 'navigation', zh: '用户',       aliases: ['profile', 'account'] },
  { name: 'FolderOpen',     category: 'navigation', zh: '文件夹',     aliases: ['folder'] },
  { name: 'MessageSquare',  category: 'navigation', zh: '消息',       aliases: ['chat', 'message'] },
  { name: 'Bell',           category: 'navigation', zh: '通知',       aliases: ['notification'] },
  { name: 'History',        category: 'navigation', zh: '历史',       aliases: ['recent'] },
  { name: 'Star',           category: 'navigation', zh: '收藏',       aliases: ['favorite'] },
  { name: 'HelpCircle',     category: 'navigation', zh: '帮助',       aliases: ['help'] },
  { name: 'LogOut',         category: 'navigation', zh: '退出' },
  { name: 'ChevronDown',    category: 'navigation', zh: '展开' },
  { name: 'ChevronRight',   category: 'navigation', zh: '前进' },
  { name: 'MoreHorizontal', category: 'navigation', zh: '更多' },
  { name: 'MoreVertical',   category: 'navigation', zh: '更多菜单' },

  // ============== 操作 Actions ==============
  { name: 'Plus',         category: 'action', zh: '新增',     aliases: ['add', 'create', 'new'] },
  { name: 'Edit3',        category: 'action', zh: '编辑',     aliases: ['edit', 'modify'] },
  { name: 'Trash2',       category: 'action', zh: '删除',     aliases: ['delete', 'remove'] },
  { name: 'Save',         category: 'action', zh: '保存' },
  { name: 'X',            category: 'action', zh: '取消/关闭', aliases: ['cancel', 'close'] },
  { name: 'Check',        category: 'action', zh: '确认',     aliases: ['confirm', 'ok'] },
  { name: 'Copy',         category: 'action', zh: '复制' },
  { name: 'Clipboard',    category: 'action', zh: '粘贴',     aliases: ['paste'] },
  { name: 'Send',         category: 'action', zh: '发送' },
  { name: 'Download',     category: 'action', zh: '下载' },
  { name: 'Upload',       category: 'action', zh: '上传' },
  { name: 'RefreshCw',    category: 'action', zh: '刷新',     aliases: ['refresh'] },
  { name: 'Undo2',        category: 'action', zh: '撤销',     aliases: ['undo'] },
  { name: 'Redo2',        category: 'action', zh: '重做',     aliases: ['redo'] },
  { name: 'ArrowLeft',    category: 'action', zh: '返回',     aliases: ['back'] },
  { name: 'ArrowRight',   category: 'action', zh: '前进',     aliases: ['forward'] },
  { name: 'ArrowUp',      category: 'action', zh: '上箭头' },
  { name: 'Filter',       category: 'action', zh: '筛选' },
  { name: 'Share2',       category: 'action', zh: '分享',     aliases: ['share'] },
  { name: 'Lock',         category: 'action', zh: '锁定' },
  { name: 'Eye',          category: 'action', zh: '查看' },
  { name: 'EyeOff',       category: 'action', zh: '隐藏' },
  { name: 'Play',         category: 'action', zh: '运行/播放' },
  { name: 'Square',       category: 'action', zh: '停止' },
  { name: 'Reply',        category: 'action', zh: '回复' },
  { name: 'RotateCcw',    category: 'action', zh: '重置',     aliases: ['reset'] },
  { name: 'FileEdit',     category: 'action', zh: '编辑文件' },
  { name: 'SearchCheck',  category: 'action', zh: '搜索确认' },
  { name: 'ClipboardCheck', category: 'action', zh: '剪贴板确认' },

  // ============== 状态 Status（语义色由 StatusIcon 自动应用） ==============
  { name: 'CheckCircle2',  category: 'status', zh: '成功',  aliases: ['success', 'done'] },
  { name: 'AlertTriangle', category: 'status', zh: '警告',  aliases: ['warning', 'warn'] },
  { name: 'XCircle',       category: 'status', zh: '错误',  aliases: ['error', 'fail'] },
  { name: 'Info',          category: 'status', zh: '信息' },
  { name: 'Loader2',       category: 'status', zh: '加载中', aliases: ['loading', 'spinner'] },
  { name: 'Ban',           category: 'status', zh: '禁用',  aliases: ['forbidden', 'blocked'] },
  { name: 'Clock',         category: 'status', zh: '待处理', aliases: ['pending'] },
  { name: 'Bug',           category: 'status', zh: '缺陷',  aliases: ['bug'] },

  // ============== 表单 Form ==============
  { name: 'Type',          category: 'form', zh: '文本',     aliases: ['text', 'input-text'] },
  { name: 'AlignLeft',     category: 'form', zh: '多行文本', aliases: ['textarea'] },
  { name: 'ListFilter',    category: 'form', zh: '下拉选择', aliases: ['select', 'dropdown'] },
  { name: 'CheckSquare',   category: 'form', zh: '复选',     aliases: ['checkbox'] },
  { name: 'CircleDot',     category: 'form', zh: '单选',     aliases: ['radio'] },
  { name: 'ToggleLeft',    category: 'form', zh: '开关',     aliases: ['toggle', 'switch'] },
  { name: 'CalendarDays',  category: 'form', zh: '日期',     aliases: ['date', 'calendar'] },
  { name: 'Hash',          category: 'form', zh: '数字',     aliases: ['number'] },
  { name: 'Paperclip',     category: 'form', zh: '附件',     aliases: ['attachment'] },
  { name: 'Image',         category: 'form', zh: '图片' },
  { name: 'AtSign',        category: 'form', zh: '提及' },

  // ============== 列表 / 数据 List & Data ==============
  { name: 'List',             category: 'data', zh: '列表',     aliases: ['list'] },
  { name: 'LayoutGrid',       category: 'data', zh: '网格',     aliases: ['grid'] },
  { name: 'Table',            category: 'data', zh: '表格' },
  { name: 'LayoutDashboard',  category: 'data', zh: '卡片',     aliases: ['card', 'dashboard'] },
  { name: 'KanbanSquare',     category: 'data', zh: '看板',     aliases: ['kanban'] },
  { name: 'Columns',          category: 'data', zh: '分栏' },
  { name: 'GripVertical',     category: 'data', zh: '拖拽',     aliases: ['drag'] },
  { name: 'Inbox',            category: 'data', zh: '空/收件箱', aliases: ['empty'] },
  { name: 'ListChecks',       category: 'data', zh: '待办清单', aliases: ['checklist'] },
  { name: 'ArrowUpDown',      category: 'data', zh: '排序',     aliases: ['sort'] },

  // ============== 通用 Common ==============
  { name: 'Sparkles',       category: 'common', zh: '智能/AI', aliases: ['ai', 'magic'] },
  { name: 'Bot',            category: 'common', zh: '智能体',  aliases: ['agent'] },
  { name: 'Brain',          category: 'common', zh: '推理',    aliases: ['think'] },
  { name: 'Wand2',          category: 'common', zh: '魔法棒' },
  { name: 'Zap',            category: 'common', zh: '快捷',    aliases: ['shortcut', 'lightning'] },
  { name: 'Terminal',       category: 'common', zh: '终端',    aliases: ['cli', 'console'] },
  { name: 'Globe',          category: 'common', zh: '网络',    aliases: ['web', 'network'] },
  { name: 'Monitor',        category: 'common', zh: '桌面',    aliases: ['desktop'] },
  { name: 'Smartphone',     category: 'common', zh: '移动' },
  { name: 'Mail',           category: 'common', zh: '邮件',    aliases: ['email'] },
  { name: 'Tag',            category: 'common', zh: '标签' },
  { name: 'ShieldCheck',    category: 'common', zh: '安全',    aliases: ['secure', 'security'] },
  { name: 'Database',       category: 'common', zh: '数据库' },
  { name: 'FileText',       category: 'common', zh: '文件' },
  { name: 'Code2',          category: 'common', zh: '代码' },
  { name: 'FileCode2',      category: 'common', zh: '代码文件' },
  { name: 'PenTool',        category: 'common', zh: '画笔/编辑' },
  { name: 'Camera',         category: 'common', zh: '相机' },
  { name: 'Pin',            category: 'common', zh: '置顶' },
  { name: 'Bookmark',       category: 'common', zh: '书签' },
  { name: 'Key',            category: 'common', zh: '密钥' },
  { name: 'Layout',         category: 'common', zh: '布局' },
  { name: 'Briefcase',      category: 'common', zh: '商务' },
  { name: 'Users',          category: 'common', zh: '用户组' },
  { name: 'BookOpen',       category: 'common', zh: '文档' },
  { name: 'FlaskConical',   category: 'common', zh: '实验' },
  { name: 'Network',        category: 'common', zh: '网络拓扑' },
  { name: 'Webhook',        category: 'common', zh: 'Webhook' },
  { name: 'GitCompare',     category: 'common', zh: 'Diff' },
  { name: 'Workflow',       category: 'common', zh: '工作流' },
  { name: 'Cpu',            category: 'common', zh: '硬件/CPU' },
  { name: 'Store',          category: 'common', zh: '商店' },
  { name: 'Radio',          category: 'common', zh: '广播' },
  { name: 'GitBranch',      category: 'common', zh: '分支' },
  { name: 'FolderSearch',   category: 'common', zh: '搜索文件夹' },
  { name: 'LayoutPanelTop', category: 'common', zh: '顶部面板' },
  { name: 'Rocket',         category: 'common', zh: '启动/部署' },
  { name: 'Lightbulb',      category: 'common', zh: '灵感' },
  { name: 'Calendar',       category: 'common', zh: '日历' }
]

/** 按分类索引，便于在文档/面板中分组展示 */
export const ICON_CATALOG_BY_CATEGORY: Record<IconCategory, IconMeta[]> = {
  navigation: [],
  action: [],
  status: [],
  form: [],
  data: [],
  common: []
}
for (const m of ICON_CATALOG) {
  ICON_CATALOG_BY_CATEGORY[m.category].push(m)
}

/** 扁平别名表：<Icon name="add" /> → Plus */
export const ICON_ALIAS_TO_NAME: Record<string, string> = {}
for (const m of ICON_CATALOG) {
  ICON_ALIAS_TO_NAME[m.name.toLowerCase()] = m.name
  if (m.aliases) {
    for (const a of m.aliases) ICON_ALIAS_TO_NAME[a.toLowerCase()] = m.name
  }
}