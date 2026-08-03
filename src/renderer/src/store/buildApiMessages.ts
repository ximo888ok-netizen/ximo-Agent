import { getAgentById, getExpertSystemPrompt } from '@renderer/agents'
import type {
  ApiMessage,
  Conversation,
  ImportedSkill,
  Mode,
  ReasoningEffort
} from '@shared/types'
import { GLM_PARADIGM_PROMPT } from '@shared/glm-paradigm'
import { trimContext, truncateToolResult, type AgentConfig } from '@shared/context-compress'

// ── 导入技能缓存 — 避免每次发消息都通过 IPC 从磁盘读取 ──
let _importedSkillsCache: ImportedSkill[] | null = null

/** 获取导入技能列表（带缓存） */
async function getImportedSkills(): Promise<ImportedSkill[]> {
  if (_importedSkillsCache !== null) return _importedSkillsCache
  _importedSkillsCache = await window.api.importedSkills.load()
  return _importedSkillsCache
}

/** 使导入技能缓存失效 — 在技能列表变更后调用 */
export function invalidateImportedSkillsCache(): void {
  _importedSkillsCache = null
}

/** 默认上下文配置 — 与 deepseek.ts 中 agentConfig 默认值保持一致 */
const DEFAULT_CONFIG: AgentConfig = {
  maxToolResultChars: 8000,
  maxContextChars: 300000,
  recentKeep: 5,
  snippedKeep: 200,
  prunedKeep: 80
}

/**
 * 构造发送给 API 的消息列表（含系统提示，不含历史中的 reasoning_content）
 * 关键：保留 tool_calls / tool 结果，让 LLM 在多轮对话中记住之前的操作
 *
 * 缓存优化策略（按稳定性分层前缀）：
 * DeepSeek prompt 缓存基于前缀匹配——Turn N+1 的消息列表必须是 Turn N 的严格扩展，
 * 否则前缀断裂处之后的所有 token 都变为未命中。
 *
 * 消息列表按「稳定性递减」排列，确保高稳定内容始终命中缓存：
 *   [0] system — 稳定系统提示词（模式提示词+自定义指令+专家人格+项目路径+技能，~25KB+）
 *   [1] system — 运行环境信息（日期级，同一天内不变）
 *   [2] system — 运行时工具状态（浏览器/操控电脑开关，偶尔变化）
 *   [3] system — 模式记忆（Agent 调用 memory_update 时变化，偶尔发生）
 *   [4+] 对话历史（每轮追加，天然扩展）
 *
 * 关键：记忆从 systemContent 中拆出为独立消息，避免 memory_update 后
 *       整个 25KB+ 系统提示词（含专家提示词）缓存全部失效。
 */
