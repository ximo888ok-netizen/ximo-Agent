/**
 * 安全存储工具 — 使用 Electron safeStorage 加密敏感数据
 *
 * safeStorage 在 Windows 上使用 DPAPI，macOS 上使用 Keychain，Linux 上使用 libsecret。
 * 加密后的数据仅当前用户可解密，防止 API Key 明文落盘。
 */
import { safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { DATA_DIR } from './paths'

/** 加密存储文件路径 */
const SECURE_FILE = join(DATA_DIR, 'secure.enc')

/** 需要加密的敏感字段名 */
const SENSITIVE_KEYS = ['apiKey', 'visionApiKey', 'sttApiKey'] as const

type SensitiveKey = typeof SENSITIVE_KEYS[number]

/**
 * 加密并保存敏感字段到 secure.enc
 * 非敏感字段忽略，调用方负责将返回值从 settings 中清除明文。
 */
export function encryptSensitiveFields(
  data: Record<string, unknown>
): Record<string, string> {
  const encrypted: Record<string, string> = {}
  for (const key of SENSITIVE_KEYS) {
    const val = data[key]
    if (typeof val === 'string' && val.length > 0) {
      try {
        if (safeStorage.isEncryptionAvailable()) {
          encrypted[key] = safeStorage.encryptString(val).toString('base64')
        }
      } catch {
        // safeStorage 不可用时跳过，明文降级
      }
    }
  }
  return encrypted
}

/** 从 settings 中提取并加密敏感字段，写入 secure.enc */
export function saveEncryptedFields(settings: Record<string, unknown>): void {
  try {
    const encrypted = encryptSensitiveFields(settings)
    if (Object.keys(encrypted).length === 0) return
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(SECURE_FILE, JSON.stringify(encrypted), 'utf-8')
  } catch {
    // 静默失败 — 不阻塞 settings 保存流程
  }
}

/**
 * 从 secure.enc 读取并解密敏感字段
 * 返回解密后的键值对，合并到 settings 中。
 */
export function loadEncryptedFields(): Partial<Record<SensitiveKey, string>> {
  try {
    if (!existsSync(SECURE_FILE)) return {}
    if (!safeStorage.isEncryptionAvailable()) return {}
    const raw = readFileSync(SECURE_FILE, 'utf-8')
    const encryptedMap = JSON.parse(raw) as Record<string, string>
    const result: Partial<Record<SensitiveKey, string>> = {}
    for (const key of SENSITIVE_KEYS) {
      const encVal = encryptedMap[key]
      if (encVal) {
        try {
          result[key] = safeStorage.decryptString(
            Buffer.from(encVal, 'base64')
          )
        } catch {
          // 解密失败跳过
        }
      }
    }
    return result
  } catch {
    return {}
  }
}
