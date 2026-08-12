/** 视觉模型 API 调用 — Agnes 2.5 Flash Chat Completions */

const VISION_SYSTEM_PROMPT =
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

/** 调用 Agnes 2.5 Flash Chat Completions API */
export async function callVisionApi(
  apiKey: string,
  baseUrl: string,
  model: string,
  prompt: string,
  imageUrl: string,
  enableThinking: boolean,
  signal?: AbortSignal
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: VISION_SYSTEM_PROMPT },
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

  if (!content && message?.reasoning_content) {
    content = message.reasoning_content
  }

  if (!content) {
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
export async function callVisionWithWait(
  apiKey: string,
  baseUrl: string,
  model: string,
  prompt: string,
  imageUrl: string,
  signal?: AbortSignal
): Promise<string> {
  const MAX_WAIT_MS = 5 * 60 * 1000
  const RETRY_INTERVAL_MS = 3000
  const SINGLE_REQ_TIMEOUT_MS = 90000
  const startTime = Date.now()

  while (Date.now() - startTime < MAX_WAIT_MS) {
    if (signal?.aborted) {
      throw new Error('用户取消了请求')
    }

    const reqController = new AbortController()
    const timeoutId = setTimeout(() => reqController.abort(), SINGLE_REQ_TIMEOUT_MS)
    const onAbort = (): void => reqController.abort()
    signal?.addEventListener('abort', onAbort, { once: true })

    try {
      const result = await callVisionApi(
        apiKey, baseUrl, model, prompt, imageUrl, true, reqController.signal
      )
      if (result) return result
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('API 请求失败')) {
        throw e
      }
    } finally {
      clearTimeout(timeoutId)
      signal?.removeEventListener('abort', onAbort)
    }

    const remaining = MAX_WAIT_MS - (Date.now() - startTime)
    if (remaining <= 0) break
    await new Promise((resolve) => setTimeout(resolve, Math.min(RETRY_INTERVAL_MS, remaining)))
  }

  return ''
}
