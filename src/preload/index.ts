import { contextBridge, ipcRenderer } from 'electron'
import type { ChatRequest, StreamChunk, AppSettings, Conversation, TestResult, FileTreeNode, Skill, RecordingSession, CapturedRequest, McpServerConfig, ImportedSkill } from '@shared/types'
import { extendedApi } from './extended-api'

// 通过 contextBridge 暴露安全的 API 给渲染进程
const api = {
  // 流式聊天：注册 chunk 回调，返回 Promise（结束时 resolve）
  chat: {
    stream: (
      request: ChatRequest,
      onChunk: (chunk: StreamChunk) => void
    ): Promise<void> => {
      let removed = false
      const handler = (_event: unknown, chunk: StreamChunk): void => {
        onChunk(chunk)
        // 收到 done 时立即移除监听器，避免 IPC 竞态导致 done 丢失
        // （Electron 中 invoke 响应和 send 消息走不同内部通道，finally 可能提前触发）
        if (chunk.done && !removed) {
          removed = true
          ipcRenderer.removeListener('chat:chunk', handler as never)
        }
      }
      ipcRenderer.on('chat:chunk', handler as never)
      return ipcRenderer
        .invoke('chat:start', request)
        .finally(() => {
          // 安全网：done 未到达或异常时清理
          if (!removed) {
            removed = true
            ipcRenderer.removeListener('chat:chunk', handler as never)
          }
        })
    },
    cancel: (): Promise<void> => ipcRenderer.invoke('chat:cancel'),
    test: (apiKey: string, baseUrl: string, model: string, providerId?: string): Promise<TestResult> =>
      ipcRenderer.invoke('chat:test', apiKey, baseUrl, model, providerId),
    enhancePrompt: (data: { text: string; mode: string; recentContext?: string; projectPath?: string }): Promise<{ success: boolean; enhancedText?: string; error?: string }> =>
      ipcRenderer.invoke('chat:enhance-prompt', data)
  },
  settings: {
    load: (): Promise<AppSettings> => ipcRenderer.invoke('settings:load'),
    save: (settings: AppSettings): Promise<boolean> =>
      ipcRenderer.invoke('settings:save', settings)
  },
  conversations: {
    load: (): Promise<Conversation[]> => ipcRenderer.invoke('conversations:load'),
    save: (conversations: Conversation[]): Promise<boolean> =>
      ipcRenderer.invoke('conversations:save', conversations)
  },
  skills: {
    load: (): Promise<Skill[]> => ipcRenderer.invoke('skills:load'),
    save: (skills: Skill[]): Promise<boolean> => ipcRenderer.invoke('skills:save', skills),
    recordingStatus: (): Promise<{ isRecording: boolean; session: RecordingSession | null; rrwebEventCount: number }> =>
      ipcRenderer.invoke('skills:recordingStatus'),
    startRecording: (url?: string): Promise<RecordingSession> =>
      ipcRenderer.invoke('skills:startRecording', url),
    stopRecording: (): Promise<RecordingSession | null> =>
      ipcRenderer.invoke('skills:stopRecording'),
    appendRrwebEvent: (event: Record<string, unknown>): void => {
      ipcRenderer.send('skill:append-rrweb-event', event)
    }
  },
  mcp: {
    load: (): Promise<McpServerConfig[]> => ipcRenderer.invoke('mcp:load'),
    save: (servers: McpServerConfig[]): Promise<boolean> => ipcRenderer.invoke('mcp:save', servers),
    parseConfig: (raw: string): Promise<{ servers: McpServerConfig[]; error?: string }> =>
      ipcRenderer.invoke('mcp:parseConfig', raw)
  },
  // 自定义服务商 — 自动获取模型列表（OpenAI 兼容 GET /models）
  providers: {
    listModels: (baseUrl: string, apiKey: string): Promise<{ success: boolean; models: string[]; error?: string }> =>
      ipcRenderer.invoke('providers:list-models', baseUrl, apiKey)
  },
  importedSkills: {
    load: (): Promise<ImportedSkill[]> => ipcRenderer.invoke('imported-skills:load'),
    save: (skills: ImportedSkill[]): Promise<boolean> => ipcRenderer.invoke('imported-skills:save', skills),
    parseMarkdown: (raw: string): Promise<{ name: string; description: string; triggers: string[]; body: string; error?: string }> =>
      ipcRenderer.invoke('imported-skills:parseMarkdown', raw)
  },
  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    maximize: (): Promise<void> => ipcRenderer.invoke('window:maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
    ready: (): Promise<void> => ipcRenderer.invoke('window:ready'),
    onMaximizeChange: (callback: (isMaximized: boolean) => void): (() => void) => {
      const handler = (_event: unknown, isMaximized: boolean): void => callback(isMaximized)
      ipcRenderer.on('window:maximizeChange', handler as never)
      return () => ipcRenderer.removeListener('window:maximizeChange', handler as never)
    }
  },
  dialog: {
    openFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFolder'),
    openFile: (filters?: { name: string; extensions: string[] }[]): Promise<string[]> =>
      ipcRenderer.invoke('dialog:openFile', filters)
  },
  clipboard: {
    saveImage: (): Promise<string | null> => ipcRenderer.invoke('clipboard:saveImage'),
    deleteImages: (paths: string[]): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('clipboard:deleteImages', paths)
  },
  confirm: {
    request: (message: string): Promise<boolean> => ipcRenderer.invoke('confirm:request', message),
    onRequest: (callback: (data: { toolName: string; message: string }) => void): (() => void) => {
      const handler = (_event: unknown, data: { toolName: string; message: string }): void => callback(data)
      ipcRenderer.on('confirm:request', handler as never)
      return () => ipcRenderer.removeListener('confirm:request', handler as never)
    },
    respond: (confirmed: boolean): void => {
      ipcRenderer.send('confirm:response', confirmed)
    }
  },
  userInput: {
    onRequest: (callback: (data: { type: 'ask' | 'review'; title: string; content: string }) => void): (() => void) => {
      const handler = (_event: unknown, data: { type: 'ask' | 'review'; title: string; content: string }): void => callback(data)
      ipcRenderer.on('user-input:request', handler as never)
      return () => ipcRenderer.removeListener('user-input:request', handler as never)
    },
    respond: (data: { confirmed: boolean; response?: string }): void => {
      ipcRenderer.send('user-input:response', data)
    }
  },
  terminal: {
    execute: (command: string, cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> =>
      ipcRenderer.invoke('terminal:execute', command, cwd)
  },
  fs: {
    listDir: (dirPath: string, maxDepth?: number): Promise<FileTreeNode[]> =>
      ipcRenderer.invoke('fs:listDir', dirPath, maxDepth),
    readFileContent: (filePath: string, maxLines?: number): Promise<{ success: boolean; content?: string; totalLines?: number; filePath?: string; error?: string }> =>
      ipcRenderer.invoke('fs:readFileContent', filePath, maxLines),
    writeFile: (filePath: string, content: string): Promise<{ success: boolean; filePath?: string; error?: string }> =>
      ipcRenderer.invoke('fs:writeFile', filePath, content),
    deleteFile: (filePath: string): Promise<{ success: boolean; filePath?: string; error?: string }> =>
      ipcRenderer.invoke('fs:deleteFile', filePath),
    renameFile: (oldPath: string, newPath: string): Promise<{ success: boolean; oldPath?: string; newPath?: string; error?: string }> =>
      ipcRenderer.invoke('fs:renameFile', oldPath, newPath),
    copyFile: (srcPath: string, destPath: string): Promise<{ success: boolean; srcPath?: string; destPath?: string; error?: string }> =>
      ipcRenderer.invoke('fs:copyFile', srcPath, destPath),
    revertFile: (snapshotPath: string, targetPath: string): Promise<{ success: boolean; message?: string; error?: string }> =>
      ipcRenderer.invoke('fs:revertFile', snapshotPath, targetPath),
    listSnapshots: (targetFilePath?: string): Promise<{ success: boolean; snapshots: Array<{ name: string; path: string; size: number; mtime: number }> }> =>
      ipcRenderer.invoke('fs:listSnapshots', targetFilePath)
  },
  checkpoint: {
    list: (sessionId: string): Promise<{ success: boolean; checkpoints: Array<{ turn: number; time: number; prompt: string; paths: string[] }> }> =>
      ipcRenderer.invoke('checkpoint:list', sessionId),
    restore: (sessionId: string, fromTurn: number): Promise<{ success: boolean; written: string[]; deleted: string[]; errors: string[] }> =>
      ipcRenderer.invoke('checkpoint:restore', sessionId, fromTurn),
    bounds: (sessionId: string): Promise<{ success: boolean; bounds: Record<number, number> }> =>
      ipcRenderer.invoke('checkpoint:bounds', sessionId),
    clear: (sessionId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('checkpoint:clear', sessionId)
  },
  piHelper: {
    status: (): Promise<{ ready: boolean; error?: string; path: string }> =>
      ipcRenderer.invoke('pi-helper:status')
  },
  // 内嵌浏览器网络抓包
  networkCapture: {
    start: (): Promise<{ success: boolean }> => ipcRenderer.invoke('network-capture:start'),
    stop: (): Promise<{ success: boolean }> => ipcRenderer.invoke('network-capture:stop'),
    getRequests: (): Promise<CapturedRequest[]> => ipcRenderer.invoke('network-capture:get'),
    clear: (): Promise<{ success: boolean }> => ipcRenderer.invoke('network-capture:clear')
  },
  // 内嵌浏览器桥 — Agent ↔ webview 命令通道
  embeddedBrowser: {
    setActive: (active: boolean): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('embedded-browser:set-active', active),
    onCommand: (callback: (data: { id: string; cmd: string; args: Record<string, unknown> }) => void): (() => void) => {
      const handler = (_event: unknown, data: { id: string; cmd: string; args: Record<string, unknown> }): void => callback(data)
      ipcRenderer.on('webview:command', handler as never)
      return () => ipcRenderer.removeListener('webview:command', handler as never)
    },
    sendResult: (data: { id: string; success: boolean; result?: unknown; error?: string }): void => {
      ipcRenderer.send('webview:result', data)
    }
  },
  // 技能录制保存（内嵌浏览器模式）
  skillRecording: {
    save: (data: {
      name: string
      description: string
      steps: Array<{ tool: string; arguments: Record<string, unknown>; timestamp: number; description?: string }>
      apiEndpoints: string[]
      startUrl?: string
      rrwebEvents?: Record<string, unknown>[]
    }): Promise<{ success: boolean; skill: Skill }> =>
      ipcRenderer.invoke('skill-recording:save', data)
  },
  // 设计组件库 — 读取 react-bits 组件源码（JSX + CSS）
  design: {
    readComponent: (category: string, componentId: string): Promise<{ success: boolean; jsx: string; css: string; error?: string }> =>
      ipcRenderer.invoke('design:readComponent', category, componentId)
  },
  // 操控电脑（pi-computer-use）启停
  computerUse: {
    start: (): Promise<{ success: boolean; running: boolean; error?: string }> =>
      ipcRenderer.invoke('computer-use:start'),
    stop: (): Promise<{ success: boolean; running: boolean }> =>
      ipcRenderer.invoke('computer-use:stop'),
    status: (): Promise<{ running: boolean }> =>
      ipcRenderer.invoke('computer-use:status')
  },
  // 系统字体列表
  fonts: {
    list: (): Promise<string[]> => ipcRenderer.invoke('fonts:list')
  },
  ...extendedApi,

  // 获取应用版本
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  // DeepSeek V4 分词器 — 本地 token 计数（与 API 口径一致）
  tokenizer: {
    count: (text: string): Promise<{ success: boolean; count: number; error?: string }> =>
      ipcRenderer.invoke('tokenizer:count', text),
    countMessages: (messages: { role: string; content: string }[]): Promise<{ success: boolean; count: number; error?: string }> =>
      ipcRenderer.invoke('tokenizer:countMessages', messages)
  },

  // 语音转写已在 extendedApi 中定义
}

export type Api = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore 类型绕过
  window.api = api
}
