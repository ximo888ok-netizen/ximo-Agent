import { readFile, writeFile, copyFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { resolve, normalize, basename, dirname, join } from 'path'
import { tmpdir } from 'os'
import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

/** 编辑前备份到临时目录 */
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

interface EditStep {
  oldStr: string
  newStr: string
  replaceAll?: boolean
}

/** applyOldStringEdit 的返回值 */
interface EditResult {
  applied: number
  matches: number
  updated: string
}

/** 在 content 中查找并替换 oldString */
function applyEdit(content: string, oldString: string, newString: string, replaceAll: boolean): EditResult {
  if (oldString === '') {
    return { applied: 0, matches: 0, updated: content }
  }

  // 统计匹配数
  let matches = 0
  let idx = content.indexOf(oldString)
  while (idx !== -1) {
    matches++
    if (!replaceAll) break
    idx = content.indexOf(oldString, idx + oldString.length)
  }

  if (matches === 0) {
    return { applied: 0, matches: 0, updated: content }
  }

  if (replaceAll) {
    const updated = content.split(oldString).join(newString)
    return { applied: matches, matches, updated }
  }

  // 单次替换
  const pos = content.indexOf(oldString)
  const updated = content.slice(0, pos) + newString + content.slice(pos + oldString.length)
  return { applied: 1, matches, updated }
}

/**
 * MultiEditTool — 对单个文件批量应用多个编辑，原子操作
 * 参考 Reasonix multi_edit：每个编辑看到前一个编辑的结果，全部成功才写入
 */
export class MultiEditTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'multi_edit',
    description:
      '对单个文件批量应用多个编辑（原子操作）。每个编辑看到前一个编辑的结果，全部成功才写入磁盘——任一步骤失败则文件保持不变。比链式调用 file_edit 更安全高效。',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: '要编辑的文件路径'
        },
        edits: {
          type: 'array',
          description: '有序编辑列表。每个编辑看到前一个编辑的结果。',
          items: {
            type: 'object',
            properties: {
              oldStr: {
                type: 'string',
                description: '要查找的文本（必须精确匹配）。不设 replaceAll 时必须唯一匹配'
              },
              newStr: {
                type: 'string',
                description: '替换后的文本（空字符串表示删除）'
              },
              replaceAll: {
                type: 'boolean',
                description: '替换所有匹配项而非要求唯一匹配'
              }
            },
            required: ['oldStr', 'newStr']
          }
        }
      },
      required: ['filePath', 'edits']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    _signal?: AbortSignal
  ): Promise<ToolResult> {
    const filePath = (toolCall.arguments.filePath as string) || ''
    const edits = (toolCall.arguments.edits as EditStep[]) || []

    if (!filePath) {
      return this.error(toolCall.id, '缺少 filePath 参数')
    }
    if (edits.length === 0) {
      return this.error(toolCall.id, 'edits 不能为空')
    }

    const normalized = normalize(resolve(filePath))

    if (!existsSync(normalized)) {
      return this.error(toolCall.id, `文件不存在：${normalized}`)
    }

    onChunk?.({ toolStatus: 'calling', toolName: 'multi_edit' })

    try {
      let content = await readFile(normalized, 'utf-8')
      let totalApplied = 0

      for (let i = 0; i < edits.length; i++) {
        const step = edits[i]
        if (!step.oldStr) {
          return {
            toolCallId: toolCall.id,
            toolName: 'multi_edit',
            content: `编辑 ${i + 1} 失败：oldStr 不能为空`,
            success: false,
            error: `编辑 ${i + 1}: oldStr 不能为空`,
            displayType: 'text'
          }
        }

        const result = applyEdit(content, step.oldStr, step.newStr ?? '', step.replaceAll ?? false)

        if (result.matches === 0) {
          return {
            toolCallId: toolCall.id,
            toolName: 'multi_edit',
            content: `编辑 ${i + 1} 失败：在文件中未找到要替换的文本块。文件未被修改。`,
            success: false,
            error: `编辑 ${i + 1}: 未找到匹配的文本块`,
            displayType: 'text'
          }
        }

        if (!step.replaceAll && result.matches > 1) {
          return {
            toolCallId: toolCall.id,
            toolName: 'multi_edit',
            content: `编辑 ${i + 1} 失败：找到了 ${result.matches} 处匹配（需要唯一匹配）。请包含更多上下文。文件未被修改。`,
            success: false,
            error: `编辑 ${i + 1}: 找到了 ${result.matches} 处匹配`,
            displayType: 'text'
          }
        }

        content = result.updated
        totalApplied += result.applied
      }

      // 所有编辑成功，写入前快照
      const snapshotPath = await snapshotFile(normalized)
      await writeFile(normalized, content, 'utf-8')

      const fileName = normalized.split(/[/\\]/).pop() || normalized
      return {
        toolCallId: toolCall.id,
        toolName: 'multi_edit',
        content: `批量编辑完成：\`${normalized}\`\n- ${edits.length} 个编辑步骤，${totalApplied} 处替换`,
        success: true,
        displayType: 'text',
        metadata: {
          filePath: normalized,
          fileName,
          editsCount: edits.length,
          totalApplied,
          additions: totalApplied,
          deletions: edits.length,
          snapshotPath
        }
      }
    } catch (e) {
      return this.error(toolCall.id, `批量编辑失败：${(e as Error).message}`)
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'multi_edit', content: '', success: false, error: msg }
  }
}
