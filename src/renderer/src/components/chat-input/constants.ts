import type { Mode } from '@shared/types'
import designSystemsCatalog from '@renderer/components/design/design-systems-catalog.json'
import uiComponentsCatalog from '@renderer/components/design/ui-components-catalog.json'

/** 每种模式的占位符文案 */
export const MODE_PLACEHOLDERS: Record<Mode, string> = {
  office: '帮你整理论文综述、编写 PPT、分析 Excel...  ✨ 点击增强按钮优化提示词',
  coding: '帮你编写代码、修复 Bug、重构项目...  ✨ 点击增强按钮优化提示词',
  design: '从想法到设计，生成 UI 组件...  ✨ 点击增强按钮优化提示词'
}

// 设计风格目录 — 模块级常量，避免每次 render 重新创建
export const STYLE_CATALOG = designSystemsCatalog as Array<{ id: string; name: string; category: string; tokens: { accent: string; bg: string; fg: string; surface: string } }>

// UI 组件目录 — 模块级常量
export const COMPONENT_CATALOG = (uiComponentsCatalog as { components: Array<{ id: string; name: string; nameCn: string; category: string; categoryCn: string; dependencies: string[]; props: string[] }> }).components

/** 多模式斜杠命令 */
export const SLASH_COMMANDS_BY_MODE: Record<string, Array<{ cmd: string; label: string; systemHint: string }>> = {
  coding: [
    { cmd: '/plan', label: '规划任务', systemHint: '【Plan 模式】请帮我规划以下任务的执行方向。\n\n要求：\n1. 分析任务，识别关键决策点和不确定项\n2. 对每个不确定项，用 plan_ask 工具实时向用户提问\n3. 收集所有回答后，整理执行方案\n4. 用 plan_ask 工具向用户展示方案并请求确认\n5. 用户确认后开始执行\n\n任务描述：' },
    { cmd: '/spec', label: '细化规范', systemHint: '【Spec 模式】请根据以下需求细化完整的规范文档。\n\n要求：\n1. 分析需求，拆解为具体任务项\n2. 为每项任务定义验收标准\n3. 用 spec_review 工具将完整规范弹窗展示给用户审核\n4. 用户确认后严格按照规范执行，不做范围外修改\n\n需求描述：' }
  ],
  office: [
    { cmd: '/doc', label: '生成文档', systemHint: '请帮我生成一份专业文档。\n\n文档类型：[报告/方案/纪要/说明书]\n主题：[请填写]\n受众：[请填写]' },
    { cmd: '/ppt', label: '生成 PPT', systemHint: '请帮我生成一份PPT大纲和内容。主题：[请填写主题]' },
    { cmd: '/summary', label: '任务摘要', systemHint: '请帮我总结当前任务的进展，包括已完成的工作、待解决的问题和下一步计划。' },
    { cmd: '/translate', label: '翻译', systemHint: '请将以下内容翻译为目标语言（默认英文），保持专业性和流畅性：\n\n' },
    { cmd: '/record', label: '录制技能', systemHint: '请使用 skill_record 工具开始录制技能。先用浏览器导航到目标页面，然后执行操作序列，最后停止录制并生成技能。\n\n调用 skill_record(action="start") 开始，完成后调用 skill_record(action="stop", name="技能名", description="描述") 结束。' },
    { cmd: '/skill', label: '调用技能', systemHint: '请使用 skill_record(action="status") 查看已有的技能列表，然后根据我的任务需求调用最匹配的技能。' },
    { cmd: '/browse', label: '内嵌浏览器', systemHint: '请用浏览器打开目标网页，自主完成网页内容读取与操作。请告诉我目标 URL。' },
    { cmd: '/desktop', label: '操作桌面', systemHint: '请帮我操作桌面应用。先用 find_roots() 查找目标窗口，再 observe_ui() 查看 UI 元素，然后用 act_ui() 执行操作。\n\n请告诉我：目标应用名称 + 需要执行的操作。' }
  ],
  design: [
    { cmd: '/color', label: '颜色系统', systemHint: '请使用 design_color 工具生成一套颜色系统。主色：[请填写 hex]' },
    { cmd: '/critique', label: '设计审查', systemHint: '请使用 design_critique 工具对以下 UI 代码进行设计审查：\n\n' },
    { cmd: '/audit', label: '质量审计', systemHint: '请使用 design_audit 工具对以下 UI 代码进行质量审计：\n\n' },
    { cmd: '/a11y', label: '无障碍检查', systemHint: '请使用 design_a11y 工具对以下 UI 代码进行无障碍审查：\n\n' },
    { cmd: '/preview', label: '预览组件', systemHint: '请使用 design_preview 工具预览以下 UI 组件：\n\n' }
  ]
}

export function getSlashCommands(mode: string): Array<{ cmd: string; label: string; systemHint: string }> {
  return SLASH_COMMANDS_BY_MODE[mode] || []
}
