import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

export interface TtsVoice {
  shortName: string
  name: string
  gender: string
  locale: string
}

/** 缓存语音列表（只在首次调用时拉取） */
let cachedVoices: TtsVoice[] | null = null

/** 获取可用语音列表 */
export async function listVoices(): Promise<TtsVoice[]> {
  if (cachedVoices) return cachedVoices
  try {
    const tts = new MsEdgeTTS({ enableLogger: false })
    const voices = await tts.getVoices()
    tts.close()
    cachedVoices = voices.map((v) => ({
      shortName: v.ShortName,
      name: v.FriendlyName,
      gender: v.Gender,
      locale: v.Locale,
    }))
    return cachedVoices
  } catch {
    return []
  }
}

/**
 * 将文本合成为音频 — 每次创建新 MsEdgeTTS 实例，避免 WebSocket 复用问题。
 * 返回 MP3 ArrayBuffer。
 */
export async function synthesize(
  text: string,
  voiceName: string,
): Promise<ArrayBuffer> {
  const tts = new MsEdgeTTS({ enableLogger: false })
  try {
    await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)

    const { audioStream } = tts.toStream(text)

    const chunks: Buffer[] = []
    for await (const chunk of audioStream) {
      chunks.push(Buffer.from(chunk))
    }

    const buf = Buffer.concat(chunks)
    // 返回精确大小的 ArrayBuffer 副本
    const result = new ArrayBuffer(buf.length)
    new Uint8Array(result).set(buf)
    return result
  } finally {
    tts.close()
  }
}
