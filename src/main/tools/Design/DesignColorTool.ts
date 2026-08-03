import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

/**
 * DesignColorTool — 颜色系统分析与优化
 * 使用 chroma.js 进行颜色计算
 */
export class DesignColorTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'design_color',
    description: '分析和优化 UI 颜色系统。生成调色板、语义色映射、暗色模式变体、对比度验证。基于 chroma.js 进行科学颜色计算。',
    parameters: {
      type: 'object',
      properties: {
        primaryColor: { type: 'string', description: '主色调 hex，如 "#6366f1"' },
        style: { type: 'string', description: '风格：professional（专业）、playful（活泼）、minimal（极简）', enum: ['professional', 'playful', 'minimal'], default: 'professional' }
      },
      required: ['primaryColor']
    }
  }

  async execute(toolCall: ToolCall, onChunk?: (chunk: StreamChunk) => void, _signal?: AbortSignal): Promise<ToolResult> {
    const primary = (toolCall.arguments.primaryColor as string) || '#6366f1'
    const style = (toolCall.arguments.style as string) || 'professional'
    onChunk?.({ toolStatus: 'calling', toolName: 'design_color' })

    try {
      // chroma-js 动态导入，类型不完善
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chroma: any = await import('chroma-js')
      const c = chroma(primary)
      const scale = chroma.scale([c.brighten(2), c, c.darken(2)]).mode('lch')
      const colors = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((step) => {
        const t = (step - 50) / 900
        return { step, color: scale(t).hex() }
      })

      const lines = [
        `## 🎨 颜色系统分析`,
        '',
        `**主色**：${primary}`,
        `**亮度**：${c.luminance().toFixed(3)}`,
        `**HSL**：${c.hsl().map((v: number) => Math.round(v)).join(', ')}`,
        '',
        '### 色阶',
        '| Step | Color | 对比度(白) | 对比度(黑) |',
        '|------|-------|-----------|-----------|'
      ]

      colors.forEach(({ step, color }) => {
        const contrastWhite = chroma.contrast(color, '#ffffff').toFixed(2)
        const contrastBlack = chroma.contrast(color, '#000000').toFixed(2)
        lines.push(`| ${step} | \`${color}\` | ${contrastWhite}:1 | ${contrastBlack}:1 |`)
      })

      lines.push('', '### 语义色映射', `- Primary: \`${colors[4].color}\``, `- Hover: \`${colors[3].color}\``, `- Active: \`${colors[5].color}\``, `- Text on Primary: ${chroma.contrast(colors[4].color, '#ffffff') > 4.5 ? 'white' : 'dark'}`)
      lines.push('', '### 暗色模式适配', `- 暗色背景: \`${scale(0.85).hex()}\``, `- 暗色前景: \`${scale(0.15).hex()}\``)
      lines.push('', '### 调色板生成（推荐）', `\`\`\`js\n// Tailwind 配置\ncolors: {\n  primary: {\n${colors.map(({ step, color }) => `    ${step}: '${color}'`).join(',\n')}\n  }\n}\n\`\`\``)

      return {
        toolCallId: toolCall.id, toolName: 'design_color',
        content: lines.join('\n'), success: true, displayType: 'text',
        metadata: {
          primary,
          hsl: c.hsl(),
          palette: colors,
          semanticColors: {
            primary: colors[4].color,
            hover: colors[3].color,
            active: colors[5].color,
            textOnPrimary: chroma.contrast(colors[4].color, '#ffffff') > 4.5 ? '#ffffff' : '#000000'
          },
          darkMode: {
            background: scale(0.85).hex(),
            foreground: scale(0.15).hex()
          }
        }
      }
    } catch (e) {
      return this.error(toolCall.id, `颜色分析失败：${(e as Error).message}`)
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'design_color', content: '', success: false, error: msg }
  }
}
