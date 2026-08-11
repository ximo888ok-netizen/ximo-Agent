/**
 * 预下载 Whisper-tiny 模型 — 将模型文件缓存到 resources/whisper-tiny/
 *
 * 运行：node scripts/download-whisper.mjs
 *
 * 下载完成后模型文件在 resources/whisper-tiny/Xenova/whisper-tiny/ 下，
 * electron-builder 通过 extraResources 打包到安装包的 resources/models/ 目录。
 */
import { join } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, mkdirSync } from 'fs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const targetDir = join(__dirname, '..', 'resources', 'whisper-tiny')

if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })

console.log('[download-whisper] 目标目录:', targetDir)

const { pipeline, env } = await import('@huggingface/transformers')

env.cacheDir = targetDir
env.remoteHost = 'https://hf-mirror.com'

console.log('[download-whisper] 开始下载 Xenova/whisper-tiny (q8 量化)...')

const pipe = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
  device: 'cpu',
  dtype: 'q8',
})

// 快速验证：转写一小段静音
const silentPcm = new Float32Array(16000) // 1 秒静音
const result = await pipe(silentPcm, { language: 'zh', task: 'transcribe' })
console.log('[download-whisper] 验证转写结果:', JSON.stringify(result.text))

console.log('[download-whisper] ✅ 模型下载完成，文件位于:', targetDir)
