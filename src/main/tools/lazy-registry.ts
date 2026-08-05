/**
 * 工具懒加载注册表
 *
 * 启动时零工具加载，按模式（mode）按需唤醒。
 * 同一模块组的工具共享一次动态 import，加载后缓存实例。
 *
 * 设计要点：
 * - 模块组 → 工厂函数：一次动态 import 加载同组所有工具
 * - 工具名 → 模块组：通过工具名反查所属模块组
 * - 模式 → 模块组列表：每个模式只加载所需模块组
 * - 已加载的模块组缓存在 moduleCache 中，不重复实例化
 */

import type { Tool } from './Tool'
import { toolRegistry } from './ToolRegistry'

// ---------------------------------------------------------------------------
// 模块组 → 工厂函数
// 每个工厂函数执行一次动态 import + new，返回该组的所有工具实例
// ---------------------------------------------------------------------------

type ToolFactory = () => Promise<Tool[]>

const moduleFactories: Record<string, ToolFactory> = {
  // WebIntelligence — 联网搜索 / 抓取 / 缓存 / 研究
  web_intelligence: async () => {
    const { WebSearchTool, WebFetchTool, WebResearchTool, WebCacheTool } = await import('./WebIntelligence')
    return [new WebSearchTool(), new WebFetchTool(), new WebCacheTool(), new WebResearchTool()]
  },

  // UIGenerate — UI 组件生成
  ui_generate: async () => {
    const { UIGenerateTool } = await import('./UIGenerateTool')
    return [new UIGenerateTool()]
  },

  // CodeQuality — 代码执行与质量
  code_quality: async () => {
    const { CodeEnhancedExecuteTool, CodeLintTool, CodeFormatTool, DependencyCheckTool, ProjectIndexTool } = await import('./CodeQuality')
    const { ProjectContextTool } = await import('./CodeQuality/ProjectContextTool')
    return [
      new CodeEnhancedExecuteTool(), new CodeLintTool(), new CodeFormatTool(),
      new DependencyCheckTool(), new ProjectContextTool(), new ProjectIndexTool()
    ]
  },

  // CodeReview — 阿里 OCR AI 代码审查（独立模块组，coding/design 模式共用）
  code_review: async () => {
    const { CodeReviewTool } = await import('./CodeQuality')
    return [new CodeReviewTool()]
  },

  // FileSystem — 文件系统
  file_system: async () => {
    const { FileReadTool, FileWriteTool, FileListTool, FileSearchTool, FileEditTool, FileDeleteTool, MultiEditTool, MoveFileTool, TodoWriteTool } = await import('./FileSystem')
    return [
      new FileReadTool(), new FileWriteTool(), new FileListTool(), new FileSearchTool(),
      new FileEditTool(), new FileDeleteTool(), new MultiEditTool(), new MoveFileTool(), new TodoWriteTool()
    ]
  },

  // Terminal — 终端命令执行
  terminal: async () => {
    const { TerminalExecTool } = await import('./Terminal')
    return [new TerminalExecTool()]
  },

  // Git — 版本控制
  git: async () => {
    const { GitTool } = await import('./Git')
    return [new GitTool()]
  },

  // Browser — 浏览器自动化
  browser: async () => {
    const { BrowserNavigateTool, BrowserScreenshotTool, BrowserClickTool, BrowserTypeTool, BrowserGetContentTool, BrowserExecuteJSTool, BrowserNetworkTool } = await import('./Browser')
    return [
      new BrowserNavigateTool(), new BrowserScreenshotTool(), new BrowserClickTool(),
      new BrowserTypeTool(), new BrowserGetContentTool(), new BrowserExecuteJSTool(), new BrowserNetworkTool()
    ]
  },

  // Design — 设计审查 + 模板系统 + 组件库
  design: async () => {
    const { DesignCritiqueTool, DesignAuditTool, DesignA11yTool, DesignColorTool, DesignPreviewTool, DesignTemplateTool, DesignStyleTool, DesignComponentTool, ThemeDesignTool } = await import('./Design')
    return [new DesignCritiqueTool(), new DesignAuditTool(), new DesignA11yTool(), new DesignColorTool(), new DesignPreviewTool(), new DesignTemplateTool(), new DesignStyleTool(), new DesignComponentTool(), new ThemeDesignTool()]
  },

  // ComputerUse — 一体化桌面操控 + 兼容旧工具
  computer_use: async () => {
    const { ComputerUseTool, FindRootsTool, ObserveUiTool, SearchUiTool, ActUiTool, ReadTextTool, WaitForTool } = await import('./ComputerUse')
    return [new ComputerUseTool(), new FindRootsTool(), new ObserveUiTool(), new SearchUiTool(), new ActUiTool(), new ReadTextTool(), new WaitForTool()]
  },

  // Network — 网络抓包
  network: async () => {
    const { NetworkCaptureTool, NetworkReplayTool, StorageInspectTool, JSHookTool, APIExtractTool } = await import('./Network')
    return [new NetworkCaptureTool(), new NetworkReplayTool(), new StorageInspectTool(), new JSHookTool(), new APIExtractTool()]
  },

  // Skill — 技能系统 + AI 专家库 + 动态工具创建
  skill: async () => {
    const { SkillRecordTool, SkillInvokeTool, AgentExpertTool } = await import('./Skill')
    const { CreateToolTool } = await import('./DynamicTool')
    return [new SkillRecordTool(), new SkillInvokeTool(), new AgentExpertTool(), new CreateToolTool()]
  },

  // Vision — 视觉模型（Agnes 2.5 Flash），Agent 的「眼睛」
  vision: async () => {
    const { VisionTool } = await import('./Vision')
    return [new VisionTool()]
  },

  // Memory — 模式记忆 + 知识库
  memory: async () => {
    const { MemoryTool } = await import('./MemoryTool')
    const { KnowledgeTool } = await import('./KnowledgeTool')
    return [new MemoryTool(), new KnowledgeTool()]
  },

  // PlanSpec — 任务规划提问与规范审核
  plan_spec: async () => {
    const { PlanAskTool, SpecReviewTool } = await import('./PlanSpecTool')
    return [new PlanAskTool(), new SpecReviewTool()]
  },

  // Office — 办公文档（OfficeCLI 驱动）：Word/Excel/PowerPoint 读改
  office: async () => {
    const { OfficeDocsTool } = await import('./Office')
    return [new OfficeDocsTool()]
  }
}

