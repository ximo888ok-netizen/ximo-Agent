import type { ModeConfig } from '@shared/types'

/** 办公模式配置 — 文档撰写 / 邮件 / 会议纪要 / 方案报告 / 操作录制 / 技能复用 */
export const OFFICE_CONFIG: ModeConfig = {
  id: 'office',
  name: '办公模式',
  icon: 'Briefcase',
  description: '文档撰写 · 邮件 · 会议纪要 · 方案报告 · 操作录制 · 技能复用',
  systemPrompt: '',
  /**
   * 空态快捷操作 — 按钮的唯一定义源，组件不得在内部硬编码 prompt 数组。
   * 注：后台工具（内嵌浏览器 / 录制技能 / 操控电脑）已迁入输入区「工具」面板，不在此列。
   *     要增减空态按钮，改这里即可，无需动组件。
   */
  actionGroups: [
    {
      category: '内容生产',
      icon: 'FileText',
      actions: [
        {
          id: 'office-ppt',
          label: '生成 PPT',
          icon: 'LayoutDashboard',
          prompt: '请帮我生成一份 PPT 大纲和内容。请先询问我 PPT 的主题、页数和受众，然后根据我的回答逐页生成内容（每页包含标题、要点和备注）。',
          description: '逐页生成大纲与内容'
        },
        {
          id: 'office-doc',
          label: '生成文档',
          icon: 'FileText',
          prompt: '请帮我生成一份专业文档。请先询问我文档类型（报告/方案/纪要/说明书）、主题和受众，然后输出结构清晰、专业得体的文档。',
          description: '报告 / 方案 / 纪要'
        },
        {
          id: 'office-report',
          label: '工作汇报',
          icon: 'ClipboardCheck',
          prompt: '请帮我撰写一份工作汇报，按"完成事项 / 关键进展 / 问题与风险 / 下一步计划"的结构输出。请先询问我本周的具体工作内容。',
          description: '含进展与风险的结构化汇报'
        },
      ]
    },
    {
      category: '数据与研究',
      icon: 'Search',
      actions: [
        {
          id: 'office-data',
          label: '数据分析',
          icon: 'Table',
          prompt: '请帮我进行数据分析。请先询问我数据来源、分析主题和关注指标，然后使用搜索工具获取相关数据并进行分析。',
          description: '整理表格并给出分析'
        },
        {
          id: 'office-research',
          label: '深度研究',
          icon: 'Brain',
          prompt: '请帮我进行深度研究。请先询问我研究话题，然后搜索多个来源、综合分析后生成研究摘要，包含背景、现状、趋势和结论。',
          description: '多方来源综合分析'
        },
        {
          id: 'office-search',
          label: '联网搜索',
          icon: 'Search',
          prompt: '请在互联网上搜索：[关键词/问题]\n\n请搜索最新最权威的信息并给出引用来源。',
          description: '多引擎搜索 + 引用来源'
        },
      ]
    },
  ]
}
