import { exec } from 'child_process'
import { promisify } from 'util'
import type { ToolResult } from '@shared/types'
import { isOcrInstalled } from './ocr-helpers'

const execAsync = promisify(exec)

/** 检查 OCR 安装与配置状态 — 版本检测 + LLM 配置检查 */
export async function checkOcrStatus(
  toolCallId: string,
  _repoPath: string,
  signal?: AbortSignal
): Promise<ToolResult> {
  const lines: string[] = ['## 🔍 OCR (Open Code Review) 状态检查\n']

  const installed = await isOcrInstalled(execAsync, signal)
  if (!installed) {
    lines.push('### ❌ 未安装')
    lines.push('')
    lines.push('**安装方式（推荐 NPM）：**')
    lines.push('```bash')
    lines.push('npm install -g @alibaba-group/open-code-review')
    lines.push('```')
    lines.push('')
    lines.push('安装后使用 `code_review` (action=config) 配置 LLM：')
    lines.push('- `llm.url` — LLM API 地址')
    lines.push('- `llm.auth_token` — API Key')
    lines.push('- `llm.model` — 模型名称（如 claude-opus）')
    lines.push('')
    lines.push('> 配置文件位置：`~/.opencodereview/config.json`')

    return {
      toolCallId, toolName: 'code_review',
      content: lines.join('\n'), success: true,
      displayType: 'text',
      metadata: { installed: false }
    }
  }

  // 获取版本
  let version = 'unknown'
  try {
    const { stdout } = await execAsync('ocr --version', {
      timeout: 10000, windowsHide: true, signal
    } as never)
    version = String(stdout).trim()
  } catch {
    try {
      const { stdout } = await execAsync('ocr version', {
        timeout: 10000, windowsHide: true, signal
      } as never)
      version = String(stdout).trim()
    } catch { /* 版本获取失败不阻塞 */ }
  }

  lines.push('### ✅ 已安装')
  if (version && version !== 'unknown') {
    lines.push(`**版本**：\`${version.split('\n')[0]}\``)
  }
  lines.push('')

  // 检查 LLM 配置
  let llmConfigured = false
  let configDetail = ''
  try {
    const { stdout } = await execAsync('ocr config list 2>&1', {
      timeout: 10000, windowsHide: true, signal
    } as never)
    const configText = String(stdout).trim()
    configDetail = configText
    llmConfigured = configText.includes('llm.url') && configText.includes('llm.auth_token') &&
      !configText.includes('""') && !configText.includes('null')
  } catch {
    try {
      const { homedir } = await import('os')
      const { join } = await import('path')
      const { readFile } = await import('fs/promises')
      const configPath = join(homedir(), '.opencodereview', 'config.json')
      const content = await readFile(configPath, 'utf-8')
      const config = JSON.parse(content)
      llmConfigured = !!(config?.llm?.url && config?.llm?.auth_token)
      configDetail = `配置文件：${configPath}`
    } catch { /* 配置文件不存在 */ }
  }

  if (llmConfigured) {
    lines.push('### ✅ LLM 已配置')
  } else {
    lines.push('### ⚠️ LLM 未配置')
    lines.push('')
    lines.push('使用以下命令配置（或通过 `code_review` action=config）：')
    lines.push('```bash')
    lines.push('ocr config set llm.url https://api.anthropic.com/v1/messages')
    lines.push('ocr config set llm.auth_token your-api-key')
    lines.push('ocr config set llm.model claude-opus')
    lines.push('```')
  }

  if (configDetail) {
    lines.push('', '<details><summary>配置详情</summary>', '', '```', configDetail.slice(0, 3000), '```', '', '</details>')
  }

  return {
    toolCallId, toolName: 'code_review',
    content: lines.join('\n'), success: true,
    displayType: 'text',
    metadata: { installed: true, version, llmConfigured }
  }
}
