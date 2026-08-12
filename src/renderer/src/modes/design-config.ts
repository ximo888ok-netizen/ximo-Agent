import type { ModeConfig } from '@shared/types'

/** 设计模式配置 — 架构设计 / UI/UX / 数据库 / API / 流程图 */
export const DESIGN_CONFIG: ModeConfig = {
  id: 'design',
  name: '设计模式',
  icon: 'PenTool',
  description: '架构设计 · UI/UX · 数据库 · API · 流程图',
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
