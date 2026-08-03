import agentsRawData from '@shared/agents-raw.json'

export interface AgentEntry {
  id: string; division: string; name: string; description: string
  emoji: string; vibe: string; personality: string; tools: string[]; color: string
}

// 静态导入专家数据（Vite 构建时内联打包，无需运行时文件读取）
export const agentsData = (agentsRawData as { agents: AgentEntry[]; total: number })

/** 部门 → 推荐工具映射 */
export const DIVISION_TOOLS: Record<string, string[]> = {
  engineering: ['file_read', 'file_write', 'file_edit', 'file_search', 'multi_edit', 'code_execute', 'code_lint', 'code_format', 'terminal_exec', 'git_operations', 'project_context', 'project_index', 'dependency_check', 'todo_write'],
  design: ['ui_generate', 'design_preview', 'design_critique', 'design_audit', 'design_a11y', 'design_color', 'file_read', 'file_write', 'web_search', 'todo_write'],
  academic: ['web_search', 'web_fetch', 'web_research', 'web_cache', 'file_read', 'file_write', 'todo_write'],
  marketing: ['web_search', 'web_fetch', 'web_research', 'file_read', 'file_write', 'browser_navigate', 'browser_screenshot', 'todo_write'],
  finance: ['web_search', 'web_fetch', 'file_read', 'file_write', 'todo_write', 'code_execute'],
  'game-development': ['file_read', 'file_write', 'file_edit', 'file_search', 'code_execute', 'code_lint', 'terminal_exec', 'dependency_check', 'todo_write'],
  gis: ['file_read', 'file_write', 'file_edit', 'code_execute', 'terminal_exec', 'web_search', 'todo_write'],
  healthcare: ['web_search', 'web_fetch', 'web_research', 'file_read', 'file_write', 'todo_write'],
  'paid-media': ['web_search', 'web_fetch', 'web_research', 'file_read', 'file_write', 'browser_navigate', 'browser_screenshot', 'todo_write'],
  product: ['web_search', 'web_fetch', 'web_research', 'file_read', 'file_write', 'todo_write', 'ui_generate', 'design_preview'],
  'project-management': ['web_search', 'web_fetch', 'file_read', 'file_write', 'todo_write', 'terminal_exec'],
  sales: ['web_search', 'web_fetch', 'web_research', 'file_read', 'file_write', 'todo_write'],
  security: ['file_read', 'file_edit', 'file_search', 'code_execute', 'terminal_exec', 'web_search', 'web_fetch', 'todo_write'],
  'spatial-computing': ['file_read', 'file_write', 'file_edit', 'code_execute', 'terminal_exec', 'web_search', 'todo_write'],
  specialized: ['web_search', 'web_fetch', 'web_research', 'file_read', 'file_write', 'todo_write'],
  support: ['web_search', 'web_fetch', 'file_read', 'file_write', 'todo_write'],
  testing: ['file_read', 'file_edit', 'file_search', 'code_execute', 'code_lint', 'terminal_exec', 'todo_write']
}

/** 关键词 → 额外工具补充（在部门基础上叠加） */
export const KEYWORD_TOOL_RULES: Array<{ keywords: string[]; tools: string[] }> = [
  { keywords: ['代码', '编程', '开发', 'code', 'programming', 'develop', '前端', '后端', 'frontend', 'backend'], tools: ['file_read', 'file_edit', 'code_execute', 'terminal_exec', 'code_lint', 'code_format'] },
  { keywords: ['设计', 'UI', '界面', 'design', 'interface', '视觉', 'visual'], tools: ['ui_generate', 'design_preview', 'design_critique', 'design_audit'] },
  { keywords: ['搜索', '研究', 'search', 'research', '调研', '分析'], tools: ['web_search', 'web_fetch', 'web_research'] },
  { keywords: ['浏览器', '网页', 'browser', 'web', '爬虫', 'crawl'], tools: ['browser_navigate', 'browser_screenshot', 'browser_click', 'browser_type', 'browser_get_content'] },
  { keywords: ['桌面', '操控', '电脑', 'desktop', 'computer', '自动化', 'automate'], tools: ['computer_use'] },
  { keywords: ['网络', '抓包', 'network', 'capture', 'API', '接口'], tools: ['network_capture', 'network_replay', 'api_extract'] },
  { keywords: ['Git', '版本', 'commit', 'branch'], tools: ['git_operations'] },
  { keywords: ['数据库', 'database', 'SQL', 'DB'], tools: ['terminal_exec', 'code_execute'] },
  { keywords: ['无障碍', 'accessibility', 'a11y', 'WCAG'], tools: ['design_a11y', 'design_audit'] },
  { keywords: ['颜色', 'color', '配色', '色彩'], tools: ['design_color'] },
  { keywords: ['安全', 'security', '漏洞', 'vulnerability', 'penetration'], tools: ['code_lint', 'terminal_exec'] },
  { keywords: ['性能', 'performance', '优化', 'optimize'], tools: ['code_execute', 'terminal_exec'] }
]

