import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

interface TranscriptionResult {
  text: string
  error?: string
}

// ─── 模型缓存目录 ──────────────────────────────────────
// 生产环境：模型随安装包打包在 resources/models/（extraResources），开箱即用
// 开发环境：使用项目 resources/whisper-tiny/ 预下载的模型（npm run download-whisper）
const MODEL_CACHE_DIR = app.isPackaged
  ? join(process.resourcesPath, 'models')
  : join(process.cwd(), 'resources', 'whisper-tiny')
if (!existsSync(MODEL_CACHE_DIR)) mkdirSync(MODEL_CACHE_DIR, { recursive: true })

// ─── 懒加载 pipeline ───────────────────────────────────
type PipelineFn = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string }>
let transcriber: PipelineFn | null = null
let loadingPromise: Promise<PipelineFn> | null = null

/**
 * 获取或初始化 Whisper 语音识别 pipeline。
 *
 * 生产环境：模型已随安装包打包，直接从本地加载，零联网。
 * 开发环境：首次调用从 hf-mirror.com 下载并缓存，后续从本地加载。
 */
async function getTranscriber(): Promise<PipelineFn> {
  if (transcriber) return transcriber
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers')

    // 配置模型缓存路径
    env.cacheDir = MODEL_CACHE_DIR

    // 生产环境模型已随包打包，无需联网下载；
    // 开发环境若预下载模型缺失则从国内镜像站补下载
    env.remoteHost = 'https://hf-mirror.com'

    console.log('[stt-local] 正在加载 Whisper 模型 (Xenova/whisper-tiny q8)...')
    const pipe = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
      device: 'cpu',
      dtype: 'q8', // 量化模型，进一步减少体积和加速推理
    })

    transcriber = pipe as unknown as PipelineFn
    console.log('[stt-local] ✅ Whisper 模型加载完成')
    return transcriber
  })()

  return loadingPromise
}

/**
 * 本地语音转写 — 基于 Whisper 模型的纯离线推理。
 *
 * @param pcm 16kHz 单声道 PCM 音频数据（Float32Array）
 * @param sampleRate 采样率（应为 16000）
 */
export async function transcribeLocal(
  pcm: Float32Array,
  sampleRate: number
): Promise<TranscriptionResult> {
  if (sampleRate !== 16000) {
    return { text: '', error: '采样率必须为 16000Hz，当前 ' + sampleRate + 'Hz' }
  }

  if (pcm.length < 1600) {
    // 少于 0.1 秒的音频，跳过
    return { text: '' }
  }

  try {
    // 模型加载加超时，防止网络问题导致永久挂起
    const recognizer = await Promise.race([
      getTranscriber(),
      new Promise<PipelineFn>((_, reject) =>
        setTimeout(() => reject(new Error('模型加载超时(60s)，请预运行 npm run download-whisper')), 60000)
      ),
    ])
    const result = await recognizer(pcm, {
      language: 'zh',
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
    })
    return { text: (result.text || '').trim() }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { text: '', error: '本地 STT 失败: ' + msg }
  }
}
