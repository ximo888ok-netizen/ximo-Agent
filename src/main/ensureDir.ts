/**
 * 主进程共享文件系统工具
 */
import { mkdir } from 'fs/promises'
import { DATA_DIR } from './paths'

/** 确保应用数据根目录存在 */
export async function ensureDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })
}

/** 确保指定目录存在 */
export async function ensureDirPath(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}
