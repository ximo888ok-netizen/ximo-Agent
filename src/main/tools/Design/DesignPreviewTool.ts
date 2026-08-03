import { BrowserWindow } from 'electron'
import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

/**
 * DesignPreviewTool — UI 组件实时预览
 * 在独立 Electron BrowserWindow 中预览 HTML/React 组件
 */
export class DesignPreviewTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'design_preview',
    description: '在独立窗口中预览 UI 组件的实时效果。支持 HTML 片段和完整页面。用于快速验证 UI 生成结果。',
    parameters: {
      type: 'object',
      properties: {
        html: { type: 'string', description: '要预览的 HTML 内容（包含 Tailwind CSS CDN 引用）' }
      },
      required: ['html']
    }
  }

  private previewWindow: BrowserWindow | null = null

  async execute(toolCall: ToolCall, onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal): Promise<ToolResult> {
    const html = (toolCall.arguments.html as string) || ''
    if (!html) return this.error(toolCall.id, '缺少 html 参数')
    onChunk?.({ toolStatus: 'calling', toolName: 'design_preview' })

    try {
      // 包装完整的 HTML 页面
      const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; }
    @media (prefers-color-scheme: dark) { body { background: #0f172a; } }
  </style>
</head>
<body class="p-8 min-h-screen">
  ${html}
</body>
</html>`

      // 关闭旧的预览窗口
      if (this.previewWindow && !this.previewWindow.isDestroyed()) {
        this.previewWindow.close()
        this.previewWindow = null
      }

      // 创建新窗口
      this.previewWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        title: 'UI Preview - XimoAgent',
        autoHideMenuBar: true,
        webPreferences: { sandbox: true, contextIsolation: true }
      })

      await this.previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`)

      return {
        toolCallId: toolCall.id, toolName: 'design_preview',
        content: '预览窗口已打开。你可以在独立窗口中查看 UI 组件的实时效果。关闭窗口即可。',
        success: true, displayType: 'text'
      }
    } catch (e) {
      return this.error(toolCall.id, `预览失败：${(e as Error).message}`)
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'design_preview', content: '', success: false, error: msg }
  }
}
