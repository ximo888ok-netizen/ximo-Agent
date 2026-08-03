import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

/**
 * StorageInspectTool — 浏览器存储检查
 * 读取页面的 localStorage/sessionStorage/cookies
 */
export class StorageInspectTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'storage_inspect',
    description: '读取浏览器页面的 localStorage、sessionStorage 和 cookies 数据。用于分析网站存储策略、提取认证信息等。需要先通过 browser_navigate 打开目标页面。',
    parameters: {
      type: 'object',
      properties: {
        storageType: { type: 'string', description: '存储类型：localStorage、sessionStorage、cookies 或 all（全部）', enum: ['localStorage', 'sessionStorage', 'cookies', 'all'], default: 'all' },
        keyFilter: { type: 'string', description: '键名过滤（模糊匹配），默认显示全部', default: '' }
      },
      required: []
    }
  }

  async execute(toolCall: ToolCall, onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal): Promise<ToolResult> {
    const storageType = (toolCall.arguments.storageType as string) || 'all'
    const keyFilter = ((toolCall.arguments.keyFilter as string) || '').toLowerCase()
    onChunk?.({ toolStatus: 'calling', toolName: 'storage_inspect' })

    // 通过 evaluate 读取页面存储
    let evalCode = ''
    if (storageType === 'localStorage' || storageType === 'all') {
      evalCode += `const ls = {}; try { for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); ls[k]=localStorage.getItem(k).slice(0,500) } } catch(e){} `
    }
    if (storageType === 'sessionStorage' || storageType === 'all') {
      evalCode += `const ss = {}; try { for(let i=0;i<sessionStorage.length;i++){ const k=sessionStorage.key(i); ss[k]=sessionStorage.getItem(k).slice(0,500) } } catch(e){} `
    }
    if (storageType === 'cookies' || storageType === 'all') {
      evalCode += `const ck = document.cookie; `
    }
    evalCode += `JSON.stringify({ localStorage: ${storageType === 'localStorage' || storageType === 'all' ? 'ls' : '{}'}, sessionStorage: ${storageType === 'sessionStorage' || storageType === 'all' ? 'ss' : '{}'}, cookies: ${storageType === 'cookies' || storageType === 'all' ? 'ck' : '""'} })`

    try {
      const { BrowserManager } = await import('@main/tools/Browser/BrowserManager')
      const page = await BrowserManager.getInstance().getPage()
      const result = await page.evaluate(evalCode)
      const data = JSON.parse(result as string)

      const lines = ['## 💾 页面存储数据', '']

      if (data.localStorage && Object.keys(data.localStorage).length > 0) {
        lines.push('### localStorage')
        Object.entries(data.localStorage as Record<string, string>)
          .filter(([k]) => !keyFilter || k.toLowerCase().includes(keyFilter))
          .forEach(([k, v]) => lines.push(`- \`${k}\`: ${(v as string).slice(0, 200)}`))
        lines.push('')
      }

      if (data.sessionStorage && Object.keys(data.sessionStorage).length > 0) {
        lines.push('### sessionStorage')
        Object.entries(data.sessionStorage as Record<string, string>)
          .filter(([k]) => !keyFilter || k.toLowerCase().includes(keyFilter))
          .forEach(([k, v]) => lines.push(`- \`${k}\`: ${(v as string).slice(0, 200)}`))
        lines.push('')
      }

      if (data.cookies) {
        lines.push(`### Cookies\n\`\`\`\n${String(data.cookies).slice(0, 5000)}\n\`\`\``)
      }

      if (lines.length <= 3) lines.push('未找到匹配的存储数据。')

      return { toolCallId: toolCall.id, toolName: 'storage_inspect', content: lines.join('\n'), success: true, displayType: 'text', metadata: { storageType } }
    } catch (e) {
      return { toolCallId: toolCall.id, toolName: 'storage_inspect', content: '', success: false, error: `读取存储失败：${(e as Error).message}。请确认已打开目标页面。` }
    }
  }
}
