import type { ModeConfig } from '@shared/types'

/** 编程模式配置 — 代码生成 / 审查 / 解释 / 重构 / 测试 */
export const CODING_CONFIG: ModeConfig = {
  id: 'coding',
  name: '编程模式',
  icon: 'Code2',
  description: '代码生成 · 审查 · 解释 · 重构 · 测试',
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
}