export async function buildApiMessages(
  conversation: Conversation,
  customPrompt?: string,
  activeExpertIds?: string[],
  orchestratorEnforce?: boolean,
  browserOpen?: boolean,
  computerUseRunning?: boolean,
  activeStyleId?: string | null,
  mainAgentCustomPrompt?: string,
  mainAgentExpertId?: string,
  contextConfig?: Partial<AgentConfig>,
  reasoningEffort?: ReasoningEffort,
  memoryEnabled?: boolean
): Promise<ApiMessage[]> {
  // 合并上下文配置
  const config: AgentConfig = { ...DEFAULT_CONFIG, ...contextConfig }

  // 延迟加载系统提示词（~25KB），避免打入首屏 bundle
  const { SYSTEM_PROMPTS } = await import('@renderer/modes/prompts')
  const systemPrompt = SYSTEM_PROMPTS[conversation.mode as Mode]
  let systemContent = customPrompt
    ? `${systemPrompt}\n\n--- 附加指令 ---\n${customPrompt}`
    : systemPrompt

  // 模式记忆 — 拆出为独立 system 消息，放在稳定前缀之后、对话历史之前
  // 原因：memory_update 工具会修改记忆内容，如果记忆在 systemContent 中，
  //   会导致整个 25KB+ 系统提示词（含专家人格）缓存全部失效。
  //   拆出后，记忆变化只影响记忆消息及之后的对话历史，系统提示词保持缓存。
  // memoryEnabled 为 false 时跳过记忆加载 — Agent 完全感知不到记忆功能
  let memoryContent = ''
  if (memoryEnabled !== false) {
    try {
      memoryContent = (await window.api.memory.load(conversation.mode as Mode)).trim()
    } catch { /* 记忆加载失败不应阻塞对话 */ }
  }

  // 主 Agent 专家人格注入 — 从设置中选择的专家，将人格注入主 Agent
  if (mainAgentExpertId) {
    const expert = getAgentById(mainAgentExpertId)
    if (expert) {
      systemContent += `\n\n--- 主 Agent 专家人格 ---\n${getExpertSystemPrompt(expert)}`
    }
  }

  // 主 Agent 自定义提示词注入
  if (mainAgentCustomPrompt) {
    systemContent += `\n\n--- 主 Agent 自定义指令 ---\n${mainAgentCustomPrompt}`
  }

  // 工程范式注入 — ultra 思考强度时注入完整五锁协议
  if (reasoningEffort === 'ultra') {
    systemContent += `\n\n--- 工程化编程范式（Ultra 模式约束协议）---\n${GLM_PARADIGM_PROMPT}`
  }

  // 将项目路径注入系统提示（而非用户消息），让 Agent 始终知道项目上下文
  if (conversation.projectPath) {
    systemContent += `\n\n--- 项目上下文 ---\n📂 当前项目路径：${conversation.projectPath}\n当用户提到"项目"、"当前文件"等时，请基于此路径使用 file_list / file_read / project_context 等工具操作项目文件。`
  }

  // 收集运行时工具状态 — 作为独立 system 消息放在 system prompt 之后、对话历史之前
  // 成为稳定前缀的一部分：状态变化时缓存断裂一次，但后续轮次立即恢复
  const runtimeStatusLines: string[] = []
  if (computerUseRunning) {
    runtimeStatusLines.push('🖥️ 操控电脑：已启动 — computer_use 等桌面操控工具可用。')
  } else {
    runtimeStatusLines.push('🖥️ 操控电脑：未启动 — computer_use 等工具不可用，如需桌面操控请提示用户在输入框下方点击"操控电脑"按钮。')
  }

  // AI 专家系统提示词注入
  if (activeExpertIds && activeExpertIds.length > 0) {
    const experts = activeExpertIds.map(id => getAgentById(id)).filter(Boolean)
    if (experts.length === 1) {
      // 单专家：直接注入到 system 提示词
      systemContent += `\n\n--- 专家角色 ---\n${getExpertSystemPrompt(experts[0]!)}`
    } else if (experts.length > 1) {
      // 多专家：生成编排主 Agent 系统提示词
      const expertList = experts.map((e, i) => `${i + 1}. ${e!.emoji} **${e!.name}** — ${e!.description}`).join('\n')
      const enforceClause = orchestratorEnforce !== false
        ? '\n- 你绝不是放弃型人格：遇到困难主动寻找替代方案，绝不推诿或说"做不到"'
        : '\n- 遇到困难时可建议用户调整方案'
      systemContent += `\n\n--- 专家编排模式 ---\n你是任务编排主 Agent，当前已激活 ${experts.length} 位专家子 Agent 协同工作。\n\n## 当前已激活的专家\n${expertList}\n\n## 工作流程\n1. 理解用户任务目的\n2. 将任务分解为子任务\n3. 通过 agent_expert(action="activate", expert_id="专家ID", task="子任务描述") 调度对应专家子 Agent 独立处理\n4. 收集各专家回复，综合处理后回复用户\n\n## 重要原则\n- 你是主导者，不是传话筒——主动分析、主动决策、主动执行${enforceClause}\n- 专家是你的协作者，不是你的上级——你来决定调度策略\n- 先尝试用你自身能力解决，需要专业视角时再调度专家\n- 综合结果时保持整体性和一致性`
    }
  }

  // 设计风格绑定注入 — 用户在输入框选择了风格，Agent 必须严格遵守
  if (activeStyleId && conversation.mode === 'design') {
    systemContent += `\n\n--- 绑定设计风格 ---\n🎨 用户已绑定设计风格：**${activeStyleId}**\n\n**你必须严格遵守该风格的 UI 样式来设计所有前端 UI。**\n\n工作流：\n1. 立即调用 design_style(action="get", style_id="${activeStyleId}") 获取该风格的完整上下文（DESIGN.md 设计指南 + tokens.css CSS 变量）\n2. 将 tokens.css 中的 \`:root { ... }\` 块粘贴到生成的 HTML 的第一个 <style> 标签中\n3. 所有颜色、间距、圆角等样式必须使用 var(--name) 引用 CSS 变量，禁止硬编码颜色值\n4. 遵循 DESIGN.md 中的设计指南（颜色用法、排版层级、组件规范）\n5. 生成的 UI 必须在视觉风格上与该风格系统保持一致\n\n此风格绑定在整个会话期间持续生效，后续所有 UI 生成任务都必须使用此风格。`
  }

  // 导入技能注入 — 将用户启用的 ImportedSkill 的指令体注入系统提示词
  try {
    const enabledSkills = (await getImportedSkills()).filter((s: ImportedSkill) => s.enabled)
    if (enabledSkills.length > 0) {
      const skillBlocks = enabledSkills.map((skill: ImportedSkill) => {
        const triggerLine = skill.triggers.length > 0
          ? `\n**触发词：** ${skill.triggers.map((t: string) => `\`${t}\``).join(', ')}`
          : ''
        return `### ${skill.name}\n${skill.description}${triggerLine}\n\n${skill.body}`
      }).join('\n\n---\n\n')
      systemContent += `\n\n--- 已激活技能（SKILL.md）---\n以下是用户导入并启用的技能指令。当用户的请求匹配技能的触发词或描述时，请严格按照技能正文中的指令执行。\n\n${skillBlocks}`
    }
  } catch { /* ignore — 技能加载失败不应阻塞对话 */ }

  const messages: ApiMessage[] = [
    { role: 'system', content: systemContent }
  ]

  // 运行时工具状态紧随 system prompt，作为稳定前缀的一部分
  // 放在前缀位置而非末尾：避免新对话消息插入时后缀位置偏移导致缓存前缀断裂
  if (runtimeStatusLines.length > 0) {
    messages.push({
      role: 'system',
      content: `--- 后台工具状态 ---\n${runtimeStatusLines.join('\n')}`
    })
  }

  // 模式记忆作为独立 system 消息 — 放在稳定前缀之后、对话历史之前
  // 稳定性低于系统提示词（memory_update 会修改），但高于对话历史（不会每轮都变）
  if (memoryContent) {
    messages.push({
      role: 'system',
      content: `--- 记忆 ---\n${memoryContent}`
    })
  }

  for (const msg of conversation.messages) {
    if (msg.role === 'system') continue

    if (msg.role === 'assistant') {
      // 如果 assistant 消息携带了工具调用，需要完整保留 tool_calls 和 tool 结果
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: msg.content || '',
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) }
          }))
        })
        // 追加每条 tool 结果作为 tool 角色消息
        // 使用 truncateToolResult 截断 — 与 Agent Loop 中的截断逻辑一致，确保缓存前缀一致
        if (msg.toolResults) {
          for (const result of msg.toolResults) {
            const rawContent = result.success ? (result.content || '') : `Error: ${result.error || '未知错误'}`
            messages.push({
              role: 'tool',
              content: truncateToolResult(rawContent, config),
              tool_call_id: result.toolCallId
            })
          }
        }
      } else {
        messages.push({ role: 'assistant', content: msg.content })
      }
    } else {
      // user 消息 — 如果携带 slashCommand，将 systemHint 拼接到 content 前面发送给 API
      const userContent = msg.slashCommand ? msg.slashCommand.systemHint + msg.content : msg.content
      messages.push({ role: msg.role, content: userContent })
    }
  }

  // 在返回前压缩上下文 — Agent Loop 不再重复调用 trimContext
  // 确保 buildApiMessages 产出的消息就是最终发送给 API 的消息（chat-handler 仅插入 env_info 前缀）
  trimContext(messages, config)

  return messages
}
