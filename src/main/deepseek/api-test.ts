import type { TestResult } from '@shared/types'

/** 连接测试 — chat/completions 端点验证 API Key 有效性 */
export async function testConnection(
  apiKey: string,
  baseUrl: string,
  model: string
): Promise<TestResult> {
  if (!apiKey) {
    return { success: false, message: '未填写 API Key' }
  }

  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`
  const start = Date.now()

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
        stream: false
      })
    })

    const latency = Date.now() - start

    if (!response.ok) {
      let errText = ''
      try {
        errText = await response.text()
        const errJson = JSON.parse(errText)
        errText = errJson?.error?.message || errText
      } catch { /* keep raw */ }
      return { success: false, message: `请求失败 (${response.status})：${errText || response.statusText}`, latency }
    }

    const data = await response.json()
    const replyModel = data?.model || model

    return { success: true, message: '连接成功，API Key 有效', latency, model: replyModel }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, message: `网络错误：${msg}。请检查 Base URL 或网络连接。`, latency: Date.now() - start }
  }
}
