import { unlink, rm, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { resolve, normalize } from 'path'
import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

/**
 * FileDeleteTool — 删除文件或目录
 * 支持递归删除目录，自动安全确认
 */
export class FileDeleteTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'file_delete',
    description:
      '删除文件或目录。删除目录时支持递归删除。此操作不可逆，执行前会自动确认。用于清理无用文件、删除废弃模块等场景。',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: '要删除的文件或目录路径'
        },
        recursive: {
          type: 'boolean',
          description: '是否递归删除目录（类似 rm -r），默认 false。仅对目录有效',
          default: false
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
    const recursive = (toolCall.arguments.recursive as boolean) || false

    if (!filePath) {
      return this.error(toolCall.id, '缺少 filePath 参数')
    }

    const normalized = normalize(resolve(filePath))

    if (!existsSync(normalized)) {
      return this.error(toolCall.id, `文件不存在：${normalized}`)
    }

    onChunk?.({ toolStatus: 'calling', toolName: 'file_delete' })

    try {
      const s = await stat(normalized)
      const isDir = s.isDirectory()
      const fileName = normalized.split(/[/\\]/).pop() || normalized

      if (isDir && !recursive) {
        return this.error(toolCall.id, `\`${normalized}\` 是目录，需要设置 recursive: true 才能删除`)
      }

      if (isDir) {
        await rm(normalized, { recursive: true, force: false })
      } else {
        await unlink(normalized)
      }

      const sizeKB = isDir ? 0 : (s.size / 1024).toFixed(1)

      return {
        toolCallId: toolCall.id,
        toolName: 'file_delete',
        content: `已${isDir ? '递归删除目录' : '删除文件'}：\`${normalized}\`${!isDir ? `\n- ${sizeKB} KB` : ''}`,
        success: true,
        displayType: 'text',
        metadata: { filePath: normalized, fileName, wasDirectory: isDir, sizeKB },
        requiresConfirmation: true,
        confirmationMessage: `即将删除${isDir ? '目录' : '文件'}：${normalized}`
      }
    } catch (e) {
      return this.error(toolCall.id, `删除失败：${(e as Error).message}`)
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'file_delete', content: '', success: false, error: msg }
  }
}
