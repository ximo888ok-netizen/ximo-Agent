import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

/**
 * JSHookTool — JS Hook 注入
 * 在浏览器页面中注入 Hook 脚本拦截特定函数调用
 * 参考 AntiDebug_Breaker 的 Hook 体系
 */
export class JSHookTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'js_hook',
    description: '在浏览器页面中注入 JavaScript Hook 脚本，拦截特定函数调用并返回调用参数和结果。支持 hook XHR/fetch/JSON.parse/CryptoJS 等。用于前端逆向和分析网站加密逻辑。',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Hook 目标', enum: ['xhr', 'fetch', 'cookie', 'json_parse', 'json_stringify', 'crypto_aes', 'crypto_rsa', 'navigation'] },
        filter: { type: 'string', description: '可选过滤参数（如 URL 关键词）', default: '' }
      },
      required: ['target']
    }
  }

  private hookScripts: Record<string, string> = {
    xhr: `(function(){var origOpen=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){this._url=u;this._method=m;return origOpen.apply(this,arguments)};var origSend=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.send=function(b){var self=this;this.addEventListener('load',function(){console.log('[Hook XHR]',self._method,self._url,self.status,self.responseText.slice(0,500))});return origSend.call(this,b)}})();`,
    fetch: `(function(){var origFetch=window.fetch;window.fetch=function(){var args=arguments;console.log('[Hook Fetch]',args[0]);return origFetch.apply(this,args).then(function(r){r.clone().text().then(function(t){console.log('[Hook Fetch Response]',r.url,r.status,t.slice(0,500))});return r})}})();`,
    cookie: `(function(){var desc=Object.getOwnPropertyDescriptor(Document.prototype,'cookie')||Object.getOwnPropertyDescriptor(HTMLDocument.prototype,'cookie');var origGet=desc.get,origSet=desc.set;Object.defineProperty(document,'cookie',{get:function(){return origGet.call(document)},set:function(v){console.log('[Hook Cookie Set]',v);origSet.call(document,v)},configurable:true})})();`,
    json_parse: `(function(){var origParse=JSON.parse;JSON.parse=function(t,r){console.log('[Hook JSON.parse]',t.slice(0,500));return origParse(t,r)}})();`,
    json_stringify: `(function(){var origStringify=JSON.stringify;JSON.stringify=function(v,r,s){console.log('[Hook JSON.stringify]',typeof v==='string'?v.slice(0,500):JSON.stringify(v).slice(0,500));return origStringify(v,r,s)}})();`,
    crypto_aes: `(function(){if(window.CryptoJS&&window.CryptoJS.AES){var origEncrypt=CryptoJS.AES.encrypt;var origDecrypt=CryptoJS.AES.decrypt;CryptoJS.AES.encrypt=function(){console.log('[Hook AES Encrypt] plaintext:',arguments[0],'key:',arguments[1]);return origEncrypt.apply(this,arguments)};CryptoJS.AES.decrypt=function(){console.log('[Hook AES Decrypt] ciphertext:',arguments[0],'key:',arguments[1]);return origDecrypt.apply(this,arguments)}}})();`,
    crypto_rsa: `(function(){if(window.JSEncrypt){var origEncrypt=JSEncrypt.prototype.encrypt;JSEncrypt.prototype.encrypt=function(){console.log('[Hook RSA Encrypt]',arguments[0]);return origEncrypt.apply(this,arguments)};var origDecrypt=JSEncrypt.prototype.decrypt;JSEncrypt.prototype.decrypt=function(){console.log('[Hook RSA Decrypt]',arguments[0]);return origDecrypt.apply(this,arguments)}}})();`,
    navigation: `(function(){var origAssign=window.location.assign;window.location.assign=function(u){console.log('[Hook Navigation] location.assign:',u)};var origReplace=window.location.replace;window.location.replace=function(u){console.log('[Hook Navigation] location.replace:',u)};var origHref=Object.getOwnPropertyDescriptor(window.Location.prototype,'href');Object.defineProperty(window.location,'href',{set:function(v){console.log('[Hook Navigation] location.href:',v)}})})();`
  }

  async execute(toolCall: ToolCall, onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal): Promise<ToolResult> {
    const target = toolCall.arguments.target as string
    if (!target || !this.hookScripts[target]) {
      return { toolCallId: toolCall.id, toolName: 'js_hook', content: '', success: false, error: `不支持的 Hook 目标：${target}。支持：${Object.keys(this.hookScripts).join(', ')}` }
    }
    onChunk?.({ toolStatus: 'calling', toolName: 'js_hook' })

    try {
      const { BrowserManager } = await import('@main/tools/Browser/BrowserManager')
      const page = await BrowserManager.getInstance().getPage()

      // 刷新前注入
      await page.evaluate(this.hookScripts[target])

      // 监听控制台输出捕获 Hook 结果
      let captured = ''
      page.on('console', (msg) => {
        if (msg.text().startsWith('[Hook ')) {
          captured += msg.text() + '\n'
        }
      })

      return {
        toolCallId: toolCall.id, toolName: 'js_hook',
        content: `✅ Hook 已注入：${target}\n\nHook 脚本已注入页面。当目标函数被调用时，结果将显示在浏览器控制台中。建议先在页面上触发相关操作（如点击按钮、提交表单），然后使用 network_capture 查看捕获结果。\n\n已注入的 Hook：${target}\n\n${captured ? `**捕获结果：**\n\`\`\`\n${captured.slice(0, 3000)}\n\`\`\`` : '等待操作触发...'}`,
        success: true, displayType: 'text',
        metadata: { target }
      }
    } catch (e) {
      return { toolCallId: toolCall.id, toolName: 'js_hook', content: '', success: false, error: `Hook 注入失败：${(e as Error).message}。请确认已打开目标页面。` }
    }
  }
}
