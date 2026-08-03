import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk, ToolContext } from '@shared/types'

/**
 * VisionTool — Agent 的「眼睛」
 *
 * 封装 Agnes 2.5 Flash 多模态模型，让所有 Agent 具备图像理解能力。
 * 支持三种图像输入方式：
 * 1. image_url — 公开可访问的图片 URL
 * 2. file_path — 本地图片文件路径（自动读取并转 base64）
 * 3. take_screenshot — 对当前浏览器页面截图后分析
 *
 * 典型用法：
 * - Agent 截图后分析 UI 布局和问题
 * - Agent 分析用户提供的图片或截图
 * - Agent 读取设计稿并生成代码
 */
export class VisionTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'vision_analyze',
    description:
      '使用视觉模型（Agnes 2.5 Flash）分析图像内容。这是你的「眼睛」，让你能看到并理解图片。\n\n' +
      '## 强制要求 — 完整描述所有细节\n' +
      '你必须对图像中的所有内容进行完整、详尽的描述，不得遗漏任何细节：\n' +
      '- 描述每一个可见的 UI 元素、文本、图标、按钮、输入框、图片\n' +
      '- 描述布局结构、层级关系、对齐方式、间距比例\n' +
      '- 描述颜色方案、字体样式、视觉风格\n' +
      '- 描述任何异常、错误提示、加载状态、空状态\n' +
      '- 如果是网页截图，描述导航栏、侧边栏、内容区、页脚等所有区域\n' +
      '- 如果是设计稿，描述所有图层、组件、交互元素\n' +
      '- 提取所有可见文字内容（原文保留，不要概括）\n' +
      '默认启用 Thinking 模式以确保分析的完整性和准确性。\n\n' +
      '## 何时使用\n' +
      '- 需要分析截图、UI 设计稿、图片内容时\n' +
      '- 需要理解浏览器当前页面的视觉布局时\n' +
      '- 需要从图片中提取文字、描述场景、识别物体时\n' +
      '- 需要对比设计稿和实际渲染效果时\n\n' +
      '## 输入方式（三选一）\n' +
      '1. take_screenshot=true — 截取当前浏览器页面并分析\n' +
      '2. image_url — 传入公开可访问的图片 URL\n' +
      '3. file_path — 传入本地图片文件路径',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: '对图像的分析指令或问题。例如："描述这个页面的布局结构"、"这张截图中的 UI 有什么问题"、"提取图片中的所有文字"'
        },
        image_url: {
          type: 'string',
          description: '公开可访问的图片 URL（可选，与 file_path / take_screenshot 三选一）'
        },
        file_path: {
          type: 'string',
          description: '本地图片文件路径，支持 png/jpg/jpeg/gif/webp/bmp（可选，与 image_url / take_screenshot 三选一）'
        },
        take_screenshot: {
          type: 'boolean',
          description: '是否截取当前浏览器页面进行分析（可选，与 image_url / file_path 三选一）',
          default: false
        },
        enable_thinking: {
          type: 'boolean',
          description: '是否启用思考模式。默认开启——思考模式可确保对图像细节的完整分析。仅在极简场景（如简单文字提取）时关闭',
          default: true
        }
      },
      required: ['prompt']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
    context?: ToolContext
  ): Promise<ToolResult> {
    const prompt = (toolCall.arguments.prompt as string) || ''
    const imageUrl = (toolCall.arguments.image_url as string) || ''
    const filePath = (toolCall.arguments.file_path as string) || ''
    const takeScreenshot = (toolCall.arguments.take_screenshot as boolean) || false
    // 默认启用 Thinking 模式，仅在明确传 false 时关闭
    const enableThinking = toolCall.arguments.enable_thinking !== false

    if (!prompt) {
      return this.error(toolCall.id, '缺少 prompt 参数：请提供对图像的分析指令')
    }

    // 确定图像来源
    let resolvedImageUrl: string | null = null

    if (takeScreenshot) {
      onChunk?.({ toolStatus: 'calling', toolName: 'vision_analyze' })
      resolvedImageUrl = await this.takeBrowserScreenshot()
      if (!resolvedImageUrl) {
        return this.error(toolCall.id, '截图失败：浏览器未开启或截图时出错。请先使用 browser_navigate 打开页面，或改用 image_url / file_path 参数')
      }
    } else if (imageUrl) {
      resolvedImageUrl = imageUrl
    } else if (filePath) {
      onChunk?.({ toolStatus: 'calling', toolName: 'vision_analyze' })
      resolvedImageUrl = await this.readLocalImage(filePath)
      if (!resolvedImageUrl) {
        return this.error(toolCall.id, `读取本地图片失败：${filePath}（文件不存在或不支持的格式）`)
      }
    } else {
      return this.error(toolCall.id, '需要指定图像来源：请提供 image_url、file_path 或设置 take_screenshot=true')
    }

    // 获取视觉模型配置
    const apiKey = context?.visionApiKey
    const baseUrl = context?.visionBaseUrl ?? 'https://api.agnes-ai.cn/v1' // 免费视觉模型，无需理会
    const model = context?.visionModel ?? 'agnes-2.5-flash'

    if (!apiKey) {
      return this.error(toolCall.id, '视觉模型 API Key 未配置，请在设置中填写 visionApiKey')
    }

    // 调用 Agnes 2.5 Flash API
    try {
      let result = ''

      if (enableThinking) {
        // Thinking 模式：模型思考时间长，返回空是正常的（正在思考）。
        // 5 分钟内持续等待，不降级；只有 HTTP 错误码才中止。
        result = await this.callVisionWithWait(
          apiKey, baseUrl, model, prompt, resolvedImageUrl, signal
        )
      } else {
        result = await this.callVisionApi(
          apiKey, baseUrl, model, prompt, resolvedImageUrl, false, signal
        )
      }

      if (!result) {
        return this.error(toolCall.id, '视觉模型在 5 分钟内未返回有效响应，请稍后重试或检查模型配置')
      }

      return {
        toolCallId: toolCall.id,
        toolName: 'vision_analyze',
        content: result,
        success: true,
        displayType: 'text',
        metadata: { model, enableThinking, source: takeScreenshot ? 'screenshot' : imageUrl ? 'url' : 'file' }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return this.error(toolCall.id, `视觉模型调用失败：${msg}`)
    }
  }

  /** 调用 Agnes 2.5 Flash Chat Completions API */
  private async callVisionApi(
    apiKey: string,
    baseUrl: string,
    model: string,
    prompt: string,
    imageUrl: string,
    enableThinking: boolean,
    signal?: AbortSignal
  ): Promise<string> {
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`

    // 系统指令 — 强制完整描述所有视觉细节
    const systemPrompt =
      '你是一个专业的视觉分析助手。你的任务是对图像内容进行完整、详尽、不遗漏任何细节的描述。\n\n' +
      '## 强制规则\n' +
      '1. **完整覆盖**：必须描述图像中所有可见的内容，包括但不限于：\n' +
      '   - 所有 UI 元素（按钮、输入框、下拉框、复选框、标签、徽章、进度条等）\n' +
      '   - 所有文本内容（原文逐字提取，不得概括或省略）\n' +
      '   - 所有图标和图片（描述其外观和含义）\n' +
      '   - 布局结构（区域划分、网格、行列、层级关系）\n' +
      '   - 视觉样式（颜色、字体、间距、圆角、阴影、边框）\n' +
      '   - 状态信息（加载态、空态、错误提示、禁用态、选中态）\n' +
      '   - 交互元素（可点击区域、hover 效果、焦点状态）\n' +
      '2. **结构化输出**：按区域/模块组织描述，使用清晰的标题和列表\n' +
      '3. **原文保留**：所有文字内容必须原文保留，不得翻译、概括或省略\n' +
      '4. **细节优先**：宁可过度描述也不可遗漏。每个细节都可能对后续分析至关重要\n' +
      '5. **异常标注**：发现的任何 UI 问题、布局错位、文字溢出、对比度不足等异常必须明确标注'

    const body: Record<string, unknown> = {
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ],
      max_tokens: 8192,
      stream: false
    }

    // Thinking 模式 — 使用顶层 enable_thinking 参数（与主 API 一致）
    // 注意：开启 thinking 时不设置 temperature（部分 API 不允许同时使用）
    if (enableThinking) {
      body.enable_thinking = true
    } else {
      body.temperature = 0.3
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      let msg = errText
      try {
        const errJson = JSON.parse(errText)
        msg = errJson?.error?.message || errText
      } catch { /* keep raw */ }
      throw new Error(`API 请求失败 (${response.status})：${msg}`)
    }

    const data = await response.json()
    const message = data?.choices?.[0]?.message

    // 解析响应内容 — 处理多种可能的返回格式
    // 1. content 为字符串（标准格式）
    // 2. content 为数组（多模态格式，需提取 text 部分）
    // 3. content 为空但 reasoning_content 有值（thinking 模式下部分 API 的行为）
    let content = ''

    if (message?.content) {
      if (typeof message.content === 'string') {
        content = message.content
      } else if (Array.isArray(message.content)) {
        content = message.content
          .filter((block: { type?: string; text?: string }) => block.type === 'text' && block.text)
          .map((block: { text?: string }) => block.text)
          .join('\n')
      }
    }

    // 如果 content 为空，尝试 reasoning_content（thinking 模式下的回退）
    if (!content && message?.reasoning_content) {
      content = message.reasoning_content
    }

    if (!content) {
      // 返回空字符串 — thinking 模式下模型可能正在思考，由 callVisionWithWait 持续等待
      console.warn('[VisionTool] API 返回了空响应（模型可能正在思考）', {
        messageKeys: message ? Object.keys(message) : 'message is null',
        model,
        enableThinking
      })
      return ''
    }

    return content
  }

  /**
   * Thinking 模式持续等待 — 模型思考时间长，返回空 content 是正常的（正在思考）。
   * 5 分钟超时内持续重试，只有 HTTP 错误码才中止，其他情况继续等待。
   */
  private async callVisionWithWait(
    apiKey: string,
    baseUrl: string,
    model: string,
    prompt: string,
    imageUrl: string,
    signal?: AbortSignal
  ): Promise<string> {
    const MAX_WAIT_MS = 5 * 60 * 1000    // 5 分钟总超时
    const RETRY_INTERVAL_MS = 3000      // 每次重试间隔
    const SINGLE_REQ_TIMEOUT_MS = 90000 // 单次 fetch 超时 90 秒
    const startTime = Date.now()

    while (Date.now() - startTime < MAX_WAIT_MS) {
      if (signal?.aborted) {
        throw new Error('用户取消了请求')
      }

      // 单次 fetch 超时控制，避免单次请求挂死
      const reqController = new AbortController()
      const timeoutId = setTimeout(() => reqController.abort(), SINGLE_REQ_TIMEOUT_MS)
      const onAbort = (): void => reqController.abort()
      signal?.addEventListener('abort', onAbort, { once: true })

      try {
        const result = await this.callVisionApi(
          apiKey, baseUrl, model, prompt, imageUrl, true, reqController.signal
        )
        if (result) return result
        // 返回空 — 模型正在思考，继续等待
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        // 只有 API 错误码才中止（callVisionApi 对非 2xx 抛 "API 请求失败 (xxx)"）
        if (msg.includes('API 请求失败')) {
          throw e
        }
        // 其他错误（网络抖动、单次超时等）— 继续等待
      } finally {
        clearTimeout(timeoutId)
        signal?.removeEventListener('abort', onAbort)
      }

      // 等待后重试
      const remaining = MAX_WAIT_MS - (Date.now() - startTime)
      if (remaining <= 0) break
      await new Promise((resolve) => setTimeout(resolve, Math.min(RETRY_INTERVAL_MS, remaining)))
    }

    return '' // 5 分钟超时，未获得有效响应
  }

  /** 截取当前浏览器页面，返回 data URL */
  private async takeBrowserScreenshot(): Promise<string | null> {
    try {
      // 优先使用内嵌浏览器
      const { isEmbeddedBrowserActive, executeWebviewCommand } = await import('@main/tools/Browser/WebviewBridge')
      if (isEmbeddedBrowserActive()) {
        const dataUrl = await executeWebviewCommand('screenshot', {}) as string
        return dataUrl || null
      }

      // 回退到 Playwright
      const { BrowserManager } = await import('@main/tools/Browser/BrowserManager')
      const page = await BrowserManager.getInstance().getPage()
      const buffer = await page.screenshot({ type: 'png', fullPage: false })
      return `data:image/png;base64,${buffer.toString('base64')}`
    } catch {
      return null
    }
  }

  /** 读取本地图片文件，返回 base64 data URL */
  private async readLocalImage(filePath: string): Promise<string | null> {
    try {
      const { readFile } = await import('fs/promises')
      const { extname } = await import('path')

      const ext = extname(filePath).toLowerCase()
      const mimeMap: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp'
      }

      const mime = mimeMap[ext]
      if (!mime) return null

      const buffer = await readFile(filePath)
      return `data:${mime};base64,${buffer.toString('base64')}`
    } catch {
      return null
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'vision_analyze', content: '', success: false, error: msg }
  }
}
