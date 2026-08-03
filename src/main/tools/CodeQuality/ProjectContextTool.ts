import { readFile, readdir, stat } from 'fs/promises'
import { resolve, relative, join, extname } from 'path'
import type { Tool } from '@main/tools/Tool'
import type { ToolDefinition, ToolCall, ToolResult, StreamChunk } from '@shared/types'

interface ProjectFile {
  path: string
  type: 'file' | 'directory'
  size: number
}

/**
 * ProjectContextTool — 项目上下文扫描
 * 快速了解项目结构和关键文件内容
 */
export class ProjectContextTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'project_context',
    description:
      '扫描项目目录结构并提取关键文件摘要。帮助快速了解项目架构、技术栈和代码组织方式。用于新项目接手、代码审查前了解全局等场景。返回目录树结构和关键配置文件内容。',
    parameters: {
      type: 'object',
      properties: {
        dirPath: {
          type: 'string',
          description: '项目根目录路径，默认为当前工作目录',
          default: '.'
        },
        maxDepth: {
          type: 'number',
          description: '扫描最大深度，默认 3',
          default: 3
        }
      },
      required: []
    }
  }

  // 关键配置文件（会被读取并显示摘要）— 覆盖多语言多框架
  private keyFiles = [
    // Node.js / JS / TS
    'package.json', 'tsconfig.json', 'tsconfig.node.json', 'tsconfig.web.json',
    'electron.vite.config.ts', 'electron.vite.config.mjs',
    'vite.config.ts', 'vite.config.js', 'webpack.config.js', 'webpack.config.ts',
    'tailwind.config.js', 'tailwind.config.ts', 'postcss.config.js',
    'next.config.js', 'next.config.mjs',
    'nuxt.config.ts', 'nuxt.config.js',
    '.eslintrc.js', '.eslintrc.json', '.eslintrc.cjs',
    'prettier.config.js', '.prettierrc',
    // Python
    'requirements.txt', 'pyproject.toml', 'setup.py', 'setup.cfg', 'Pipfile',
    'poetry.lock', 'tox.ini',
    // Go
    'go.mod', 'go.sum',
    // Rust
    'Cargo.toml', 'Cargo.lock',
    // Java
    'pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle',
    // C/C++
    'CMakeLists.txt', 'Makefile',
    // Ruby
    'Gemfile', 'Rakefile',
    // PHP
    'composer.json',
    // 通用
    'AGENTS.md', '.gitignore', '.env.example', 'Dockerfile', 'docker-compose.yml'
  ]

  // 排除目录
  private excludeDirs = new Set([
    'node_modules', '.git', '.svn', 'dist', 'out', 'build', 'release',
    '.next', '.nuxt', 'coverage', '__pycache__', '.cache', '.idea', '.vscode',
    '.reasonix', '.trae'
  ])

  async execute(
    toolCall: ToolCall,
    onChunk?: (chunk: StreamChunk) => void,
    signal?: AbortSignal
  ): Promise<ToolResult> {
    const dirPath = (toolCall.arguments.dirPath as string) || '.'
    const maxDepth = Math.min((toolCall.arguments.maxDepth as number) || 3, 5)

    const normalized = resolve(dirPath)

    onChunk?.({ toolStatus: 'calling', toolName: 'project_context' })

    try {
      // 收集目录树
      const tree = await this.buildTree(normalized, maxDepth, 0, signal)

      // 读取关键文件
      const keyInsights: string[] = []
      for (const fileName of this.keyFiles) {
        if (signal?.aborted) break
        const filePath = join(normalized, fileName)
        try {
          const content = await readFile(filePath, 'utf-8')
          const summary = this.summarizeFile(fileName, content)
          if (summary) keyInsights.push(summary)
        } catch {
          // 文件不存在
        }
      }

      const lines = [
        `## 🗂️ 项目上下文：\`${normalized}\``,
        '',
        '### 📁 目录结构',
        '```',
        tree,
        '```',
      ]

      if (keyInsights.length > 0) {
        lines.push('', '### 📋 关键文件摘要', ...keyInsights)
      }

      return {
        toolCallId: toolCall.id,
        toolName: 'project_context',
        content: lines.join('\n'),
        success: true,
        displayType: 'text',
        metadata: { dirPath: normalized, maxDepth }
      }
    } catch (e) {
      return this.error(toolCall.id, `扫描失败：${(e as Error).message}`)
    }
  }

  private async buildTree(
    dir: string,
    maxDepth: number,
    currentDepth: number,
    signal?: AbortSignal
  ): Promise<string> {
    if (signal?.aborted || currentDepth >= maxDepth) return ''

    const lines: string[] = []
    const indent = '  '.repeat(currentDepth)

    try {
      const names = await readdir(dir)
      const entries: ProjectFile[] = []

      for (const name of names) {
        if (this.excludeDirs.has(name)) continue
        if (name.startsWith('.') && name !== '.gitignore' && name !== '.env.example') continue

        const fullPath = join(dir, name)
        try {
          const s = await stat(fullPath)
          entries.push({
            path: name,
            type: s.isDirectory() ? 'directory' : 'file',
            size: s.size
          })
        } catch {
          // skip
        }
      }

      // 排序：目录在前，然后按名称
      entries.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.path.localeCompare(b.path)
      })

      for (const entry of entries) {
        if (entry.type === 'directory') {
          lines.push(`${indent}📁 ${entry.path}/`)
          if (currentDepth + 1 < maxDepth) {
            const subTree = await this.buildTree(join(dir, entry.path), maxDepth, currentDepth + 1, signal)
            if (subTree) lines.push(subTree)
          }
        } else {
          const size = entry.size > 1024 ? ` (${(entry.size / 1024).toFixed(1)}KB)` : ''
          lines.push(`${indent}📄 ${entry.path}${size}`)
        }
      }
    } catch {
      // 无权限
    }

    return lines.join('\n')
  }

  private summarizeFile(fileName: string, content: string): string {
    switch (fileName) {
      case 'package.json':
        try {
          const pkg = JSON.parse(content)
          const tech = Object.keys(pkg.dependencies || {}).filter((d) =>
            ['react', 'electron', 'express', 'next', 'vue', 'tailwindcss', 'zustand'].some((k) => d.includes(k))
          )
          return `- **package.json**: ${pkg.name || 'unnamed'} v${pkg.version || '0.0.0'} — 依赖数: ${Object.keys(pkg.dependencies || {}).length} (核心: ${tech.join(', ')})`
        } catch {
          return ''
        }

      case 'tsconfig.json':
        return `- **tsconfig.json**: TypeScript 配置已就绪`

      case 'requirements.txt':
        const pipDeps = content.split('\n').filter((l) => l.trim() && !l.startsWith('#')).length
        return `- **requirements.txt**: ${pipDeps} 个 Python 依赖`

      case 'pyproject.toml':
        const pyProjectMatch = content.match(/name\s*=\s*["']([^"']+)["']/)
        return `- **pyproject.toml**: ${pyProjectMatch ? pyProjectMatch[1] : 'Python 项目'} 配置`

      case 'go.mod':
        const goMatch = content.match(/^module\s+(\S+)/m)
        const goDeps = content.match(/^\s*require\s+\(/m) ? '含依赖' : ''
        return `- **go.mod**: ${goMatch ? goMatch[1] : 'Go 模块'} ${goDeps}`

      case 'Cargo.toml':
        const cargoMatch = content.match(/^name\s*=\s*["']([^"']+)["']/m)
        return `- **Cargo.toml**: ${cargoMatch ? cargoMatch[1] : 'Rust 项目'} `

      case 'pom.xml':
        const pomMatch = content.match(/<artifactId>([^<]+)<\/artifactId>/)
        return `- **pom.xml**: Maven 项目 ${pomMatch ? pomMatch[1] : ''}`

      case 'build.gradle':
      case 'build.gradle.kts':
        return `- **${fileName}**: Gradle 构建配置`

      case 'Gemfile':
        const gemMatch = content.match(/gem\s+["']([^"']+)["']/)
        return `- **Gemfile**: Ruby 项目 ${gemMatch ? '(含 ' + gemMatch[1] + ')' : ''}`

      case 'composer.json':
        try {
          const composer = JSON.parse(content)
          return `- **composer.json**: ${composer.name || 'PHP 项目'} v${composer.version || ''}`
        } catch {
          return `- **composer.json**: PHP 项目配置`
        }

      case 'Dockerfile':
        const fromLine = content.match(/^FROM\s+(.+)/m)
        return `- **Dockerfile**: 基础镜像 ${fromLine ? fromLine[1].trim() : '未知'}`

      case 'docker-compose.yml':
        const services = content.match(/^\s{2}(\w+):/gm)
        const serviceCount = services ? services.length : 0
        return `- **docker-compose.yml**: ${serviceCount} 个服务`

      case 'AGENTS.md':
        const firstLine = content.split('\n')[0].replace('#', '').trim()
        return `- **AGENTS.md**: ${firstLine}`

      case '.gitignore':
        const lines = content.split('\n').filter((l) => l && !l.startsWith('#')).length
        return `- **.gitignore**: ${lines} 条忽略规则`

      case 'Makefile':
        const targets = content.match(/^(\w+):/gm)
        return `- **Makefile**: ${targets ? targets.length : 0} 个构建目标`

      case 'CMakeLists.txt':
        const cmakeProject = content.match(/project\s*\(\s*([^\s\)]+)/i)
        return `- **CMakeLists.txt**: ${cmakeProject ? cmakeProject[1] : 'C++ 项目'}`

      default:
        return `- **${fileName}**: 已配置`
    }
  }

  private error(id: string, msg: string): ToolResult {
    return { toolCallId: id, toolName: 'project_context', content: '', success: false, error: msg }
  }
}