/** 部门 → 预设工作流 */
export const DIVISION_WORKFLOWS: Record<string, string> = {
  engineering: `预设工作流（工程类）：
1. 理解需求 → 明确技术栈、目标和约束
2. project_index 扫描项目符号索引，了解代码全貌
3. file_search 搜索相关代码定位关键文件
4. file_read 精准读取相关代码段（大文件用 startLine/endLine）
5. file_edit / multi_edit 修改代码
6. code_execute 或 terminal_exec 编译/运行验证
7. code_lint 检查代码规范
8. code_format 格式化
9. git_operations 提交变更`,

  design: `预设工作流（设计类）：
1. 理解设计需求和目标用户
2. ui_generate 生成多个设计方向的 React 组件
3. design_preview 实时预览效果
4. design_critique UX 质量审查（层级/信息架构/认知负荷）
5. design_audit 可量化审计（语义化/响应式/暗色模式/对比度）
6. design_a11y 无障碍专项检查
7. design_color 颜色系统分析和优化
8. 迭代改进直到达标`,

  academic: `预设工作流（学术研究类）：
1. 明确研究问题和范围
2. web_search 搜索文献和资料
3. web_research 进行深度研究分析
4. web_fetch 抓取关键文献详细内容
5. web_cache 回查已访问的页面
6. 分析、综合、归纳
7. file_write 撰写研究报告`,

  marketing: `预设工作流（营销类）：
1. 理解营销目标和受众
2. web_search 搜索市场趋势和竞品
3. web_research 深度研究分析
4. web_fetch 抓取关键数据
5. browser_navigate + browser_screenshot 查看竞品页面
6. 分析并制定策略
7. file_write 输出营销方案`,

  finance: `预设工作流（财务类）：
1. 理解财务分析目标
2. web_search 搜索市场数据和财经信息
3. web_fetch 抓取具体数据
4. code_execute 进行数据计算和分析
5. file_write 撰写财务报告`,

  'game-development': `预设工作流（游戏开发类）：
1. 理解游戏设计文档和需求
2. file_search 搜索现有代码结构
3. file_read 读取相关代码
4. file_edit / multi_edit 修改游戏逻辑
5. code_execute 运行测试
6. terminal_exec 构建和调试
7. dependency_check 管理依赖
8. code_format 格式化`,

  gis: `预设工作流（GIS 类）：
1. 理解空间分析需求
2. file_search 搜索相关代码
3. file_read 读取数据源和配置
4. code_execute 运行空间分析脚本
5. terminal_exec 执行 GIS 工具命令
6. web_search 查询参考数据
7. file_write 输出分析结果`,

  healthcare: `预设工作流（医疗健康类）：
1. 理解医疗领域需求
2. web_search 搜索医学文献和指南
3. web_research 深度研究
4. web_fetch 获取详细资料
5. 分析综合
6. file_write 输出报告`,

  'paid-media': `预设工作流（付费媒体类）：
1. 理解广告投放目标
2. web_search 搜索行业数据和基准
3. web_research 深度分析
4. browser_navigate + browser_screenshot 查看广告平台
5. 分析并制定投放策略
6. file_write 输出方案`,

  product: `预设工作流（产品类）：
1. 理解产品目标和用户需求
2. web_search 搜索市场和竞品
3. web_research 深度研究
4. ui_generate 生成产品原型
5. design_preview 预览效果
6. 分析并制定产品策略
7. file_write 输出产品文档`,

  'project-management': `预设工作流（项目管理类）：
1. 理解项目目标和范围
2. todo_write 创建任务分解结构
3. web_search 搜索最佳实践
4. file_read 读取项目文档
5. terminal_exec 执行项目管理命令
6. file_write 输出项目计划`,

  sales: `预设工作流（销售类）：
1. 理解销售目标
2. web_search 搜索潜在客户和行业信息
3. web_research 深度研究
4. web_fetch 获取客户资料
5. 分析并制定销售策略
6. file_write 输出销售方案`,

  security: `预设工作流（安全类）：
1. 理解安全评估目标
2. file_search 搜索代码中的安全相关模式
3. file_read 读取关键代码段
4. code_lint 静态安全分析
5. terminal_exec 运行安全扫描工具
6. web_search 查询漏洞信息和修复方案
7. file_edit 修复安全问题
8. file_write 输出安全报告`,

  'spatial-computing': `预设工作流（空间计算类）：
1. 理解空间计算需求
2. file_search 搜索相关代码
3. file_read 读取现有实现
4. code_execute 运行计算脚本
5. terminal_exec 构建和测试
6. file_write 输出结果`,

  specialized: `预设工作流（专业领域类）：
1. 理解专业需求
2. web_search 搜索领域资料
3. web_research 深度研究分析
4. web_fetch 获取详细内容
5. 分析综合
6. file_write 输出报告`,

  support: `预设工作流（支持类）：
1. 理解客户问题
2. web_search 搜索解决方案
3. web_fetch 获取详细文档
4. file_read 查看相关文档
5. 分析并给出解决方案
6. file_write 输出回复`,

  testing: `预设工作流（测试类）：
1. 理解测试需求
2. file_search 搜索测试相关代码
3. file_read 读取测试文件和被测代码
4. file_edit 编写/修改测试用例
5. code_execute 运行测试
6. code_lint 检查测试代码质量
7. terminal_exec 执行测试命令
8. file_write 输出测试报告`
}

