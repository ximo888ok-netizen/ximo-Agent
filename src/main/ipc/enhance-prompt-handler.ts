import { ipcMain } from 'electron'
import { callDeepSeekStream } from '@main/deepseek'
import { resolveActiveProvider } from '@main/deepseek/provider'
import { loadSettings } from '@main/store'

/** 注册提示词增强 IPC handler — 轻量级 LLM 调用，无 Agent Loop / 无工具 */
export function registerEnhancePromptHandler(): void {
  ipcMain.handle('chat:enhance-prompt', async (_event, data: {
    text: string
    mode: string
    recentContext?: string
    projectPath?: string
  }): Promise<{ success: boolean; enhancedText?: string; error?: string }> => {
    const settings = await loadSettings()
    const provider = resolveActiveProvider(settings)
    if (!provider.apiKey) {
      return { success: false, error: '未配置 API Key' }
    }
    const enhanceModel = provider.isDeepSeek
      ? settings.model
      : ((settings.providers ?? []).find((p) => p.id === provider.id)?.models[0] ?? settings.model)

    const modeLabels: Record<string, string> = {
      office: '办公模式（文档撰写、邮件、会议纪要、搜索研究）',
      coding: '编程模式（代码生成、审查、调试、重构、测试）',
      design: '设计模式（UI 生成、设计审查、架构设计、组件库）',
    }
    const modeLabel = modeLabels[data.mode] || data.mode

    let systemPrompt = `你是一个提示词增强助手。用户当前处于「${modeLabel}」下工作。
请将用户的原始提示词增强为更清晰、更具体、更结构化的版本，使其能更准确地传达用户意图。

增强原则：
1. 补充必要的上下文和约束条件
2. 明确预期输出格式（如 Markdown 表格、代码块、列表等）
3. 如果用户的提示词太简短，根据当前模式补充合理的隐含需求
4. 保持用户原始意图不变，不要添加用户没提到的功能
5. 输出语言与用户输入语言一致

只输出增强后的提示词本身，不要加任何解释、前缀或引号。`

    if (data.recentContext) {
      systemPrompt += `\n\n## 当前会话上下文（用于理解用户意图）\n${data.recentContext}`
    }
    if (data.projectPath) {
      systemPrompt += `\n\n## 当前项目路径\n${data.projectPath}`
    }

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: data.text },
    ]

    try {
      const result = await callDeepSeekStream(
        provider.apiKey,
        provider.baseUrl,
        enhanceModel,
        messages,
        undefined,
        false,
        'high',
        0.7,
        8192,
        { onChunk: () => {}, signal: undefined },
        provider.capabilities
      )

      if (result.finishReason === 'error') {
        return { success: false, error: result.error || 'LLM 调用失败' }
      }

      let enhancedText = result.content.trim()
      if (!enhancedText && result.reasoningContent) {
        enhancedText = result.reasoningContent.trim()
      }
      if (!enhancedText) {
        return { success: false, error: 'LLM 返回空内容' }
      }

      if (result.finishReason === 'length') {
        enhancedText += '\n\n<!-- ⚠️ 增强结果因 token 上限被截断 -->'
      }

      return { success: true, enhancedText }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  })
}
