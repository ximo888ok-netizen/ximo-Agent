/**
 * GPU 硬件加速配置 — 必须在 app.whenReady() 之前调用
 * Chromium GPU 进程启动时读取这些命令行开关
 */

import { app } from 'electron'
import { settingsFile } from './paths'

/** 从设置文件同步读取 GPU 加速开关状态（默认开启） */
function isGpuAccelerationEnabled(): boolean {
  try {
    const { readFileSync, existsSync } = require('fs')
    const settingsPath = settingsFile
    if (!existsSync(settingsPath)) return true
    const raw = readFileSync(settingsPath, 'utf-8')
    const settings = JSON.parse(raw)
    return settings.gpuAcceleration !== false
  } catch {
    return true // 读取失败时默认开启
  }
}

/** 配置 GPU 硬件加速命令行开关 */
export function configureGpuAcceleration(): void {
  if (!isGpuAccelerationEnabled()) return

  // 忽略 GPU 黑名单，强制启用硬件加速（部分旧驱动会被 Chromium 默认禁用）
  app.commandLine.appendSwitch('ignore-gpu-blocklist')
  // 启用 GPU 光栅化 — 将 CSS 像素绘制交给 GPU 而非 CPU
  app.commandLine.appendSwitch('enable-gpu-rasterization')
  // 启用零拷贝光栅化 — 减少 GPU 内存拷贝，提升渲染吞吐量
  app.commandLine.appendSwitch('enable-zero-copy')
  // 禁用软件光栅化回退 — 确保使用 GPU 渲染，避免静默降级到 CPU
  app.commandLine.appendSwitch('disable-software-rasterizer')

  if (process.platform === 'win32') {
    // Windows: 使用 Direct3D 11 作为 ANGLE 图形后端（性能最佳）
    app.commandLine.appendSwitch('use-angle', 'd3d11')
    // 强制使用高性能 GPU（独显优先，无独显时自动回退到核显）
    app.commandLine.appendSwitch('force_high_performance_gpu')
  }
}
