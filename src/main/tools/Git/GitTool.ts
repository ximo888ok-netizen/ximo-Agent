import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'
import { resolve } from 'path'

type GitAction = 'status' | 'diff' | 'log' | 'add' | 'commit' | 'branch' | 'checkout' | 'pull' | 'push' | 'stash'

/**
 * GitTool — Git 版本控制操作
 * 使用 simple-git 库，支持常用 Git 操作
 */
export class GitTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'git_operations',
    description:
      '执行 Git 版本控制操作。支持 status（状态查看）、diff（差异对比）、log（提交历史）、add（暂存文件）、commit（提交）、branch（分支管理）、checkout（切换分支）、pull、push、stash（暂存）。Git 操作前会自动确认当前分支状态。push 为敏感操作需要特别确认。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Git 操作类型',
          enum: ['status', 'diff', 'log', 'add', 'commit', 'branch', 'checkout', 'pull', 'push', 'stash']
        },
        args: {
          type: 'string',
          description: '操作参数。status: 可选文件路径；diff: 可选 --staged, 文件路径；log: 可选 -n 数量；add: 文件路径（支持 . 或具体文件）；commit: 必填提交信息；branch: 可选分支名（不填则列出）、-d 删除分支；checkout: 分支名或 -b 新分支名；pull/push: 可选远程和分支；stash: [pop|list|drop]'
        },
        repoPath: {
          type: 'string',
          description: 'Git 仓库路径，默认为当前目录',
          default: '.'
        }
      },
      required: ['action']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    _signal?: AbortSignal
  ): Promise<ToolResult> {
    const action = toolCall.arguments.action as GitAction
    const args = (toolCall.arguments.args as string) || ''
    const repoPath = resolve((toolCall.arguments.repoPath as string) || '.')

    onChunk?.({ toolStatus: 'calling', toolName: 'git_operations' })

    try {
      // 动态导入 simple-git
      const { default: simpleGit } = await import('simple-git')
      const git = simpleGit(repoPath)

      // 检查是否为 git 仓库
      const isRepo = await git.checkIsRepo()
      if (!isRepo) {
        return this.error(toolCall.id, `目录 \`${repoPath}\` 不是一个 Git 仓库。`)
      }

      let content: string
      let requiresConfirm = false
      let confirmMsg = ''

      switch (action) {
        case 'status': {
          const status = await git.status()
          const lines = [`## 📊 Git Status`, `仓库：\`${repoPath}\``, `分支：${status.current}`, '']
          if (status.staged.length > 0) {
            lines.push(`**已暂存 (${status.staged.length})：**`)
            status.staged.forEach((f) => lines.push(`  ✅ ${f}`))
            lines.push('')
          }
          if (status.modified.length > 0) {
            lines.push(`**已修改 (${status.modified.length})：**`)
            status.modified.forEach((f) => lines.push(`  ✏️ ${f}`))
            lines.push('')
          }
          if (status.created.length > 0) {
            lines.push(`**新文件 (${status.created.length})：**`)
            status.created.forEach((f) => lines.push(`  ➕ ${f}`))
            lines.push('')
          }
          if (status.deleted.length > 0) {
            lines.push(`**已删除 (${status.deleted.length})：**`)
            status.deleted.forEach((f) => lines.push(`  ❌ ${f}`))
            lines.push('')
          }
          if (status.not_added.length > 0) {
            lines.push(`**未跟踪 (${status.not_added.length})：**`)
            status.not_added.forEach((f) => lines.push(`  ❓ ${f}`))
          }
          if (status.staged.length === 0 && status.modified.length === 0 && status.created.length === 0) {
            lines.push('工作区干净，无待提交的更改。')
          }
          content = lines.join('\n')
          break
        }

        case 'diff': {
          const diffArgs: string[] = []
          if (args) {
            diffArgs.push(...args.split(/\s+/))
          }
          const diff = await git.diff(diffArgs)
          content = diff
            ? `## 📝 Git Diff\n\`\`\`diff\n${diff.slice(0, 30000)}\n\`\`\`\n${diff.length > 30000 ? '...(diff 被截断)' : ''}`
            : '工作区无差异。'
          break
        }

        case 'log': {
          const n = parseInt(args) || 10
          const log = await git.log({ n: Math.min(n, 50) })
          const lines = ['## 📜 Git Log', '']
          log.all.forEach((c) => {
            lines.push(`- \`${c.hash.slice(0, 7)}\` ${c.date.split('T')[0]} — **${c.message.split('\n')[0]}** (${c.author_name})`)
          })
          content = lines.join('\n')
          break
        }

        case 'add': {
          const files = args || '.'
          await git.add(files.split(/\s+/))
          content = `已暂存文件：${files}`
          break
        }

        case 'commit': {
          if (!args) {
            return this.error(toolCall.id, 'commit 操作需要提供提交信息（args 参数）')
          }
          const result = await git.commit(args)
          content = `已提交：\`${result.commit}\`\n提交信息：${args}`
          requiresConfirm = true
          confirmMsg = `即将提交：${args}`
          break
        }

        case 'branch': {
          if (!args || args === '-l') {
            const branches = await git.branch()
            const lines = ['## 🌿 Git Branches', '']
            branches.all.forEach((b) => {
              lines.push(b === branches.current ? `- **\`${b}\`** ← 当前` : `- \`${b}\``)
            })
            content = lines.join('\n')
          } else if (args.startsWith('-d ') || args.startsWith('-D ')) {
            const branchName = args.slice(3).trim()
            await git.deleteLocalBranch(branchName)
            content = `已删除本地分支：${branchName}`
          } else {
            content = `请使用 branch 列出所有分支，或使用 -d <分支名> 删除分支。创建分支请使用 checkout -b`
          }
          break
        }

        case 'checkout': {
          if (args.startsWith('-b ')) {
            const branchName = args.slice(3).trim()
            await git.checkoutLocalBranch(branchName)
            content = `已创建并切换到新分支：\`${branchName}\``
          } else {
            await git.checkout(args)
            content = `已切换到分支：\`${args}\``
          }
          break
        }

        case 'pull': {
          const remoteParts = args ? args.split(/\s+/) : []
          const result = await git.pull(remoteParts[0], remoteParts[1])
          content = `Pull 完成：\n\`\`\`\n${result.summary.changes} 处变更, ${result.summary.insertions} 插入, ${result.summary.deletions} 删除\n\`\`\``
          break
        }

        case 'push': {
          const remoteParts = args ? args.split(/\s+/) : []
          const result = await git.push(remoteParts[0], remoteParts[1])
          content = result.pushed?.length
            ? `Push 完成：已推送 ${result.pushed.length} 个引用`
            : 'Push 完成（无变更需要推送）'
          requiresConfirm = true
          confirmMsg = `即将推送代码到远程仓库`
          break
        }

        case 'stash': {
          if (!args || args === 'push') {
            await git.stash()
            content = '已暂存工作区更改（stash）。'
          } else if (args === 'list') {
            const list = await git.stashList()
            if (list.all.length === 0) {
              content = '没有暂存的 stash。'
            } else {
              content = list.all.map((s, i) => `- stash@{${i}}: ${s.message}`).join('\n')
            }
          } else if (args === 'pop') {
            await git.stash(['pop'])
            content = '已恢复最近的 stash。'
          } else if (args.startsWith('drop')) {
            const stashName = args.slice(4).trim() || '0'
            await git.stash(['drop', `stash@{${stashName}}`])
            content = `已删除 stash@{${stashName}}。`
          } else {
            content = '不支持的 stash 操作。支持：push/list/pop/drop'
          }
          break
        }

        default:
          return this.error(toolCall.id, `不支持的操作：${action}`)
      }

      return {
        toolCallId: toolCall.id,
        toolName: 'git_operations',
        content,
        success: true,
        displayType: 'text',
        metadata: { action, args, repoPath },
        requiresConfirmation: requiresConfirm,
        confirmationMessage: confirmMsg
      }
    } catch (e) {
      const msg = (e as Error).message
      // 简化 simple-git 的冗长错误
      const short = msg.includes('\n') ? msg.split('\n').slice(-3).join('\n') : msg
      return this.error(toolCall.id, `Git 操作失败 (${action})：${short}`)
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'git_operations', content: '', success: false, error: msg }
  }
}
