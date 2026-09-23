import { useCallback, useEffect, useState } from 'react'
import { useStore } from '@renderer/store/useStore'
import type { Mode } from '@shared/types'

export interface SidebarNavCounts {
  /** 当前模式记忆的行数（0 = 空） */
  memoryLines: number | null
  /** 当前模式知识库条目总数 */
  knowledgeTotal: number | null
  /** MCP 服务器：已启用 / 总数 */
  mcpEnabled: number | null
  mcpTotal: number | null
  /** SKILL.md 导入的技能数（技能面板列出的那批） */
  skillImported: number | null
  /** 浏览器录制生成的技能数（存在于另一套存储） */
  skillRecorded: number | null
}

const EMPTY: SidebarNavCounts = {
  memoryLines: null,
  knowledgeTotal: null,
  mcpEnabled: null,
  mcpTotal: null,
  skillImported: null,
  skillRecorded: null,
}

/**
 * 左侧栏导航的真实计数
 *
 * 每一项都走主进程真实数据（记忆全文 / 知识库分页 total / MCP 配置 / 技能列表），
 * 不做任何估算。刷新时机：模式切换、以及任一相关面板关闭后（覆盖新增/删除后的回读）。
 */
export function useSidebarNavCounts(): SidebarNavCounts {
  const currentMode = useStore((s) => s.currentMode)
  const memoryEnabled = useStore((s) => s.settings?.memoryEnabled ?? true)
  // 任一面板还开着就先不刷新，避免在用户操作过程中跳动
  const anyPanelOpen = useStore(
    (s) => s.showMemoryPanel || s.showKnowledgePanel || s.showAgentPanel || s.showMcpPanel || s.showSkillPanel
  )
  const [counts, setCounts] = useState<SidebarNavCounts>(EMPTY)

  const load = useCallback(async (mode: Mode): Promise<void> => {
    const next: SidebarNavCounts = { ...EMPTY }

    const tasks: Promise<void>[] = [
      window.api.memory
        .load(mode)
        .then((text: string) => { next.memoryLines = text.trim() ? text.trim().split('\n').length : 0 })
        .catch(() => { next.memoryLines = null }),

      window.api.knowledge
        .list(mode, 1, 1)
        .then((res: { total?: number }) => { next.knowledgeTotal = res?.total ?? 0 })
        .catch(() => { next.knowledgeTotal = null }),

      window.api.mcp
        .load()
        .then((servers: Array<{ enabled?: boolean }>) => {
          next.mcpTotal = servers.length
          next.mcpEnabled = servers.filter((s) => s.enabled !== false).length
        })
        .catch(() => { next.mcpTotal = null; next.mcpEnabled = null }),

      // 技能有两套存储：importedSkills = SKILL.md 导入（技能面板列出的）；skills = 浏览器录制生成
      window.api.importedSkills
        .load()
        .then((list: unknown[]) => { next.skillImported = list.length })
        .catch(() => { next.skillImported = null }),

      window.api.skills
        .load()
        .then((list: unknown[]) => { next.skillRecorded = list.length })
        .catch(() => { next.skillRecorded = null }),
    ]

    await Promise.all(tasks)
    setCounts(next)
  }, [])

  useEffect(() => {
    if (anyPanelOpen) return
    void load(currentMode)
  }, [currentMode, anyPanelOpen, memoryEnabled, load])

  return counts
}
