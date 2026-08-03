import { rename, stat, mkdir, copyFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { resolve, normalize, dirname } from 'path'
import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

/**
 * MoveFileTool — 移动或重命名文件
 * 参考 Reasonix move_file：自动创建目标父目录，支持跨设备移动
 */
export class MoveFileTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'move_file',
    description:
      '移动或重命名文件。自动创建目标父目录。如果目标已存在会报错（防止覆盖）。用于重构时移动文件、重命名模块等。比 terminal_exec + mv/Move-Item 更安全。',
    parameters: {
      type: 'object',
      properties: {
        sourcePath: {
          type: 'string',
          description: '源文件路径（必须存在）'
        },
        destinationPath: {
          type: 'string',
          description: '目标文件路径（不能已存在）'
        }
      },
      required: ['sourcePath', 'destinationPath']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    _signal?: AbortSignal
  ): Promise<ToolResult> {
    const sourcePath = (toolCall.arguments.sourcePath as string) || ''
    const destinationPath = (toolCall.arguments.destinationPath as string) || ''

    if (!sourcePath) {
      return this.error(toolCall.id, '缺少 sourcePath 参数')
    }
    if (!destinationPath) {
      return this.error(toolCall.id, '缺少 destinationPath 参数')
    }

    const src = normalize(resolve(sourcePath))
    const dst = normalize(resolve(destinationPath))

    onChunk?.({ toolStatus: 'calling', toolName: 'move_file' })

    try {
      // 检查源文件
      if (!existsSync(src)) {
        return this.error(toolCall.id, `源文件不存在：${src}`)
      }

      const srcStat = await stat(src)
      if (srcStat.isDirectory()) {
        return this.error(toolCall.id, `${src} 是目录，move_file 只能移动文件`)
      }

      // 同一路径
      if (src === dst) {
        return {
          toolCallId: toolCall.id,
          toolName: 'move_file',
          content: `${src} 已在目标位置，无需移动`,
          success: true,
          displayType: 'text'
        }
      }

      // 检查目标是否已存在
      if (existsSync(dst)) {
        return this.error(toolCall.id, `目标文件已存在：${dst}`)
      }

      // 创建目标父目录
      const dstDir = dirname(dst)
      if (!existsSync(dstDir)) {
        await mkdir(dstDir, { recursive: true })
      }

      // 尝试原子重命名，失败则回退到复制+删除（跨设备）
      try {
        await rename(src, dst)
      } catch (renameErr) {
        const msg = (renameErr as Error).message.toLowerCase()
        if (msg.includes('cross-device') || msg.includes('different device') || msg.includes('not same device')) {
          // 跨设备：复制后删除
          await copyFile(src, dst)
          await unlink(src)
        } else {
          throw renameErr
        }
      }

      const fileName = dst.split(/[/\\]/).pop() || dst
      return {
        toolCallId: toolCall.id,
        toolName: 'move_file',
        content: `已移动：\`${src}\` → \`${dst}\``,
        success: true,
        displayType: 'text',
        metadata: {
          filePath: dst,
          fileName,
          sourcePath: src,
          destinationPath: dst,
          additions: 0,
          deletions: 0
        }
      }
    } catch (e) {
      return this.error(toolCall.id, `移动失败：${(e as Error).message}`)
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'move_file', content: '', success: false, error: msg }
  }
}
