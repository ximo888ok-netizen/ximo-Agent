/**
 * Skill 工具目录共享常量
 *
 * 原先 RrwebReplayer.ts 和 RrwebRecorder.ts 各自构建 RRWEB_BUNDLE_PATH，
 * 现统一导出。
 */
import { join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/** rrweb UMD bundle 的文件路径 */
export const RRWEB_BUNDLE_PATH = join(__dirname, '../../../node_modules/rrweb/dist/rrweb.umd.cjs')
