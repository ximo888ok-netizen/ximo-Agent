import type { ModeConfig } from '@shared/types'

/** 办公模式配置 — 文档撰写 / 邮件 / 会议纪要 / 方案报告 / 操作录制 / 技能复用 */
export const OFFICE_CONFIG: ModeConfig = {
  id: 'office',
  name: '办公模式',
  icon: 'Briefcase',
  description: '文档撰写 · 邮件 · 会议纪要 · 方案报告 · 操作录制 · 技能复用',
  systemPrompt: '',
  quickActions: [
    {
      id: 'office-report',
      label: '撰写工作汇报',
      icon: 'FileText',
      prompt: '请帮我撰写一份本周工作汇报。我本周的主要工作内容如下：\n\n[请填写：本周完成了哪些工作、关键进展、数据指标]\n\n请按"本周完成事项 / 关键进展 / 问题与风险 / 下周计划"的结构输出。'
    },
    {
      id: 'office-email',
      label: '撰写商务邮件',
      icon: 'Mail',
      prompt: '请帮我撰写一封商务邮件。\n\n收件人：[收件人身份/姓名]\n邮件目的：[请填写：沟通目的，如项目进度同步、合作邀约、问题反馈等]\n关键信息：[请填写：需要传达的核心内容]\n\n请输出完整的邮件，包含主题行、称呼、正文和落款。'
    },
    {
      id: 'office-meeting',
      label: '生成会议纪要',
      icon: 'Users',
      prompt: '请根据以下会议信息生成一份结构化的会议纪要：\n\n会议主题：[请填写]\n参会人员：[请填写]\n会议要点：\n[请填写：讨论了哪些内容、关键决策、待办事项]\n\n请按"会议信息 / 讨论内容 / 决议事项 / 待办清单（含负责人和截止时间）"结构输出。'
    },
    {
      id: 'office-polish',
      label: '润色文档',
      icon: 'Sparkles',
      prompt: '请帮我润色以下文字，使其更加专业、流畅、得体，保留原意并优化结构与措辞：\n\n[请粘贴需要润色的文字内容]'
    },
    {
      id: 'office-plan',
      label: '制定工作计划',
      icon: 'CalendarDays',
      prompt: '请帮我制定一份工作计划。\n\n目标：[请填写：需要达成什么目标]\n时间范围：[请填写：如本周/本月/Q1]\n可用资源：[请填写：人力、预算、工具等]\n\n请按目标拆解、任务清单（含优先级和时间节点）、风险预案的结构输出。'
    },
    {
      id: 'office-table',
      label: '数据整理',
      icon: 'Table',
      prompt: '请帮我整理以下数据为结构化的 Markdown 表格，并做简要分析：\n\n[请粘贴数据内容]'
    },
    {
      id: 'office-search',
      label: '联网搜索',
      icon: 'Search',
      prompt: '请在互联网上搜索：[关键词/问题]\n\n请搜索最新最权威的信息并给出引用来源。'
    },
    {
      id: 'office-research',
      label: '深度研究',
      icon: 'Brain',
      prompt: '请对以下话题进行深度研究：[话题]\n\n请搜索多个来源、综合分析后生成研究摘要。'
    }
  ],
  actionGroups: [
    {
      category: '文档与办公',
      icon: 'FileText',
      actions: [
        { id: 'office-report', label: '撰写工作汇报', icon: 'FileText', prompt: '请帮我撰写一份本周工作汇报。我本周的主要工作内容如下：\n\n[请填写]\n\n请按"本周完成事项 / 关键进展 / 问题与风险 / 下周计划"的结构输出。', description: '结构化工作汇报，含进展与风险' },
        { id: 'office-email', label: '撰写商务邮件', icon: 'Mail', prompt: '请帮我撰写一封商务邮件。收件人：[身份] 邮件目的：[目的] 关键信息：[内容]\n\n请输出完整的邮件，包含主题行、称呼、正文和落款。', description: '含主题+称呼+落款' },
        { id: 'office-meeting', label: '生成会议纪要', icon: 'Users', prompt: '请根据以下会议信息生成结构化的会议纪要：\n\n会议主题：[主题] 参会人员：[人员] 会议要点：[要点]\n\n请按"会议信息 / 讨论内容 / 决议事项 / 待办清单"结构输出。', description: '含待办项+负责人+截止时间' },
        { id: 'office-polish', label: '润色文档', icon: 'Sparkles', prompt: '请帮我润色以下文字，使其更加专业、流畅、得体，保留原意并优化结构与措辞：\n\n[粘贴文字]', description: '优化措辞，保持原意' },
        { id: 'office-plan', label: '制定工作计划', icon: 'CalendarDays', prompt: '请帮我制定工作计划。目标：[目标] 时间：[时间范围] 资源：[资源]\n\n请按目标拆解、任务清单、风险预案结构输出。', description: '含优先级和甘特时间线' },
        { id: 'office-table', label: '数据整理分析', icon: 'Table', prompt: '请帮我整理以下数据为结构化的 Markdown 表格，并做简要分析：\n\n[粘贴数据]', description: '结构化表格+简要分析' },
      ]
    },
    {
      category: '搜索与研究',
      icon: 'Search',
      actions: [
        { id: 'office-search', label: '联网搜索', icon: 'Search', prompt: '请在互联网上搜索：[关键词/问题]\n\n请搜索最新最权威的信息并给出引用来源。', description: '多引擎搜索+引用来源' },
        { id: 'office-research', label: '深度研究', icon: 'Brain', prompt: '请对以下话题进行深度研究：[话题]\n\n请搜索多个来源、综合分析后生成研究摘要。', description: '多方来源综合分析' },
      ]
    },
    {
      category: '后台工具',
      icon: 'Monitor',
      actions: [
        { id: 'office-browser', label: '内嵌浏览器', icon: 'Globe', prompt: '请在右侧栏点击"内嵌浏览器"按钮开启浏览器。开启后可在此浏览器中操作，Agent 的浏览器工具也独立可用。', description: '右侧栏开启浏览器+抓包' },
        { id: 'office-record', label: '录制技能', icon: 'CircleDot', prompt: '请先在右侧栏开启内嵌浏览器，然后点击"录制技能"开始录制。录制完成后自动保存为永久技能。', description: '录制浏览器操作+API端点' },
        { id: 'office-invoke', label: '调用已有技能', icon: 'Play', prompt: '请查看已有的技能列表，并根据我的任务描述调用最匹配的技能。\n\n先调用 skill_record(action="status") 查看技能列表，然后调用 skill_invoke(skill_name="匹配技能名") 执行。', description: '相似任务自动复用' },
        { id: 'office-computer', label: '操控电脑', icon: 'Cpu', prompt: '请在右侧栏点击"操控电脑"按钮启动 pi-computer-use。启动后我可以通过 find_roots/observe_ui/act_ui 等工具操作桌面应用。', description: '后台启动pi-computer-use' },
      ]
    },
  ]
}
