import { existsSync } from 'fs'
import { readFile as readFileAsync } from 'fs/promises'
import { resolve, join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

const execAsync = promisify(exec)

interface PkgJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  scripts?: Record<string, string>
}

/**
 * DependencyCheckTool — 依赖管理工具
 * 检测项目依赖、安装缺失包、查看版本
 */
export class DependencyCheckTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'dependency_check',
    description:
      '检查项目依赖并安装缺失的包。支持 Node.js (npm/yarn/pnpm) 和 Python (pip) 项目。可以列出已安装依赖、检测缺失依赖、安装指定包。用于开发前环境准备、依赖安装等场景。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '操作类型：list（列出依赖）、check（检查缺失）、install（安装包）',
          enum: ['list', 'check', 'install'],
          default: 'check'
        },
        packages: {
          type: 'string',
          description: '要安装的包名（逗号分隔），仅 install 操作需要。如 "react,react-dom,typescript"'
        },
        packageManager: {
          type: 'string',
          description: '包管理器：npm、yarn、pnpm、pip。默认自动检测',
          enum: ['npm', 'yarn', 'pnpm', 'pip']
        },
        dev: {
          type: 'boolean',
          description: '是否安装为开发依赖（--save-dev），默认 false。仅 npm/yarn/pnpm 有效',
          default: false
        },
        projectPath: {
          type: 'string',
          description: '项目根目录路径，默认为当前目录',
          default: '.'
        }
      },
      required: ['action']
    }
  }

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    signal?: AbortSignal
  ): Promise<ToolResult> {
    const action = toolCall.arguments.action as string
    const packages = (toolCall.arguments.packages as string) || ''
    const projectPath = resolve((toolCall.arguments.projectPath as string) || '.')
    const dev = (toolCall.arguments.dev as boolean) || false

    onChunk?.({ toolStatus: 'calling', toolName: 'dependency_check' })

    try {
      if (action === 'list') {
        return await this.listDependencies(projectPath, toolCall.id)
      }
      if (action === 'check') {
        return await this.checkDependencies(projectPath, toolCall.id, signal)
      }
      if (action === 'install') {
        return await this.installPackages(projectPath, packages, dev, toolCall, signal)
      }
      return this.error(toolCall.id, `不支持的操作：${action}`)
    } catch (e) {
      return this.error(toolCall.id, `依赖操作失败：${(e as Error).message}`)
    }
  }

  /** 列出项目依赖 */
  private async listDependencies(projectPath: string, toolCallId: string): Promise<ToolResult> {
    const pkgPath = join(projectPath, 'package.json')
    if (!existsSync(pkgPath)) {
      return this.error(toolCallId, `未找到 package.json：${pkgPath}`)
    }

    const pkg: PkgJson = JSON.parse(await readFileAsync(pkgPath, 'utf-8'))
    const deps = pkg.dependencies || {}
    const devDeps = pkg.devDependencies || {}

    const lines = ['## 📦 项目依赖', `项目：${projectPath}`, '']

    if (Object.keys(deps).length > 0) {
      lines.push(`**生产依赖 (${Object.keys(deps).length})：**`)
      for (const [name, version] of Object.entries(deps)) {
        lines.push(`  - \`${name}\`: ${version}`)
      }
      lines.push('')
    }

    if (Object.keys(devDeps).length > 0) {
      lines.push(`**开发依赖 (${Object.keys(devDeps).length})：**`)
      for (const [name, version] of Object.entries(devDeps)) {
        lines.push(`  - \`${name}\`: ${version}`)
      }
    }

    if (pkg.scripts && Object.keys(pkg.scripts).length > 0) {
      lines.push('', `**可用脚本 (${Object.keys(pkg.scripts).length})：**`)
      for (const [name, cmd] of Object.entries(pkg.scripts)) {
        lines.push(`  - \`${name}\`: \`${cmd}\``)
      }
    }

    return {
      toolCallId,
      toolName: 'dependency_check',
      content: lines.join('\n'),
      success: true,
      displayType: 'text',
      metadata: { depsCount: Object.keys(deps).length, devDepsCount: Object.keys(devDeps).length }
    }
  }

  /** 检查依赖是否已安装 */
  private async checkDependencies(projectPath: string, toolCallId: string, signal?: AbortSignal): Promise<ToolResult> {
    const pkgPath = join(projectPath, 'package.json')
    if (!existsSync(pkgPath)) {
      return this.error(toolCallId, `未找到 package.json：${pkgPath}`)
    }

    const pkg: PkgJson = JSON.parse(await readFileAsync(pkgPath, 'utf-8'))
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
    const missing: string[] = []
    const installed: string[] = []

    for (const name of Object.keys(allDeps)) {
      const depPath = join(projectPath, 'node_modules', name)
      if (existsSync(depPath)) {
        installed.push(name)
      } else {
        missing.push(name)
      }
    }

    const lines = ['## 🔍 依赖检查', `项目：${projectPath}`, '']

    if (missing.length === 0) {
      lines.push(`✅ 所有 ${installed.length} 个依赖均已安装。`)
    } else {
      lines.push(`⚠️ 发现 ${missing.length} 个未安装的依赖：`)
      missing.forEach((d) => lines.push(`  - \`${d}\`: ${allDeps[d]}`))
      lines.push('', '建议运行 `npm install` 或使用 dependency_check 的 install 操作安装。')
    }

    return {
      toolCallId,
      toolName: 'dependency_check',
      content: lines.join('\n'),
      success: true,
      displayType: 'text',
      metadata: { total: Object.keys(allDeps).length, installed: installed.length, missing: missing.length, missingList: missing }
    }
  }

  /** 安装包 */
  private async installPackages(
    projectPath: string,
    packages: string,
    dev: boolean,
    toolCall: ToolCall,
    signal?: AbortSignal
  ): Promise<ToolResult> {
    if (!packages) {
      return this.error(toolCall.id, 'install 操作需要提供 packages 参数')
    }

    // 检测包管理器
    const pm = await this.detectPackageManager(projectPath)
    const pkgList = packages.split(',').map((p) => p.trim()).filter(Boolean)

    let cmd: string
    if (pm === 'yarn') {
      cmd = `yarn add ${dev ? '--dev' : ''} ${pkgList.join(' ')}`
    } else if (pm === 'pnpm') {
      cmd = `pnpm add ${dev ? '-D' : ''} ${pkgList.join(' ')}`
    } else {
      cmd = `npm install ${dev ? '--save-dev' : '--save'} ${pkgList.join(' ')}`
    }

    try {
      const { stdout, stderr } = await execAsync(cmd, {
        cwd: projectPath,
        timeout: 300000,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
        signal
      } as never)

      const output = (stdout || '') + (stderr ? `\n[stderr]\n${stderr}` : '')
      const truncated = output.length > 10000 ? output.slice(0, 10000) + '\n...(输出被截断)' : output

      return {
        toolCallId: toolCall.id,
        toolName: 'dependency_check',
        content: `## 📦 依赖安装完成\n\n**包管理器**: ${pm}\n**命令**: \`${cmd}\`\n\n\`\`\`\n${truncated}\n\`\`\``,
        success: true,
        displayType: 'text',
        metadata: { packageManager: pm, packages: pkgList, dev },
        requiresConfirmation: true,
        confirmationMessage: `即将安装依赖：${pkgList.join(', ')}`
      }
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message?: string }
      const output = String(err.stdout || err.stderr || err.message || '')
      return this.error(toolCall.id, `安装失败：${output.slice(0, 5000)}`)
    }
  }

  /** 检测包管理器 */
  private async detectPackageManager(projectPath: string): Promise<string> {
    if (existsSync(join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm'
    if (existsSync(join(projectPath, 'yarn.lock'))) return 'yarn'
    return 'npm'
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'dependency_check', content: '', success: false, error: msg }
  }
}
