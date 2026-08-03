/** 内嵌浏览器 — 工具函数 */

let tabIdCounter = 0

/** 生成唯一标签 ID */
export function genTabId(): string {
  tabIdCounter += 1
  return `tab-${Date.now()}-${tabIdCounter}`
}

/** 安全调用 webview 方法（吞掉异常返回 undefined） */
export function safeCall<T>(fn: () => T): T | undefined {
  try { return fn() } catch { return undefined }
}

/** URL 智能补全 — 无协议时自动加 https://，非 URL 时搜索 */
export function normalizeUrl(input: string): string {
  let target = input.trim()
  if (!target) return ''
  if (!/^https?:\/\//.test(target)) {
    if (/^[\w.-]+\.\w{2,}/.test(target)) {
      target = 'https://' + target
    } else {
      target = 'https://www.bing.com/search?q=' + encodeURIComponent(target)
    }
  }
  return target
}

/** 根据选择器类型生成查找元素的 JS 表达式（支持 CSS / XPath / text=） */
export function selectorToJs(selector: string): string {
  if (selector.startsWith('//') || selector.startsWith('(')) {
    return `document.evaluate(${JSON.stringify(selector)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue`
  }
  if (selector.startsWith('text=')) {
    const text = selector.slice(5)
    return `Array.from(document.querySelectorAll('button, a, span, div, label, td, li, p, h1, h2, h3, h4, h5, h6')).find(el => (el.textContent || '').trim().includes(${JSON.stringify(text)}))`
  }
  return `document.querySelector(${JSON.stringify(selector)})`
}

/** 从 URL 提取简短标签标题 */
export function urlToTitle(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    return host.length > 18 ? host.slice(0, 18) + '…' : host
  } catch {
    return url.slice(0, 20) || '新标签页'
  }
}
