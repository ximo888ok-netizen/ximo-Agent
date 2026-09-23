/**
 * 生成 Ardot batch_edit 图标操作脚本（供复制到 batch_edit 调用）
 * 用法: node scripts/gen-icon-ops.cjs  → 输出 scripts/icon-ops.txt
 * 父节点使用 {{NAV_CARD}} 等占位符，粘贴时替换为真实卡片 ID
 */
const { readFileSync, writeFileSync } = require('fs')
const { join } = require('path')

const svgs = JSON.parse(readFileSync(join(__dirname, 'icon-svgs.json'), 'utf8'))
const BASE = '#DCE1EA'
const STATUS_COLORS = {
  CheckCircle2: '#34D399',
  AlertTriangle: '#FBBF24',
  XCircle: '#F87171',
  Info: '#38BDF8',
  Loader2: '#38BDF8',
  RefreshCw: BASE,
  Ban: '#A3AAB8',
  Clock: '#A3AAB8'
}

const CATEGORIES = {
  NAV: [
    ['Menu', '菜单'], ['Home', '首页'], ['Search', '搜索'], ['Settings', '设置'],
    ['User', '用户'], ['FolderOpen', '文件夹'], ['MessageSquare', '消息'], ['Bell', '通知']
  ],
  ACTION: [
    ['Plus', '新增'], ['Edit3', '编辑'], ['Trash2', '删除'], ['Save', '保存'],
    ['X', '取消'], ['Check', '确认'], ['Copy', '复制'], ['Send', '发送']
  ],
  STATUS: [
    ['CheckCircle2', '成功'], ['AlertTriangle', '警告'], ['XCircle', '错误'], ['Info', '信息'],
    ['Loader2', '加载中'], ['RefreshCw', '刷新'], ['Ban', '禁用'], ['Clock', '待处理']
  ],
  FORM: [
    ['Type', '文本'], ['AlignLeft', '多行文本'], ['ListFilter', '下拉选择'], ['CheckSquare', '复选'],
    ['CircleDot', '单选'], ['ToggleLeft', '开关'], ['CalendarDays', '日期'], ['Hash', '数字']
  ],
  DATA: [
    ['List', '列表'], ['LayoutGrid', '网格'], ['Table', '表格'], ['LayoutDashboard', '卡片'],
    ['KanbanSquare', '看板'], ['Columns', '分栏'], ['GripVertical', '拖拽'], ['ListChecks', '待办']
  ],
  COMMON: [
    ['Sparkles', '智能'], ['Bot', '智能体'], ['Brain', '推理'], ['Zap', '快捷'],
    ['Terminal', '终端'], ['Globe', '网络'], ['Monitor', '桌面'], ['ShieldCheck', '安全']
  ]
}

const out = []
for (const [cat, items] of Object.entries(CATEGORIES)) {
  out.push(`// ===== ${cat} =====`)
  items.forEach(([name, zh], i) => {
    const color = STATUS_COLORS[name] || BASE
    const svg = svgs[name].replace(/stroke="currentColor"/g, `stroke="${color}"`).replace(/ class="[^"]*"/, '')
    out.push(
      `cell${i}=I("{{${cat}_CARD}}", {type: "frame", name: "cell-${name}", width: 88, height: 84, layout: "vertical", gap: 6, primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER", cornerRadius: 12})`
    )
    out.push(
      `icon${i}=I(cell${i}, {type: "frame", name: "icon-${name}", width: 40, height: 40, svg: '${svg}'})`
    )
    out.push(
      `label${i}=I(cell${i}, {type: "text", name: "label-${name}", content: "${name} · ${zh}", fontSize: 11, fill: "#8B93A3", fontName: {family: "Sarasa Gothic SC", style: "Regular"}})`
    )
  })
  out.push('')
}

writeFileSync(join(__dirname, 'icon-ops.txt'), out.join('\n'), 'utf8')
console.log(`generated ${out.length} lines → scripts/icon-ops.txt`)
