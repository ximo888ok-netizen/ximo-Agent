/**
 * 提取 lucide-react 图标的精确 SVG 路径（用于 Ardot 画布图标规范板）
 * 用法: node scripts/extract-icons.cjs
 * 输出: scripts/icon-svgs.json  { [iconName]: svgString | null }
 */
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const icons = require('lucide-react')
const { writeFileSync } = require('fs')
const { join } = require('path')

const WANT = [
  // —— 导航 Navigation ——
  'Menu', 'Home', 'Search', 'Settings', 'User', 'FolderOpen',
  'MessageSquare', 'Bell', 'History', 'Star', 'HelpCircle', 'LogOut',
  'ChevronDown', 'ChevronRight', 'MoreHorizontal',
  // —— 操作 Actions ——
  'Plus', 'Edit3', 'Trash2', 'Save', 'X', 'Check', 'Copy', 'Clipboard',
  'Send', 'Download', 'Upload', 'RefreshCw', 'Undo2', 'Redo2',
  'ArrowLeft', 'ArrowRight', 'Filter', 'Share2', 'Lock', 'Eye', 'Play', 'Square',
  // —— 状态 Status ——
  'CheckCircle2', 'AlertTriangle', 'XCircle', 'Info', 'Loader2', 'Ban', 'Clock',
  // —— 表单 Form ——
  'Type', 'AlignLeft', 'ListFilter', 'CheckSquare', 'CircleDot',
  'ToggleLeft', 'CalendarDays', 'Hash', 'Paperclip', 'Image',
  // —— 列表 / 数据 List & Data ——
  'List', 'LayoutGrid', 'Table', 'LayoutDashboard', 'KanbanSquare',
  'Columns', 'GripVertical', 'Inbox', 'ListChecks', 'ArrowUpDown',
  // —— 通用 Common ——
  'Sparkles', 'Bot', 'Brain', 'Zap', 'Terminal', 'Globe', 'Monitor',
  'Mail', 'Tag', 'ShieldCheck', 'Database', 'FileText', 'Code2',
  'PenTool', 'Smartphone', 'Camera', 'Pin', 'Bookmark', 'Key'
]

const out = {}
for (const name of WANT) {
  const Cmp = icons[name]
  if (!Cmp) {
    out[name] = null
    continue
  }
  try {
    const svg = renderToStaticMarkup(
      React.createElement(Cmp, { size: 24, strokeWidth: 2 })
    )
    out[name] = svg
  } catch (e) {
    out[name] = null
    console.error(`FAIL ${name}:`, e.message)
  }
}

const missing = WANT.filter((n) => !out[n])
console.log(`OK ${WANT.length - missing.length}/${WANT.length}  missing: ${missing.join(', ') || '-'}`)

writeFileSync(
  join(__dirname, 'icon-svgs.json'),
  JSON.stringify(out, null, 0),
  'utf8'
)
console.log('written: scripts/icon-svgs.json')
