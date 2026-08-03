import { app, ipcMain, shell } from 'electron'
import { join } from 'path'

// ---------- 检查更新 ----------

interface ReleaseInfo {
  tag_name: string
  html_url: string
  assets?: Array<{ browser_download_url: string; name: string; size: number }>
}

async function fetchLatestRelease(apiUrl: string, headers: Record<string, string>): Promise<ReleaseInfo | null> {
  try {
    const res = await fetch(apiUrl, { headers })
    if (!res.ok) return null
    return (await res.json()) as ReleaseInfo
  } catch {
    return null
  }
}

function extractVersionInfo(release: ReleaseInfo, currentVersion: string): {
  latestVersion: string
  downloadUrl: string
  fileName: string
  fileSize: number
  releaseUrl: string
} | null {
  const latestVersion = release.tag_name.replace(/^v/, '')
  if (latestVersion === currentVersion) return null
  const asset = release.assets?.[0]
  return {
    latestVersion,
    downloadUrl: asset?.browser_download_url ?? release.html_url,
    fileName: asset?.name ?? `XimoAgent-Setup-${latestVersion}.exe`,
    fileSize: asset?.size ?? 0,
    releaseUrl: release.html_url
  }
}

/** 注册更新检查/下载/安装相关的 IPC handler */
export function registerUpdateHandlers(): void {
  ipcMain.handle('update:check', async () => {
    try {
      const { readFileSync } = await import('fs')
      const pkgPath = join(app.getAppPath(), 'package.json')
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      const currentVersion: string = pkg.version

      // 并行查询 GitHub 和 Gitee
      const [ghRelease, giteeRelease] = await Promise.all([
        fetchLatestRelease('https://api.github.com/repos/ximo888ok-netizen/ximo-Agent/releases/latest', { 'User-Agent': 'ximo-agent' }),
        fetchLatestRelease('https://gitee.com/api/v5/repos/ximo666ge/ximo-Agent/releases/latest', {})
      ])

      const ghInfo = ghRelease ? extractVersionInfo(ghRelease, currentVersion) : null
      const giteeInfo = giteeRelease ? extractVersionInfo(giteeRelease, currentVersion) : null

      if (!ghInfo && !giteeInfo) {
        if (!ghRelease && !giteeRelease) {
          return { success: false, error: '无法连接更新服务器' }
        }
        return {
          success: true,
          currentVersion,
          latestVersion: currentVersion,
          hasUpdate: false,
          downloadUrl: '',
          giteeDownloadUrl: '',
          fileName: '',
          fileSize: 0
        }
      }

      const info = ghInfo ?? giteeInfo!

      return {
        success: true,
        currentVersion,
        latestVersion: info.latestVersion,
        hasUpdate: true,
        downloadUrl: ghInfo?.downloadUrl ?? '',
        giteeDownloadUrl: giteeInfo?.downloadUrl ?? '',
        fileName: info.fileName,
        fileSize: info.fileSize,
        releaseUrl: info.releaseUrl
      }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('update:download', async (event, downloadUrl: string, fallbackUrl?: string) => {
    const doAttempt = async (url: string): Promise<{ success: boolean; filePath?: string }> => {
      const { createWriteStream, unlink, existsSync } = await import('fs')
      const https = await import('https')
      const http = await import('http')
      const downloadDir = join(app.getPath('temp'), 'ximo-agent-update')
      const { mkdir } = await import('fs/promises')
      await mkdir(downloadDir, { recursive: true })
      const fileName = 'XimoAgent-Setup.exe'
      const filePath = join(downloadDir, fileName)

      if (existsSync(filePath)) {
        unlink(filePath, () => {})
      }

      return new Promise((resolve, reject) => {
        const proto = url.startsWith('https') ? https : http
        proto.get(url, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const redirectUrl = res.headers.location
            res.resume()
            proto.get(redirectUrl, (redirectRes) => {
              doDownload(redirectRes)
            }).on('error', reject)
            return
          }
          doDownload(res)
        }).on('error', reject)

        function doDownload(res: import('http').IncomingMessage): void {
          const totalSize = parseInt(res.headers['content-length'] ?? '0', 10) || 0
          let downloaded = 0
          const file = createWriteStream(filePath)

          res.on('data', (chunk: Buffer) => {
            downloaded += chunk.length
            file.write(chunk)
            if (totalSize > 0 && !event.sender.isDestroyed()) {
              event.sender.send('update:downloadProgress', { downloaded, total: totalSize })
            }
          })

          res.on('end', () => {
            file.end()
            if (!event.sender.isDestroyed()) {
              event.sender.send('update:downloadProgress', { downloaded: totalSize || downloaded, total: totalSize || downloaded })
              event.sender.send('update:downloadComplete', { filePath })
            }
            resolve({ success: true, filePath })
          })

          res.on('error', (err) => {
            file.close()
            unlink(filePath, () => {})
            reject(err)
          })
        }
      })
    }

    try {
      return await doAttempt(downloadUrl)
    } catch {
      if (fallbackUrl && fallbackUrl.length > 0) {
        event.sender.send('update:downloadSwitch', { message: 'GitHub 下载失败，切换至 Gitee...' })
        try {
          return await doAttempt(fallbackUrl)
        } catch (e) {
          return { success: false, error: `GitHub 和 Gitee 均下载失败: ${(e as Error).message}` }
        }
      }
      return { success: false, error: '下载失败，请检查网络连接' }
    }
  })

  ipcMain.handle('update:install', async (_event, filePath: string) => {
    const error = await shell.openPath(filePath)
    if (error) throw new Error(error)
    return { success: true }
  })
}