// ---------------------------------------------------------------------------
// 模式 → 所需模块组列表
// ---------------------------------------------------------------------------

const modeModules: Record<string, string[]> = {
  office: [
    'web_intelligence', 'computer_use',
    'file_system', 'terminal', 'git', 'code_quality', 'code_review', 'skill', 'vision', 'memory', 'office'
  ],
  coding: [
    'code_quality', 'code_review', 'file_system', 'terminal', 'git', 'web_intelligence', 'skill', 'vision', 'memory', 'plan_spec'
  ],
  design: [
    'ui_generate', 'design', 'file_system', 'code_review', 'web_intelligence', 'skill', 'vision', 'memory'
  ]
}

// ---------------------------------------------------------------------------
// 模式 → 工具名列表（与原 index.ts 完全一致）
// ---------------------------------------------------------------------------

export const modeToolNames: Record<string, string[]> = {
  office: [
    // 联网搜索
    'web_search', 'web_fetch', 'web_cache', 'web_research',
    // 桌面 UI 操控（computer_use 为一体化工具，优先使用）
    'computer_use', 'find_roots', 'observe_ui', 'search_ui', 'act_ui', 'read_text', 'wait_for',
    // 文件系统（全部权限）
    'file_read', 'file_write', 'file_list', 'file_search', 'file_edit', 'file_delete',
    'multi_edit', 'move_file', 'todo_write',
    // 终端命令执行
    'terminal_exec',
    // Git 操作
    'git_operations',
    // 代码质量
    'code_lint', 'code_format', 'dependency_check', 'project_context', 'project_index', 'code_review',
    // 技能系统 + AI 专家库 + 动态工具
    'skill_record', 'skill_invoke', 'agent_expert', 'create_tool',
    // 办公文档（OfficeCLI 驱动）— Word/Excel/PowerPoint 读改
    'office_docs',
    // 视觉模型（Agent 的「眼睛」）
    'vision_analyze',
    // 模式记忆 + 知识库
    'memory_update', 'knowledge'
  ],
  coding: [
    'code_lint', 'code_format', 'dependency_check', 'project_context', 'project_index', 'code_review',
    'file_read', 'file_write', 'file_list', 'file_search', 'file_edit', 'file_delete',
    'multi_edit', 'move_file', 'todo_write',
    'terminal_exec', 'git_operations',
    'web_search', 'web_fetch',
    'agent_expert', 'create_tool',
    'vision_analyze',
    // 模式记忆 + 知识库
    'memory_update', 'knowledge',
    // 任务规划与规范
    'plan_ask', 'spec_review'
  ],
  design: [
    'ui_generate', 'design_preview', 'design_critique',
    'design_audit', 'design_a11y', 'design_color', 'design_template', 'design_style',
    'design_component',
    'theme_design',
    'file_read', 'file_write', 'file_list', 'todo_write',
    'web_search', 'web_fetch',
    'agent_expert', 'create_tool',
    'vision_analyze',
    // AI 代码审查
    'code_review',
    // 模式记忆 + 知识库
    'memory_update', 'knowledge'
  ]
}

// ---------------------------------------------------------------------------
// 已加载模块缓存 — 避免重复实例化
// ---------------------------------------------------------------------------

const loadedModules = new Set<string>()

/**
 * 确保指定模式的所有工具已加载并注册到 toolRegistry。
 * 已加载的模块组不会重复加载。
 */
export async function ensureModeToolsLoaded(mode: string): Promise<void> {
  const modules = modeModules[mode] || []
  const toLoad = modules.filter((m) => !loadedModules.has(m))

  if (toLoad.length === 0) return

  // 并行加载所有未加载的模块组
  const results = await Promise.all(
    toLoad.map(async (mod) => {
      const factory = moduleFactories[mod]
      if (!factory) {
        console.warn(`[lazy-registry] 未知模块组: ${mod}`)
        return null
      }
      try {
        const tools = await factory()
        return { mod, tools }
      } catch (e) {
        console.error(`[lazy-registry] 加载模块组 ${mod} 失败:`, e)
        return null
      }
    })
  )

  // 注册所有成功加载的工具
  for (const result of results) {
    if (!result) continue
    for (const tool of result.tools) {
      // 仅注册尚未注册的工具（避免覆盖警告）
      if (!toolRegistry.has(tool.definition.name)) {
        toolRegistry.register(tool)
      }
    }
    loadedModules.add(result.mod)
  }
}
