import type { ModeConfig } from '@shared/types'

/**
 * 三大模式配置：系统提示词 + 快捷操作模板
 * 每个模式针对不同场景优化 DeepSeek-V4 的输出风格
 */
export const MODE_CONFIGS: Record<'office' | 'coding' | 'design', ModeConfig> = {
  // ---------- 办公模式 ----------
  office: {
    id: 'office',
    name: '办公模式',
    icon: 'Briefcase',
    description: '文档撰写 · 邮件 · 会议纪要 · 方案报告 · 操作录制 · 技能复用',
    // systemPrompt 已拆分到 modes/prompts.ts，仅在发送消息时动态加载
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
  },

  // ---------- 编程模式 ----------
  coding: {
    id: 'coding',
    name: '编程模式',
    icon: 'Code2',
    description: '代码生成 · 审查 · 解释 · 重构 · 测试',
    // systemPrompt 已拆分到 modes/prompts.ts，仅在发送消息时动态加载
    systemPrompt: '',
    quickActions: [
      {
        id: 'code-gen',
        label: '生成代码',
        icon: 'Wand2',
        prompt: '请用以下技术栈帮我实现一个功能：\n\n语言/框架：[请填写，如 Python、React + TypeScript]\n功能描述：[请填写：需要实现什么]\n输入/输出：[请填写：预期的输入和输出]\n\n请给出完整可运行的代码，并解释关键实现。'
      },
      {
        id: 'code-review',
        label: 'AI 代码审查 (OCR)',
        icon: 'ShieldCheck',
        prompt: '请使用 AI 代码审查工具对当前项目变更进行审查：\n\n1. 先用 code_review(action="status") 检查 OCR 安装与配置状态\n2. 用 code_review(action="review") 审查未提交的工作区变更\n3. 汇总审查意见，按严重程度分类（错误/警告/建议），并给出修复建议\n\n如果 OCR 未安装，提示安装命令：npm i -g @alibaba-group/open-code-review'
      },
      {
        id: 'code-explain',
        label: '解释代码',
        icon: 'BookOpen',
        prompt: '请逐行解释以下代码的工作原理，包括核心逻辑、数据流和设计意图，让初学者也能理解：\n\n```\n[请粘贴代码]\n```'
      },
      {
        id: 'code-bug',
        label: '修复 Bug',
        icon: 'Bug',
        prompt: '以下代码存在问题，请帮我定位并修复 Bug，解释问题根因：\n\n问题描述：[请填写：出现了什么异常/错误现象]\n\n```\n[请粘贴代码]\n```\n\n请给出修复后的完整代码及修复说明。'
      },
      {
        id: 'code-refactor',
        label: '重构代码',
        icon: 'RefreshCw',
        prompt: '请重构以下代码，提升可读性、可维护性和性能，同时保持行为不变。说明每处重构的理由：\n\n```\n[请粘贴代码]\n```'
      },
      {
        id: 'code-test',
        label: '编写测试',
        icon: 'FlaskConical',
        prompt: '请为以下代码编写单元测试，覆盖正常路径、边界情况和异常情况：\n\n测试框架：[请填写，如 Jest、pytest、JUnit]\n\n```\n[请粘贴代码]\n```\n\n请给出完整的测试代码。'
      },
      {
        id: 'code-project',
        label: '项目上下文分析',
        icon: 'FolderSearch',
        prompt: '请先扫描当前项目的目录结构，了解项目全貌，然后告诉我项目架构和技术栈。'
      },
      {
        id: 'code-terminal',
        label: '执行终端命令',
        icon: 'Terminal',
        prompt: '请帮我执行以下命令：[命令]\n\n请确认当前目录是否正确。'
      },
      {
        id: 'code-file-edit',
        label: '修改项目文件',
        icon: 'FileEdit',
        prompt: '请帮我修改 [文件路径] 中的代码：[描述修改需求]\n\n请先读取文件内容，再做精确替换。'
      },
      {
        id: 'code-git',
        label: 'Git 操作',
        icon: 'GitBranch',
        prompt: '请帮我 [git操作描述，如：查看当前git状态并提交更改]\n\nGit 操作前请先确认当前分支状态。'
      }
    ],
    actionGroups: [
      {
        category: '项目入口',
        icon: 'FolderOpen',
        actions: [
          { id: 'code-project', label: '项目上下文分析', icon: 'FolderSearch', prompt: '请先扫描当前项目的目录结构，了解项目全貌，然后告诉我项目架构和技术栈。', description: '扫描目录→分析架构' },
          { id: 'code-terminal', label: '执行终端命令', icon: 'Terminal', prompt: '请帮我执行以下命令：[命令]\n\n请确认当前目录是否正确。', description: '执行系统命令+超时控制' },
        ]
      },
      {
        category: '代码编写',
        icon: 'Code2',
        actions: [
          { id: 'code-gen', label: '生成代码', icon: 'Wand2', prompt: '请用以下技术栈帮我实现：[语言/框架] 功能：[描述] 输入/输出：[I/O]\n\n给出完整可运行代码和关键解释。', description: '含完整代码+技术解释' },
          { id: 'code-review', label: 'AI 代码审查 (OCR)', icon: 'ShieldCheck', prompt: '请使用 AI 代码审查工具对当前项目变更进行审查：\n\n1. code_review(action="status") 检查 OCR 状态\n2. code_review(action="review") 审查未提交变更\n3. 汇总审查意见+修复建议', description: '阿里OCR+混合架构审查' },
          { id: 'code-explain', label: '解释代码', icon: 'BookOpen', prompt: '请逐行解释以下代码的工作原理，包括核心逻辑、数据流和设计意图：\n\n```[粘贴代码]```', description: '逐行解释+数据流分析' },
          { id: 'code-bug', label: '修复 Bug', icon: 'Bug', prompt: '以下代码存在问题：[异常现象]\n\n```[粘贴代码]```\n\n请定位问题、解释根因、给出修复代码。', description: '定位→根因→修复→说明' },
          { id: 'code-refactor', label: '重构代码', icon: 'RefreshCw', prompt: '请重构以下代码，提升可读性、可维护性和性能，保持行为不变。说明每处重构理由：\n\n```[粘贴代码]```', description: '优化结构+说明理由' },
          { id: 'code-test', label: '编写测试', icon: 'FlaskConical', prompt: '请为以下代码编写单元测试：[测试框架] 覆盖正常/边界/异常情况：\n\n```[粘贴代码]```', description: '三路径覆盖+完整测试代码' },
        ]
      },
      {
        category: '版本控制与修改',
        icon: 'GitBranch',
        actions: [
          { id: 'code-file-edit', label: '修改项目文件', icon: 'FileEdit', prompt: '请帮我修改 [文件路径] 中的代码：[描述修改需求]\n\n请先读取文件内容，再做精确替换。', description: '先读后写+精确替换' },
          { id: 'code-git', label: 'Git 操作', icon: 'GitBranch', prompt: '请帮我 [git操作描述，如：查看当前git状态并提交更改]\n\nGit 操作前请先确认当前分支状态。', description: 'status/diff/commit/分支管理' },
        ]
      },
    ]
  },

  // ---------- 设计模式 ----------
  design: {
    id: 'design',
    name: '设计模式',
    icon: 'PenTool',
    description: '架构设计 · UI/UX · 数据库 · API · 流程图',
    // systemPrompt 已拆分到 modes/prompts.ts，仅在发送消息时动态加载
    systemPrompt: '',
    quickActions: [
      {
        id: 'design-arch',
        label: '系统架构设计',
        icon: 'Network',
        prompt: '请设计一个系统的整体架构：\n\n系统名称：[请填写]\n核心功能：[请填写：系统需要做什么]\n预期规模：[请填写：如日活用户数、QPS、数据量]\n技术约束：[请填写：如技术栈偏好、预算限制]\n\n请输出架构设计文档，包含架构图（Mermaid）、模块划分、技术选型和理由。'
      },
      {
        id: 'design-ui',
        label: 'UI/UX 方案',
        icon: 'Layout',
        prompt: '请设计一个产品页面的 UI/UX 方案：\n\n产品类型：[请填写：如 Web 应用、移动 App]\n页面/功能：[请填写：如登录页、仪表盘、商品详情]\n目标用户：[请填写]\n\n请输出页面结构、交互流程（Mermaid）、关键组件设计和用户体验建议。'
      },
      {
        id: 'design-db',
        label: '数据库设计',
        icon: 'Database',
        prompt: '请为以下业务设计数据库：\n\n业务场景：[请填写：如电商订单、博客系统、任务管理]\n核心实体：[请填写：如用户、商品、订单]\n特殊需求：[请填写：如高并发读、历史数据归档]\n\n请输出 ER 图（Mermaid）、表结构设计（字段/类型/约束/索引）和关键查询优化建议。'
      },
      {
        id: 'design-api',
        label: 'API 接口设计',
        icon: 'Webhook',
        prompt: '请设计一套 RESTful API：\n\n业务场景：[请填写]\n核心资源：[请填写]\n客户端：[请填写：如 Web、移动端、第三方]\n\n请输出接口列表（方法/路径/描述）、请求与响应示例、状态码规范、鉴权方案。可用 Mermaid 绘制时序图。'
      },
      {
        id: 'design-tech',
        label: '技术选型分析',
        icon: 'GitCompare',
        prompt: '请对以下技术选型做对比分析：\n\n候选技术：[请填写：如 React vs Vue、MySQL vs PostgreSQL]\n应用场景：[请填写]\n关注维度：[请填写：如性能、生态、学习成本、团队现状]\n\n请用对比表格 + 分析给出推荐方案及理由。'
      },
      {
        id: 'design-flow',
        label: '流程图设计',
        icon: 'Workflow',
        prompt: '请根据以下业务流程设计一张 Mermaid 流程图，并解释关键节点：\n\n流程描述：[请填写：如用户下单到收货的完整流程]\n\n请用 flowchart 绘制，并标注判断分支。'
      },
      {
        id: 'design-critique',
        label: 'UI 设计审查',
        icon: 'SearchCheck',
        prompt: '请审查以下 React 组件的设计质量（层级/布局/颜色/排版/交互）：\n\n```\n[粘贴代码或描述]\n```'
      },
      {
        id: 'design-audit',
        label: 'UI 质量审计',
        icon: 'ClipboardCheck',
        prompt: '请对以下页面做完整的 UI 质量审计，包括语义化、响应式、可访问性检查：\n\n```\n[粘贴代码或描述]\n```'
      },
      {
        id: 'design-code-review',
        label: 'AI 代码审查 (OCR)',
        icon: 'ShieldCheck',
        prompt: '请使用 AI 代码审查工具审查生成的 UI 代码变更：\n\n1. 先用 code_review(action="status") 检查 OCR 安装与配置状态\n2. 用 code_review(action="review") 审查未提交的 UI 代码变更\n3. 汇总审查意见，按严重程度分类并给出修复建议\n\n如果 OCR 未安装，提示安装命令：npm i -g @alibaba-group/open-code-review'
      },
      {
        id: 'design-color',
        label: '颜色系统设计',
        icon: 'Palette',
        prompt: '请为 [主色 hex] 设计一套完整的颜色系统（色阶/语义色/暗色模式变体），推荐使用 design_color 工具分析。'
      },
      {
        id: 'design-multi',
        label: '多方向 UI 方案',
        icon: 'LayoutPanelTop',
        prompt: '请为 [页面/组件需求] 生成 3-5 个不同风格的 UI 设计方案，并对比优劣。'
      }
    ],
    actionGroups: [
      {
        category: 'UI 生成与预览',
        icon: 'PenTool',
        actions: [
          { id: 'design-gen', label: '生成 UI 组件', icon: 'Wand2', prompt: '请设计一个 [组件类型] UI组件：[功能描述]\n\n请生成完整的 React + Tailwind CSS 代码，并使用 design_preview 预览。', description: 'React+Tailwind完整代码' },
          { id: 'design-multi', label: '多方向 UI 方案', icon: 'LayoutPanelTop', prompt: '请为 [页面/组件需求] 生成 3-5 个不同风格的 UI 设计方案，并对比优劣。', description: '5种风格方向+对比分析' },
          { id: 'design-preview', label: '实时预览', icon: 'Eye', prompt: '请使用 design_preview 工具预览我们刚才生成的 UI 组件。', description: '独立窗口实时预览' },
        ]
      },
      {
        category: '审查与质量',
        icon: 'SearchCheck',
        actions: [
          { id: 'design-critique', label: 'UX 设计审查', icon: 'SearchCheck', prompt: '请审查以下 React 组件的设计质量（层级/布局/颜色/排版/交互）：\n\n```[粘贴代码]```', description: '五维度UX审查+评分' },
          { id: 'design-audit', label: 'UI 质量审计', icon: 'ClipboardCheck', prompt: '请对以下页面做完整 UI 质量审计（语义化/响应式/暗色模式/对比度）：\n\n```[粘贴代码]```', description: '量化分析+字母等级评分' },
          { id: 'design-a11y', label: '无障碍检查', icon: 'Eye', prompt: '请对以下 UI 做无障碍专项检查（WCAG 2.1 AA）：ARIA/键盘导航/屏幕阅读器/对比度\n\n```[粘贴代码]```', description: 'WCAG 2.1 AA标准检查' },
          { id: 'design-code-review', label: 'AI 代码审查 (OCR)', icon: 'ShieldCheck', prompt: '请使用 AI 代码审查工具审查生成的 UI 代码变更：\n\n1. code_review(action="status") 检查 OCR 状态\n2. code_review(action="review") 审查未提交的 UI 代码变更\n3. 汇总审查意见+修复建议', description: '阿里OCR审查UI代码' },
        ]
      },
      {
        category: '架构与系统设计',
        icon: 'Network',
        actions: [
          { id: 'design-arch', label: '系统架构设计', icon: 'Network', prompt: '请设计系统架构：[系统名称] 功能：[功能] 规模：[预期规模] 约束：[技术约束]\n\n输出架构图(Mermaid)、模块划分、技术选型。', description: 'Mermaid架构图+模块设计' },
          { id: 'design-db', label: '数据库设计', icon: 'Database', prompt: '请设计数据库：[业务场景] 实体：[核心实体] 需求：[特殊需求]\n\n输出ER图(Mermaid)、表结构、索引优化。', description: 'ER图+表结构+索引' },
          { id: 'design-api', label: 'API 接口设计', icon: 'Webhook', prompt: '请设计RESTful API：[业务场景] 资源：[核心资源]\n\n输出接口列表、请求响应示例、鉴权方案。', description: '端点+请求/响应+鉴权' },
          { id: 'design-flow', label: '流程图设计', icon: 'Workflow', prompt: '请设计业务流程：[流程描述]\n\n用Mermaid flowchart绘制，标注判断分支和关键节点。', description: 'Mermaid流程图+关键节点' },
          { id: 'design-tech', label: '技术选型分析', icon: 'GitCompare', prompt: '请做技术选型对比：[候选技术] 场景：[场景] 维度：[关注维度]\n\n对比表格+推荐方案+理由。', description: '对比分析+推荐+理由' },
          { id: 'design-color', label: '颜色系统设计', icon: 'Palette', prompt: '请为 [主色 hex] 设计完整颜色系统：色阶/语义色/暗色模式变体。使用 design_color 工具分析。', description: '色阶+对比度+暗色适配' },
        ]
      },
    ]
  }
}

export const MODE_LIST = Object.values(MODE_CONFIGS)
