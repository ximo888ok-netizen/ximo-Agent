import { existsSync } from 'fs'
import { join, dirname, normalize } from 'path'
import { app } from 'electron'

/**
 * OfficeCliManager — OfficeCLI 二进制定位与版本管理
 *
 * 查找顺序（自上而下，找到即用）：
 * 1. 环境变量 OFFICECLI_PATH 显式指定
 * 2. 开发模式: 项目根 resources/officecli/officecli.exe
 * 3. 打包模式: process.resourcesPath/officecli/officecli.exe
 * 4. PATH 中的 officecli
 *
 * 二进制未安装时返回可操作的引导信息（下载 URL + npm 全局安装命令），
 * 不阻塞对话流程。
 */

export const OFFICECLI_APP_VERSION = '1.0.143'
export const OFFICECLI_DOWNLOAD_URL =
  'https://github.com/iOfficeAI/OfficeCLI/releases/latest'
export const OFFICECLI_SKILL_URL = 'https://officecli.ai/SKILL.md'

/** Windows 可执行文件名（跨平台时可按平台扩展） */
const EXE_NAME = process.platform === 'win32' ? 'officecli.exe' : 'officecli'

export interface OfficeCliInfo {
  /** 二进制的绝对路径 */
  binPath: string | null
  /** 是否已安装 */
  installed: boolean
  /** 检测到的版本（未检测时为 null） */
  version: string | null
  /** 未安装时的引导信息 */
  hint: string | null
}

/** 候选路径生成 — 独立纯函数便于测试 */
export function candidatePaths(): string[] {
  const paths: string[] = []

  // 1. 环境变量显式指定
  if (process.env.OFFICECLI_PATH) {
    paths.push(join(process.env.OFFICECLI_PATH, EXE_NAME))
  }

  // 2. 开发模式 resources 目录
  try {
    // electron-vite 开发模式下 app.getAppPath() 为项目根
    const devRoot = process.env.NODE_ENV === 'development' || !app.isPackaged
      ? app.getAppPath()
      : null
    if (devRoot) {
      paths.push(join(devRoot, 'resources', 'officecli', EXE_NAME))
      paths.push(join(devRoot, 'resources', 'officecli', 'officecli'))
    }
  } catch {
    // app 不可用时（测试环境）跳过
  }

  // 3. 打包模式 resources 目录
  try {
    if (app.isPackaged && process.resourcesPath) {
      paths.push(join(process.resourcesPath, 'officecli', EXE_NAME))
    }
  } catch {
    // 忽略
  }

  // 4. PATH 中的 officecli（不指定目录，直接返回命令名）
  paths.push(EXE_NAME)

  return paths
}

/**
 * 定位可用的 OfficeCLI 二进制。
 * 返回第一个真实存在的路径；都不存在时返回 null。
 */
export function locateOfficeCli(): string | null {
  for (const p of candidatePaths()) {
    try {
      // 相对路径（PATH 命令名）不需要 existsSync 检查 — spawn 自己会找
      if (!p.includes('/') && !p.includes('\\')) return p
      if (existsSync(p)) return p
    } catch {
      continue
    }
  }
  return null
}

/** 构建"未安装"引导信息（对 LLM 可操作） */
export function buildInstallHint(): string {
  return [
    '未检测到 OfficeCLI 二进制（officecli.exe）。',
    '要启用办公文档能力，请任选一种方式安装：',
    `  1. npm 全局安装: \`npm i -g @officecli/officecli\`（自动加入 PATH）`,
    `  2. 下载二进制: ${OFFICECLI_DOWNLOAD_URL} 后放入项目的 resources/officecli/ 目录`,
    `  3. 设置环境变量 OFFICECLI_PATH 指向可执行文件所在目录`,
    '',
    '安装完成后重新发起本操作即可。'
  ].join('\n')
}

/**
 * 解析二进制信息。
 * @param verifyVersion 是否尝试解析 --version 输出（异步，由 Runner 调用）
 */
export async function resolveOfficeCliInfo(): Promise<OfficeCliInfo> {
  const binPath = locateOfficeCli()
  if (!binPath) {
    return {
      binPath: null,
      installed: false,
      version: null,
      hint: buildInstallHint()
    }
  }
  return {
    binPath,
    installed: true,
    version: null, // 版本由 Runner.checkVersion() 填充
    hint: null
  }
}

/**
 * 校验文档文件扩展名是否为 OfficeCLI 支持的类型。
 * @returns { valid, error? } 非法扩展名返回错误信息
 */
export function assertSupportedExt(filePath: string): { valid: boolean; error?: string } {
  const normalized = normalize(filePath).toLowerCase()
  const ext = normalized.endsWith('.docx') || normalized.endsWith('.xlsx') || normalized.endsWith('.pptx')
  if (!ext) {
    return {
      valid: false,
      error: `不支持的文件类型: "${filePath}"。OfficeCLI 仅支持 .docx / .xlsx / .pptx。`
    }
  }
  return { valid: true }
}

/** 获取默认输出目录（未指定输出时用文档所在目录） */
export function defaultOutputDir(filePath: string): string {
  return dirname(normalize(filePath))
}
