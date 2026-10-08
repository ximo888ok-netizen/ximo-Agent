/**
 * browser 工具 — Agent 的浏览器语义化 API（阶段 D1，CDP 直连）
 *
 * 与 GUI 浏览器（desktop 工具）的关系：语义化 API 优先——结构化结果、可断言、
 * 零截图；GUI 路径只是兜底。截图留存 shotsDir，理解画面内容时把路径交给
 * vision_analyze(file_path=…)（与 desktop.screen.snapshot 同一通路）。
 *
 * 权限（Permission.ts CODING/OFFICE）：navigate/extract/screenshot/click/type
 * = allow（只读或页面内操作）；eval = ask（任意 JS，等同 code_execute 语义）。
 */
import { join } from 'path'
import { writeFile, mkdir } from 'fs/promises'
import type { Tool } from '../../main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult } from '../../shared/types'
import { CdpClient } from './cdp-client'

const ACTIONS = ['navigate', 'extract', 'screenshot', 'click', 'type', 'eval'] as const
type Action = (typeof ACTIONS)[number]

const SHOTS_DIR = process.env.XIMO_BROWSER_SHOTS || '/tmp/ximo-browser-shots'

export class BrowserTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'browser',
    description:
      '浏览器语义化自动化（CDP 直连 headless chromium，零截图优先）。\n' +
      '动作: navigate 打开 URL（当前 tab 导航，等加载完成）| extract 提取页面内容（title 与正文纯文本，可配 selector 只取该元素）| screenshot 整页截图（留存文件并返回路径，交给 vision_analyze 理解画面）| click 点击 CSS selector | type 向 CSS selector 输入文本（自动聚焦）| eval 执行任意 JS 并返回值（需审批）。\n' +
      '典型工作流：navigate(url) → extract() 读正文 → click/type 交互 → extract 校验结果。优先语义化 API，纯 API 无法判断再用 screenshot+vision_analyze。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '操作类型', enum: [...ACTIONS] },
        url: { type: 'string', description: 'navigate：目标 URL（http/https）' },
        selector: { type: 'string', description: 'click/type 的 CSS selector；extract 可选（只提取该元素文本）' },
        text: { type: 'string', description: 'type：要输入的文本' },
        expression: { type: 'string', description: 'eval：要执行的 JS 表达式（需审批）' },
      },
      required: ['action'],
    },
  }

  private readonly cdp: CdpClient

  constructor(opts?: { port?: number }) {
    // 端口按 pid 派生（9222 + pid%200）—— 并发任务的 worker 各有 chromium，
    // 固定端口会互相抢占（沙箱下表现为随机启动失败）。env 可显式覆盖（单实例调试用）
    const base = Number(process.env.XIMO_BROWSER_CDP_PORT) || 9222
    this.cdp = new CdpClient({ port: opts?.port ?? (base + (process.pid % 200)) })
  }

  async execute(call: ToolCall, _ctx: unknown): Promise<ToolResult> {
    const args = call.arguments as Record<string, unknown>
    const action = String(args.action ?? '') as Action
    if (!ACTIONS.includes(action)) {
      return { toolCallId: call.id, toolName: 'browser', content: '', success: false, error: `未知动作: ${action}（可选 ${ACTIONS.join('/')}）` }
    }
    try {
      const data = await this.run(action, args)
      return { toolCallId: call.id, toolName: 'browser', content: data, success: true }
    } catch (e) {
      return { toolCallId: call.id, toolName: 'browser', content: '', success: false, error: `browser ${action} 失败：${(e as Error).message.slice(0, 300)}` }
    }
  }

  private async run(action: Action, args: Record<string, unknown>): Promise<string> {
    switch (action) {
      case 'navigate': {
        const url = String(args.url ?? '')
        if (!/^https?:\/\//.test(url)) throw new Error('url 必须以 http(s):// 开头')
        await this.cdp.send('Page.enable')
        await this.cdp.send('Page.navigate', { url })
        // 等加载稳定（Load Event Fired 之后视为可交互；简化：轮询 readyState）
        for (let i = 0; i < 40; i++) {
          const r = await this.cdp.send<{ result: { value: string } }>('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true })
          if (r.result?.value === 'complete') break
          await new Promise((res) => setTimeout(res, 250))
        }
        const title = await this.cdp.send<{ result: { value: string } }>('Runtime.evaluate', { expression: 'document.title', returnByValue: true })
        return `已打开 ${url}（title: ${title.result?.value ?? '(无)'}）`
      }
      case 'extract': {
        const selector = args.selector ? String(args.selector) : null
        const expr = selector
          ? `(document.querySelector(${JSON.stringify(selector)})?.innerText ?? '').slice(0, 6000)`
          : `(document.body?.innerText ?? '').slice(0, 6000)`
        const text = await this.cdp.send<{ result: { value: string } }>('Runtime.evaluate', { expression: expr, returnByValue: true })
        const title = await this.cdp.send<{ result: { value: string } }>('Runtime.evaluate', { expression: 'document.title', returnByValue: true })
        return `title: ${title.result?.value ?? ''}\n\n${text.result?.value || '（空）'}`
      }
      case 'screenshot': {
        const shot = await this.cdp.send<{ data: string }>('Page.captureScreenshot', { format: 'png' })
        await mkdir(SHOTS_DIR, { recursive: true })
        const file = join(SHOTS_DIR, `browser-${Date.now()}.png`)
        await writeFile(file, Buffer.from(shot.data, 'base64'))
        return `截图已留存: ${file}（理解画面内容请调用 vision_analyze(file_path='${file}')）`
      }
      case 'click': {
        const selector = String(args.selector ?? '')
        if (!selector) throw new Error('click 需要 selector')
        const rect = await this.cdp.send<{ result: { value: { x: number; y: number } | null } }>('Runtime.evaluate', {
          expression: `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`,
          returnByValue: true,
        })
        const center = rect.result?.value
        if (!center) throw new Error(`未找到元素: ${selector}`)
        for (const [type, button] of [['mousePressed', 'left'], ['mouseReleased', 'left']] as const) {
          await this.cdp.send('Input.dispatchMouseEvent', { type, x: center.x, y: center.y, button, clickCount: 1 })
        }
        return `已点击 ${selector}`
      }
      case 'type': {
        const selector = String(args.selector ?? '')
        const text = String(args.text ?? '')
        if (!selector || !text) throw new Error('type 需要 selector 与 text')
        await this.run('click', { selector })
        await this.cdp.send('Input.insertText', { text })
        await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
        await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
        return `已向 ${selector} 输入 ${text.length} 字符`
      }
      case 'eval': {
        const expression = String(args.expression ?? '')
        if (!expression) throw new Error('eval 需要 expression')
        const r = await this.cdp.send<{ result: { value?: unknown; type: string; description?: string } }>('Runtime.evaluate', { expression, returnByValue: true })
        return `结果: ${JSON.stringify(r.result?.value ?? r.result?.description ?? null)?.slice(0, 2000)}`
      }
    }
  }
}
