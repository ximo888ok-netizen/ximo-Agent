import type { ToolDefinition } from '@shared/types'

/** agent_expert 工具定义 */
export const DEFINITION: ToolDefinition = {
  name: 'agent_expert',
  description:
    '调度 AI 专家子 Agent 协同工作。可列出/搜索 254+ 位专家，也可激活指定专家并附带任务描述让其独立处理子任务。支持创建/更新/删除自定义专家。\n\n' +
    '## 激活流程\n' +
    '当 action=activate 时，工具会自动完成以下分析：\n' +
    '1. 提取专家系统提示词（含人格、能力、工作风格）\n' +
    '2. 分析提示词，根据专家部门 + 关键词推断所需工具\n' +
    '3. 生成预设自动化工作流\n' +
    '4. 将工具配置和工作流注入专家系统提示词\n' +
    '5. 如附带 task，子 Agent 将以专家视角 + 配置好的工具独立处理任务\n\n' +
    '主 Agent 负责理解用户目的、分解任务、调度专家、综合结果——绝不推诿，遇到困难主动寻找替代方案。\n\n' +
    '**自主召唤授权**：主 Agent 可凭自主意识判断是否召唤专家。当任务涉及专业领域知识、复杂度高需多角色协作、或需要专业意见时，应主动使用本工具（先 search 定位专家，再 activate+task 派活）；简单任务则自行完成，不必召唤。',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: '操作类型：activate=激活专家（自动分析提示词、配置工具、预设工作流），deactivate=停用专家，list=列出专家，search=搜索专家，create=创建自定义专家，update=更新专家，delete=删除自定义专家',
        enum: ['activate', 'deactivate', 'list', 'search', 'create', 'update', 'delete']
      },
      expert_id: {
        type: 'string',
        description: '专家 ID（如 engineering-frontend-developer），activate/deactivate 时必填'
      },
      task: {
        type: 'string',
        description: '交给该专家处理的子任务描述。activate 时填写则专家子 Agent 会以专家视角 + 配置好的工具独立处理后返回结果；不填则仅返回专家信息（含提示词分析、推荐工具、预设工作流）供主 Agent 参考。'
      },
      division: {
        type: 'string',
        description: '部门 key（如 engineering, design, marketing），list 时可选，用于筛选部门'
      },
      query: {
        type: 'string',
        description: '搜索关键词，search 时必填'
      },
      // ── create / update ──
      expert_name: {
        type: 'string',
        description: '专家名称（create 时必填），如"前端架构师"'
      },
      emoji: {
        type: 'string',
        description: '专家 emoji 图标（create 时可选，默认✨），如🎨、💻、📊'
      },
      description: {
        type: 'string',
        description: '专家简介（create 时必填）'
      },
      personality: {
        type: 'string',
        description: '人格设定（create 时必填），描述专家的性格特征和工作风格'
      },
      vibe: {
        type: 'string',
        description: '工作风格（create 时必填），如"严谨细致，注重代码质量"'
      },
      color: {
        type: 'string',
        description: '主题色 hex（create 时可选，默认 #6366f1），如 #ff6b6b'
      },
      expert_tools: {
        type: 'array',
        description: '专家推荐工具列表（create 时可选），如 ["file_read", "code_execute"]',
        items: { type: 'string' }
      }
    },
    required: ['action']
  }
}
