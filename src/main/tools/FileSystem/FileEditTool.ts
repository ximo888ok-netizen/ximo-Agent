import { readFile, writeFile, copyFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { resolve, normalize, basename, dirname, join } from 'path'
import { tmpdir } from 'os'
import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

/** 在编辑前备份文件快照到系统临时目录（不污染项目目录），返回快照路径 */
async function snapshotFile(filePath: string): Promise<string | null> {
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
 * FileEditTool — 精确替换文件内容
 * 使用 search/replace 模式，找到匹配文本块并替换
 * 参考 Reasonix 的编辑合约设计
 */
export class FileEditTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'file_edit',
    description:
      '精确替换文件中的文本块（search/replace 模式）。找到文件中匹配的文本并替换为新内容。只替换第一个匹配项。必须包含足够的上下文来唯一标识替换位置。修改文件前应先用 file_read 查看当前内容。',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: '要编辑的文件路径'
        },
        oldStr: {
          type: 'string',
          description: '要被替换的原始文本块（必须精确匹配文件内容）'
        },
        newStr: {
          type: 'string',
          description: '替换后的新文本块'
        }
      },
      required: ['filePath', 'oldStr', 'newStr']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    _signal?: AbortSignal
  ): Promise<ToolResult> {
    const filePath = (toolCall.arguments.filePath as string) || ''
    const oldStr = (toolCall.arguments.oldStr as string) || ''
    const newStr = (toolCall.arguments.newStr as string) ?? ''

    if (!filePath) return this.error(toolCall.id, '缺少 filePath 参数')
    if (!oldStr) return this.error(toolCall.id, '缺少 oldStr 参数（要替换的原始文本）')

    const normalized = normalize(resolve(filePath))

    if (!existsSync(normalized)) {
      return this.error(toolCall.id, `文件不存在：${normalized}`)
    }

    onChunk?.({ toolStatus: 'calling', toolName: 'file_edit' })

    try {
      const content = await readFile(normalized, 'utf-8')

      // 查找第一个匹配
      const index = content.indexOf(oldStr)
      if (index === -1) {
        return {
          toolCallId: toolCall.id,
          toolName: 'file_edit',
          content: `编辑失败：在文件 \`${normalized}\` 中未找到要替换的文本块。请用 file_read 确认文件内容后再试。`,
          success: false,
          error: '未找到匹配的文本块',
          displayType: 'text'
        }
      }

      // 检查是否有多个匹配
      const secondIndex = content.indexOf(oldStr, index + oldStr.length)
      if (secondIndex !== -1) {
        return {
          toolCallId: toolCall.id,
          toolName: 'file_edit',
          content: `编辑失败：在文件中找到了多处匹配的文本块（第 ${this.lineAt(content, index)} 行和第 ${this.lineAt(content, secondIndex)} 行）。请包含更多上下文使 oldStr 唯一。`,
          success: false,
          error: '找到了多处匹配',
          displayType: 'text'
        }
      }

      // 执行替换
      const newContent = content.slice(0, index) + newStr + content.slice(index + oldStr.length)

      // 写入前自动快照
      const snapshotPath = await snapshotFile(normalized)

      await writeFile(normalized, newContent, 'utf-8')

      const oldLines = oldStr.split('\n').length
      const newLines = newStr.split('\n').length
      const position = this.lineAt(content, index)
      const additions = Math.max(0, newLines - oldLines)
      const deletions = Math.max(0, oldLines - newLines)

      return {
        toolCallId: toolCall.id,
        toolName: 'file_edit',
        content: `文件已编辑：\`${normalized}\`\n- 位置：第 ${position} 行\n- 变更：${oldLines} 行 → ${newLines} 行\n- +${additions} -${deletions}`,
        success: true,
        displayType: 'text',
        metadata: {
          filePath: normalized,
          fileName: normalized.split(/[/\\]/).pop() || normalized,
          position,
          oldLines,
          newLines,
          additions,
          deletions,
          oldContent: oldStr,
          newContent: newStr,
          snapshotPath
        }
      }
    } catch (e) {
      return this.error(toolCall.id, `编辑失败：${(e as Error).message}`)
    }
  }

  private lineAt(content: string, index: number): number {
    return content.slice(0, index).split('\n').length
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'file_edit', content: '', success: false, error: msg }
  }
}