/** 默认工具集（无法匹配部门时使用） */
export const DEFAULT_TOOLS = ['web_search', 'web_fetch', 'file_read', 'file_write', 'todo_write']

/** 默认工作流 */
export const DEFAULT_WORKFLOW = `预设工作流：
1. 理解任务目标和约束
2. web_search 搜索相关信息
3. web_fetch 获取详细内容
4. 分析综合
5. file_write 输出结果`

/** 子 Agent 工具调用最大轮次 */
export const MAX_SUB_AGENT_ROUNDS = 15

/** 子 Agent 工具结果截断长度 */
export const MAX_SUB_TOOL_RESULT = 8000

/**
 * 分析专家提示词，推断所需工具和预设工作流
 * 综合考虑：部门归属 + 描述/人格/风格中的关键词
 */
export function analyzeExpert(agent: AgentEntry): { tools: string[]; workflow: string } {
  // 1. 基于部门获取基础工具集
  const baseTools = DIVISION_TOOLS[agent.division] ?? DEFAULT_TOOLS
  const toolSet = new Set<string>(baseTools)

  // 2. 关键词扫描，叠加额外工具
  const fullText = `${agent.description} ${agent.personality} ${agent.vibe}`.toLowerCase()
  for (const rule of KEYWORD_TOOL_RULES) {
    if (rule.keywords.some(kw => fullText.includes(kw.toLowerCase()))) {
      for (const t of rule.tools) toolSet.add(t)
    }
  }

  // 3. 如果专家数据自带 tools 字段，也纳入
  if (agent.tools && agent.tools.length > 0) {
    for (const t of agent.tools) toolSet.add(t)
  }

  // 4. 获取预设工作流
  const workflow = DIVISION_WORKFLOWS[agent.division] ?? DEFAULT_WORKFLOW

  return { tools: Array.from(toolSet), workflow }
}

/** 生成专家系统提示词 */
export function buildExpertSystemPrompt(agent: AgentEntry): string {
  const { tools, workflow } = analyzeExpert(agent)

  return `你现在扮演 **${agent.name}**（${agent.emoji}）。

${agent.personality}

## 你的核心能力
${agent.description}

## 你的工作风格
${agent.vibe}

## 可用工具
你已被配置以下工具，请在需要时主动使用：
${tools.map(t => `- \`${t}\``).join('\n')}

## ${workflow}

## 输出要求
- 始终以 ${agent.name} 的专业视角分析和回答问题
- 使用该领域专业术语，但确保可理解
- 给出可操作的具体建议，而非泛泛而谈
- 主动使用可用工具以提升回答质量
- 按照预设工作流的步骤推进任务，确保有序执行`
}
