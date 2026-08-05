import type { Tool } from './Tool'

/**
 * 工具注册表 — 单例模式
 * 管理所有已注册的工具，按名称索引
 */
export class ToolRegistry {
  private tools = new Map<string, Tool>()

  /** 注册一个工具 */
  register(tool: Tool): void {
    const name = tool.definition.name
    if (this.tools.has(name)) {
      // 明确冲突策略：后注册者覆盖先注册者，但保留同名历史以便诊断。
      // 实际冲突来源：MCP 工具与懒加载工具同名（MCP 后注册，覆盖懒加载）；
      // 以及工具模块组重复加载。记录告警便于排查。
      console.warn(`[ToolRegistry] 工具 "${name}" 已存在，将被覆盖。`)
    }
    this.tools.set(name, tool)
  }

  /** 按名称查找工具 */
  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  /** 按名称列表获取工具 */
  getByNames(names: string[]): Tool[] {
    return names.map((n) => this.tools.get(n)).filter((t): t is Tool => t !== undefined)
  }

  /** 检查工具是否已注册 */
  has(name: string): boolean {
    return this.tools.has(name)
  }

}

/** 全局单例 */
export const toolRegistry = new ToolRegistry()
