import type { Browser, BrowserContext, Page } from 'playwright'

/**
 * BrowserManager — Playwright 浏览器生命周期管理（单例）
 * 懒初始化 + 空闲 5 分钟自动关闭
 */
export class BrowserManager {
  private static instance: BrowserManager
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private idleTimeoutMs = 5 * 60 * 1000 // 5 分钟
  private headless = true
  private viewportWidth = 1280
  private viewportHeight = 800
  /** 标记是否已尝试自动安装，避免每次工具调用都触发安装 */
  private installAttempted = false

  static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager()
    }
    return BrowserManager.instance
  }

  setHeadless(headless: boolean): void {
    this.headless = headless
  }

  setIdleTimeout(minutes: number): void {
    this.idleTimeoutMs = minutes * 60 * 1000
  }

  setViewport(width: number, height: number): void {
    this.viewportWidth = width
    this.viewportHeight = height
  }

  async getPage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) {
      this.resetIdleTimer()
      return this.page
    }

    await this.ensureBrowser()
    this.page = await (this.context!).newPage()
    this.resetIdleTimer()
    return this.page
  }

  async getPageForUrl(url: string): Promise<Page> {
    const page = await this.getPage()
    const currentUrl = page.url()
    if (currentUrl !== url && currentUrl !== 'about:blank') {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    } else if (currentUrl === 'about:blank') {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    }
    return page
  }

  async closeBrowser(): Promise<void> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    try {
      if (this.page) {
        await this.page.close().catch(() => {})
        this.page = null
      }
      if (this.context) {
        await this.context.close().catch(() => {})
        this.context = null
      }
      if (this.browser) {
        await this.browser.close().catch(() => {})
        this.browser = null
      }
    } catch {
      // 忽略关闭错误
    }
  }

  private async ensureBrowser(): Promise<void> {
    if (this.browser && this.browser.isConnected()) return

    // 动态导入 playwright（避免启动时加载重依赖）
    const { chromium } = await import('playwright')

    // 尝试启动浏览器；若可执行文件不存在则自动安装后重试一次
    try {
      await this.launchBrowser(chromium)
    } catch (e) {
      const msg = (e as Error).message || ''
      // Playwright 的 "Executable doesn't exist" 错误 — 自动安装后重试
      if (msg.includes("Executable doesn't exist") && !this.installAttempted) {
        this.installAttempted = true
        console.warn('[BrowserManager] 浏览器未安装，正在自动下载...')
        try {
          const { execSync } = await import('child_process')
          execSync('npx playwright install chromium', {
            stdio: 'pipe',
            timeout: 300_000, // 5 分钟超时
            windowsHide: true
          })
          await this.launchBrowser(chromium)
          return
        } catch (installErr) {
          console.warn('[BrowserManager] 自动安装失败：', (installErr as Error).message)
        }
      }
      // 安装失败或非可执行文件错误 — 抛出清理后的错误
      throw new Error(
        'Playwright 浏览器未安装。请在终端执行 `npx playwright install chromium` 后重试，'
        + '或在右侧面板中开启内嵌浏览器。'
      )
    }
  }

  private async launchBrowser(chromium: typeof import('playwright')['chromium']): Promise<void> {
    this.browser = await chromium.launch({
      headless: this.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    this.context = await this.browser.newContext({
      viewport: { width: this.viewportWidth, height: this.viewportHeight },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
    })
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => {
      this.closeBrowser()
    }, this.idleTimeoutMs)
  }
}

export type { Page }
