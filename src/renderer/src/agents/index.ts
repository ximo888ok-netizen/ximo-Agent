/**
 * AI 专家库 — 基于 agency-agents (msitarzewski/agency-agents)
 * 254 位 AI 专家，17 个部门，开箱即用
 *
 * agents-raw.json (~156KB) 延迟加载：首次使用时才动态 import，
 * 避免启动时将全部专家数据打入主 bundle。
 */
import type { AgentDivision, AgentExpert } from '@shared/types'

/** 部门定义（来自 divisions.json）— 静态导出，体积很小 */
export const AGENT_DIVISIONS: AgentDivision[] = [
  { key: 'engineering', label: '工程部', icon: 'Code', color: '#3B82F6' },
  { key: 'design', label: '设计部', icon: 'PenTool', color: '#EC4899' },
  { key: 'marketing', label: '市场部', icon: 'Megaphone', color: '#F97316' },
  { key: 'specialized', label: '专业服务', icon: 'Sparkles', color: '#6366F1' },
  { key: 'product', label: '产品部', icon: 'Box', color: '#D946EF' },
  { key: 'project-management', label: '项目管理', icon: 'ClipboardList', color: '#0EA5E9' },
  { key: 'security', label: '安全部', icon: 'ShieldCheck', color: '#EF4444' },
  { key: 'testing', label: '测试部', icon: 'FlaskConical', color: '#F59E0B' },
  { key: 'finance', label: '财务部', icon: 'DollarSign', color: '#22C55E' },
  { key: 'sales', label: '销售部', icon: 'TrendingUp', color: '#10B981' },
  { key: 'academic', label: '学术研究', icon: 'GraduationCap', color: '#8B5CF6' },
  { key: 'support', label: '客户支持', icon: 'LifeBuoy', color: '#84CC16' },
  { key: 'paid-media', label: '付费媒体', icon: 'Target', color: '#EAB308' },
  { key: 'game-development', label: '游戏开发', icon: 'Gamepad2', color: '#A855F7' },
  { key: 'gis', label: 'GIS 地理信息', icon: 'Map', color: '#14B8A6' },
  { key: 'healthcare', label: '医疗健康', icon: 'Stethoscope', color: '#0D9488' },
  { key: 'spatial-computing', label: '空间计算', icon: 'Boxes', color: '#06B6D4' },
]

// ---------------------------------------------------------------------------
// 专家数据 — 延迟加载
// ---------------------------------------------------------------------------

/** 所有专家列表 — ensureAgentsLoaded() 完成前为空数组 */
export const ALL_AGENTS: AgentExpert[] = []

/** 按部门分组的专家 — ensureAgentsLoaded() 完成前为空对象 */
export const AGENTS_BY_DIVISION: Record<string, AgentExpert[]> = {}

let _loaded = false
let _loadPromise: Promise<void> | null = null

/** 确保专家数据已加载（首次调用时动态 import JSON，后续调用直接返回） */
export function ensureAgentsLoaded(): Promise<void> {
  if (_loaded) return Promise.resolve()
  if (!_loadPromise) {
    _loadPromise = (async () => {
      const raw = await import('@shared/agents-raw.json')
      const data = raw.default as { agents: AgentExpert[]; total: number }
      ALL_AGENTS.push(...data.agents)
      for (const agent of ALL_AGENTS) {
        if (!AGENTS_BY_DIVISION[agent.division]) {
          AGENTS_BY_DIVISION[agent.division] = []
        }
        AGENTS_BY_DIVISION[agent.division].push(agent)
      }
      _loaded = true
    })().catch((e) => {
      _loadPromise = null
      console.error('[agents] 加载专家数据失败:', e)
    })
  }
  return _loadPromise
}

/** 根据 ID 查找专家（需先调用 ensureAgentsLoaded） */
export function getAgentById(id: string): AgentExpert | undefined {
  return ALL_AGENTS.find(a => a.id === id)
}

/** 搜索专家（名称 + 描述 + 部门） */
export function searchAgents(query: string): AgentExpert[] {
  const q = query.toLowerCase()
  return ALL_AGENTS.filter(a =>
    a.name.toLowerCase().includes(q) ||
    a.description.toLowerCase().includes(q) ||
    a.division.toLowerCase().includes(q) ||
    a.vibe.toLowerCase().includes(q)
  )
}

/** 获取专家的完整系统提示词（激活该专家时注入） */
export function getExpertSystemPrompt(agent: AgentExpert): string {
  return `你现在扮演 **${agent.name}**（${agent.emoji}）。

${agent.personality}

## 你的核心能力
${agent.description}

## 你的工作风格
${agent.vibe}

## 输出要求
- 始终以 ${agent.name} 的专业视角分析和回答问题
- 使用该领域专业术语，但确保可理解
- 给出可操作的具体建议，而非泛泛而谈
- 如有可用的工具，主动使用以提升回答质量`
}
