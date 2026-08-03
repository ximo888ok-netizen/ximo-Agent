import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { resolve, normalize } from 'path'
import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

/**
 * FileReadTool — 读取本地文件内容
 * 支持编码检测 (jschardet)，自动处理常见编码
 */
export class FileReadTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'file_read',
    description:
      '读取本地文件内容。支持文本文件（自动检测编码）和二进制文件（返回 base64）。当需要查看项目代码、配置文件、日志文件等时使用。先使用此工具读取文件内容，再决定如何修改。',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: '文件的绝对路径或相对于工作目录的路径'
        },
        encoding: {
          type: 'string',
          description: '指定编码（utf8、base64），默认自动检测',
          enum: ['auto', 'utf8', 'base64'],
          default: 'auto'
        },
        startLine: {
          type: 'number',
          description: '从第几行开始读取（从 1 开始计数）。不传则从第 1 行开始。用于读取大文件的特定区段，避免用 terminal_exec + powershell 分段读',
          default: 1
        },
        endLine: {
          type: 'number',
          description: '读取到第几行（含）。不传或设为 0 则读到文件末尾。与 startLine 配合可精准读取大文件的任意区段',
          default: 0
        },
        maxLines: {
          type: 'number',
          description: '最多显示行数（与 startLine/endLine 二选一使用）。默认 500，设为 0 表示不限制',
          default: 500
        }
      },
      required: ['filePath']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    _signal?: AbortSignal
  ): Promise<ToolResult> {
    const filePath = (toolCall.arguments.filePath as string) || ''
    const encoding = (toolCall.arguments.encoding as string) || 'auto'
    const maxLines = (toolCall.arguments.maxLines as number) ?? 500
    const startLine = Math.max(1, (toolCall.arguments.startLine as number) ?? 1)
    const endLine = (toolCall.arguments.endLine as number) ?? 0

    if (!filePath) {
      return this.error(toolCall.id, '缺少 filePath 参数')
    }

    const normalized = normalize(resolve(filePath))

    if (!existsSync(normalized)) {
      return this.error(toolCall.id, `文件不存在：${normalized}`)
    }

    onChunk?.({ toolStatus: 'calling', toolName: 'file_read' })

    try {
      let content: string
      let displayPath = normalized

      if (encoding === 'base64') {
        const buf = await readFile(normalized)
        const sizeKB = (buf.length / 1024).toFixed(1)
        if (buf.length > 2 * 1024 * 1024) {
          return this.error(toolCall.id, `文件过大 (${sizeKB} KB)，超过 2MB 限制`)
        }
        content = buf.toString('base64')
        const truncated = this.truncateLines(content, maxLines)
        return {
          toolCallId: toolCall.id,
          toolName: 'file_read',
          content: `**文件**: \`${displayPath}\` (${sizeKB} KB, base64)\n\`\`\`\n${truncated}\n\`\`\``,
          success: true,
          displayType: 'code',
          metadata: { filePath: displayPath, sizeKB, encoding: 'base64' }
        }
      }

      // 自动检测编码
      let detectedEncoding = 'utf-8'
      try {
        const jschardet = await import('jschardet')
        const buffer = await readFile(normalized)
        const result = jschardet.detect(buffer)
        detectedEncoding = result.encoding || 'utf-8'
      } catch {
        detectedEncoding = 'utf-8'
      }

      const buffer = await readFile(normalized)
      content = buffer.toString(detectedEncoding as BufferEncoding)

      const lines = content.split('\n')
      const totalLines = lines.length

      // 优先使用 startLine/endLine 精准切片，否则回退到 maxLines 截断
      let displayLines: string[]
      let rangeNotice = ''
      if (endLine > 0 || startLine > 1) {
        const end = endLine > 0 ? Math.min(endLine, totalLines) : totalLines
        displayLines = lines.slice(startLine - 1, end)
        rangeNotice = `\n(显示第 ${startLine}-${Math.min(end, totalLines)} 行，共 ${totalLines} 行)`
      } else {
        displayLines = maxLines > 0 ? lines.slice(0, maxLines) : lines
        if (maxLines > 0 && totalLines > maxLines) {
          rangeNotice = `\n...(仅显示前 ${maxLines} 行，共 ${totalLines} 行，可用 startLine/endLine 读取后续内容)`
        }
      }
      const truncNotice = rangeNotice

      // 为每行添加行号前缀（使用真实行号），方便 LLM 和用户定位
      const numberedContent = displayLines
        .map((line, idx) => `${String(startLine + idx).padStart(4, ' ')} | ${line}`)
        .join('\n')

      // 获取文件扩展名用于语法高亮
      const ext = normalized.split('.').pop() || ''

      return {
        toolCallId: toolCall.id,
        toolName: 'file_read',
        content: `**文件**: \`${displayPath}\` (${totalLines} 行, 编码: ${detectedEncoding})\n\`\`\`${ext}\n${numberedContent}${truncNotice}\n\`\`\``,
        success: true,
        displayType: 'code',
        metadata: { filePath: displayPath, lines: totalLines, encoding: detectedEncoding }
      }
    } catch (e) {
      return this.error(toolCall.id, `读取失败：${(e as Error).message}`)
    }
  }

  private truncateLines(content: string, maxLines: number): string {
    if (maxLines <= 0) return content
    const lines = content.split('\n')
    if (lines.length <= maxLines) return content
    return lines.slice(0, maxLines).join('\n') + `\n...(共 ${lines.length} 行)`
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'file_read', content: '', success: false, error: msg }
  }
}
