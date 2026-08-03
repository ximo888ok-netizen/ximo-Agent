import { join } from 'path'
import { fileURLToPath } from 'url'
import { BrowserManager } from '@main/tools/Browser/BrowserManager'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/** rrweb UMD bundle 的文件路径 */
const RRWEB_BUNDLE_PATH = join(__dirname, '../../../node_modules/rrweb/dist/rrweb.umd.cjs')

/**
 * RrwebReplayer — 在 Playwright 页面中回放 rrweb 事件流
 * 
 * 工作原理：
 * 1. 打开有头浏览器，导航到空白页面
 * 2. 注入 rrweb UMD bundle（包含 Replayer）
 * 3. 创建回放容器，初始化 Replayer 并开始回放
 * 4. 用户可以在浏览器中看到完整的操作回放
 */
export class RrwebReplayer {
  private static instance: RrwebReplayer

  static getInstance(): RrwebReplayer {
    if (!RrwebReplayer.instance) {
      RrwebReplayer.instance = new RrwebReplayer()
    }
    return RrwebReplayer.instance
  }

  /**
   * 回放 rrweb 事件流
   */
  async replay(events: Record<string, unknown>[]): Promise<{ duration: number; eventCount: number }> {
    if (events.length === 0) {
      return { duration: 0, eventCount: 0 }
    }

    const browserManager = BrowserManager.getInstance()
    browserManager.setHeadless(false)
    const page = await browserManager.getPage()

    try {
      // 1. 导航到空白页面作为回放容器
      await page.goto('about:blank', { waitUntil: 'load' })

      // 2. 注入 rrweb UMD bundle
      await page.addScriptTag({ path: RRWEB_BUNDLE_PATH })

      // 3. 注入回放容器和 Replayer
      const eventsJson = JSON.stringify(events)

      await page.evaluate((eventsStr: string) => {
        // 创建回放容器
        const container = document.createElement('div')
        container.id = 'replayer-container'
        container.style.width = '100%'
        container.style.height = '100vh'
        document.body.appendChild(container)

        // 解析事件数据
        const parsedEvents = JSON.parse(eventsStr)

        // 创建 rrweb Replayer 并开始回放
        // @ts-ignore rrweb 通过 UMD bundle 注入后挂在 window.rrweb 上
        const replayer = new rrweb.Replayer(parsedEvents, {
          root: container,
          skipTiming: false,
          showDebug: false,
          liveMode: false
        })

        replayer.play()

        // @ts-ignore
        window.__rrwebReplayer = replayer
      }, eventsJson)

      // 4. 计算回放时长
      const lastEvent = events[events.length - 1]
      const firstEvent = events[0]
      const duration = ((lastEvent.timestamp as number) - (firstEvent.timestamp as number))

      return { duration, eventCount: events.length }
    } catch (e) {
      browserManager.setHeadless(true)
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`rrweb 回放失败：${msg}`)
    }
  }

  /**
   * 停止回放并恢复浏览器 headless 模式
   */
  async stopReplay(): Promise<void> {
    const browserManager = BrowserManager.getInstance()
    browserManager.setHeadless(true)
  }
}
