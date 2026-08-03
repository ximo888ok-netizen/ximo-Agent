import { writeFile, mkdir, copyFile } from 'fs/promises'
import { existsSync } from 'fs'
import { dirname, resolve, normalize, basename, join } from 'path'
import { tmpdir } from 'os'
import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

/** 在写入前备份已有文件到系统临时目录（不污染项目目录），返回快照路径 */
async function snapshotIfExists(filePath: string): Promise<string | null> {
  if (!existsSync(filePath)) return null
  const snapDir = join(tmpdir(), 'ximo-agent-snapshots')
  const safeName = basename(filePath).replace(/[^\w.-]/g, '_')
  const bakPath = join(snapDir, `${safeName}.snapshot-${Date.now()}.bak`)
  try {
    await mkdir(snapDir, { recursive: true })
    await copyFile(filePath, bakPath)
    return bakPath
  } catch {
    return null
  }
}

/**
 * FileWriteTool — 写入/创建文件
 * 自动创建父目录，支持覆盖和追加模式
 */
export class FileWriteTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'file_write',
    description:
      '写入或创建文件。自动创建不存在的父目录。支持覆盖和追加两种模式。当需要创建新文件、写入代码、保存配置时使用。修改已有文件应优先使用 file_edit 进行精确替换。',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: '文件路径（绝对路径或相对路径）'
        },
        content: {
          type: 'string',
          description: '要写入的文件内容'
        },
        mode: {
          type: 'string',
          description: '写入模式：overwrite（覆盖，默认）或 append（追加）',
          enum: ['overwrite', 'append'],
          default: 'overwrite'
        }
      },
      required: ['filePath', 'content']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    _signal?: AbortSignal
  ): Promise<ToolResult> {
    const filePath = (toolCall.arguments.filePath as string) || ''
    const content = (toolCall.arguments.content as string) || ''
    const mode = (toolCall.arguments.mode as string) || 'overwrite'

    if (!filePath) {
      return this.error(toolCall.id, '缺少 filePath 参数')
    }

    const normalized = normalize(resolve(filePath))

    onChunk?.({ toolStatus: 'calling', toolName: 'file_write' })

    try {
      // 确保父目录存在
      await mkdir(dirname(normalized), { recursive: true })

      // 写入前自动快照已有文件
      const snapshotPath = await snapshotIfExists(normalized)

      if (mode === 'append') {
        const { appendFile } = await import('fs/promises')
        await appendFile(normalized, content, 'utf-8')
      } else {
        await writeFile(normalized, content, 'utf-8')
      }

      const lines = content.split('\n').length
      const sizeKB = (Buffer.byteLength(content, 'utf-8') / 1024).toFixed(1)
      const fileName = normalized.split(/[/\\]/).pop() || normalized

      return {
        toolCallId: toolCall.id,
        toolName: 'file_write',
        content: `文件已${mode === 'append' ? '追加写入' : '创建/覆盖'}：\`${normalized}\`\n- ${lines} 行\n- ${sizeKB} KB`,
        success: true,
        displayType: 'text',
        metadata: { filePath: normalized, fileName, lines, sizeKB, mode, additions: lines, deletions: 0, snapshotPath }
      }
    } catch (e) {
      return this.error(toolCall.id, `写入失败：${(e as Error).message}`)
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'file_write', content: '', success: false, error: msg }
  }
}
