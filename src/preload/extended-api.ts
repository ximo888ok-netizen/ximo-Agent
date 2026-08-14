/**
 * Preload 扩展 API — 知识库、主题包、背景图、更新检查、语音等
 * 从 index.ts 提取，通过展开合并到主 API 对象
 */

import { ipcRenderer } from 'electron'
import type { Mode } from '@shared/types'

/** 扩展 API 部分 — 在 index.ts 中展开合并 */
export const extendedApi = {
  // 模式记忆 — 每个模式独立的持久化记忆（Markdown 文本）
  memory: {
    load: (mode: Mode): Promise<string> => ipcRenderer.invoke('memory:load', mode),
    save: (mode: Mode, content: string): Promise<boolean> => ipcRenderer.invoke('memory:save', mode, content)
  },
  // 知识库 — Orama BM25 全文搜索，每个模式独立
  knowledge: {
    list: (mode: Mode, page: number, pageSize: number): Promise<{
      items: { id: string; title: string; content: string; tags: string[]; source: string; createdAt: number; updatedAt: number }[]
      total: number; page: number; pageSize: number; totalPages: number
    }> => ipcRenderer.invoke('knowledge:list', mode, page, pageSize),
    search: (mode: Mode, query: string, page: number, pageSize: number): Promise<{
      results: { id: string; title: string; content: string; tags: string[]; source: string; score: number; createdAt: number; updatedAt: number }[]
      total: number; page: number; pageSize: number; totalPages: number
    }> => ipcRenderer.invoke('knowledge:search', mode, query, page, pageSize),
    add: (mode: Mode, data: { title: string; content: string; tags?: string[]; source?: string }): Promise<{
      id: string; title: string; content: string; tags: string[]; source: string; createdAt: number; updatedAt: number
    }> => ipcRenderer.invoke('knowledge:add', mode, data),
    update: (mode: Mode, id: string, updates: { title?: string; content?: string; tags?: string[]; source?: string }): Promise<{
      id: string; title: string; content: string; tags: string[]; source: string; createdAt: number; updatedAt: number
    } | null> => ipcRenderer.invoke('knowledge:update', mode, id, updates),
    delete: (mode: Mode, id: string): Promise<boolean> => ipcRenderer.invoke('knowledge:delete', mode, id)
  },
  // 主题包 — 自定义 UI 主题导入与管理
  themePack: {
    list: (): Promise<{ id: string; name: string; description?: string; author?: string; light?: Record<string, string>; dark?: Record<string, string> }[]> =>
      ipcRenderer.invoke('theme-pack:list'),
    import: (jsonStr: string): Promise<{ id: string; name: string; description?: string; author?: string; light?: Record<string, string>; dark?: Record<string, string> }> =>
      ipcRenderer.invoke('theme-pack:import', jsonStr),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('theme-pack:delete', id)
  },
  // 背景图 — 导入/删除/列表/选择
  background: {
    select: (): Promise<{ path: string; type: 'static' | 'dynamic'; fileName: string } | null> =>
      ipcRenderer.invoke('background:select'),
    import: (srcPath: string): Promise<{ path: string; type: 'static' | 'dynamic'; fileName: string }> =>
      ipcRenderer.invoke('background:import', srcPath),
    delete: (filePath: string): Promise<boolean> =>
      ipcRenderer.invoke('background:delete', filePath),
    list: (): Promise<{ path: string; fileName: string; type: 'static' | 'dynamic'; size: number }[]> =>
      ipcRenderer.invoke('background:list'),
  },
  // 检查更新 — 查询 GitHub Releases 最新版本
  update: {
    check: (): Promise<{
      success: boolean
      currentVersion?: string
      latestVersion?: string
      hasUpdate?: boolean
      downloadUrl?: string
      giteeDownloadUrl?: string
      fileName?: string
      fileSize?: number
      releaseUrl?: string
      error?: string
    }> => ipcRenderer.invoke('update:check'),
    download: (downloadUrl: string, fallbackUrl?: string): Promise<{ success: boolean; filePath?: string; error?: string }> =>
      ipcRenderer.invoke('update:download', downloadUrl, fallbackUrl),
    install: (filePath: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('update:install', filePath),
    onProgress: (callback: (data: { downloaded: number; total: number }) => void): (() => void) => {
      const handler = (_event: unknown, data: { downloaded: number; total: number }): void => callback(data)
      ipcRenderer.on('update:downloadProgress', handler as never)
      return () => ipcRenderer.removeListener('update:downloadProgress', handler as never)
    },
    onDownloadComplete: (callback: (data: { filePath: string }) => void): (() => void) => {
      const handler = (_event: unknown, data: { filePath: string }): void => callback(data)
      ipcRenderer.on('update:downloadComplete', handler as never)
      return () => ipcRenderer.removeListener('update:downloadComplete', handler as never)
    },
    onDownloadSwitch: (callback: (data: { message: string }) => void): (() => void) => {
      const handler = (_event: unknown, data: { message: string }): void => callback(data)
      ipcRenderer.on('update:downloadSwitch', handler as never)
      return () => ipcRenderer.removeListener('update:downloadSwitch', handler as never)
    }
  },
  // 语音转写 — 纯本地 Whisper 模型推理，发送 PCM 数据到主进程
  voice: {
    transcribe: (pcm: Float32Array, sampleRate: number): Promise<{ text: string; error?: string }> =>
      ipcRenderer.invoke('voice:transcribe', pcm, sampleRate),
    // Edge TTS — 合成语音，返回 MP3 ArrayBuffer
    tts: {
      synthesize: (text: string, voiceName: string): Promise<{ buffer: ArrayBuffer | null; error: string | null }> =>
        ipcRenderer.invoke('voice:tts:synthesize', text, voiceName),
      voices: (): Promise<{ shortName: string; name: string; gender: string; locale: string }[]> =>
        ipcRenderer.invoke('voice:tts:voices'),
    }
  }
}
