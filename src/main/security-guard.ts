/**
 * 安全守卫 — 统一管理文件读写路径校验、SSRF 防护等安全策略
 *
 * 功能：
 * 1. 写入保护：allowedRoots 白名单，file_edit/file_write 只允许白名单内路径
 * 2. 敏感文件读取兜底：阻止读取 SSH 密钥、凭据文件等
 * 3. SSRF 防护：web_fetch 禁止访问内网/回环/云元数据端点
 */
import { resolve, normalize, isAbsolute } from 'path'

// ---------- 写入保护 ----------

/** 允许写入的根目录列表（运行时从设置/项目路径注入） */
let allowedWriteRoots: string[] = []

/** 设置允许写入的根目录 */
export function setAllowedWriteRoots(roots: string[]): void {
  allowedWriteRoots = roots
    .filter((r) => r && r.length > 0)
    .map((r) => normalize(resolve(r)))
    // 去重
    .filter((v, i, arr) => arr.indexOf(v) === i)
}

/** 获取允许写入的根目录 */
export function getAllowedWriteRoots(): string[] {
  return [...allowedWriteRoots]
}

/**
 * 检查文件路径是否在允许写入的范围内
 * @returns { allowed: boolean; reason?: string }
 */
export function checkWriteAccess(filePath: string): { allowed: boolean; reason?: string } {
  const normalized = normalize(resolve(filePath))

  // 系统临时目录快照文件始终允许
  // （FileEditTool 的 snapshotPath 在 os.tmpdir 下）

  // 无白名单时默认允许（向后兼容）
  if (allowedWriteRoots.length === 0) return { allowed: true }

  for (const root of allowedWriteRoots) {
    // 确保 root 是目录边界 — normalized 必须以 root 开头且后面是路径分隔符或恰好等于 root
    if (normalized === root || normalized.startsWith(root + '\\') || normalized.startsWith(root + '/')) {
      return { allowed: true }
    }
  }

  return {
    allowed: false,
    reason: `路径 "${normalized}" 不在允许写入的目录范围内。允许的目录：${allowedWriteRoots.join(', ')}`
  }
}

// ---------- 敏感文件读取兜底 ----------

/** 敏感文件路径模式 — 阻止 Agent 读取用户凭据 */
const SENSITIVE_FILE_PATTERNS = [
  /\.ssh\//i,           // SSH 密钥目录
  /\/\.ssh\//i,
  /\.ssh\\/i,
  /id_rsa/i,            // SSH 私钥
  /id_ecdsa/i,
  /id_ed25519/i,
  /\.gnupg\//i,         // GPG 密钥
  /\/\.gnupg\//i,
  /\.gnupg\\/i,
  /\.env$/i,            // 环境变量文件
  /\.env\./i,           // .env.local, .env.production 等
  /\.npmrc$/i,          // npm 凭据
  /\.pypirc$/i,         // PyPI 凭据
  /\.netrc$/i,          // 网络凭据
  /_netrc$/i,
  /credentials\.json$/i, // 凭据文件
  /cookies\.txt$/i,      // Cookie 文件
  /\.key$/i,             // 私钥文件
  /\.pem$/i,             // 证书/私钥
  /\.pfx$/i,             // 证书交换
  /\.keystore$/i,        // Java 密钥库
  /\.kdbx$/i,            // KeePass 数据库
  /kube\/?config/i,      // Kubernetes 配置
  /\.docker\/config\.json$/i,  // Docker 凭据
  /\.aws\/credentials$/i,      // AWS 凭据
  /\.aws\/config$/i,           // AWS 配置
]

/**
 * 检查文件路径是否为敏感凭据文件
 * @returns { blocked: boolean; reason?: string }
 */
export function checkSensitiveFile(filePath: string): { blocked: boolean; reason?: string } {
  const normalized = normalize(resolve(filePath))

  for (const pattern of SENSITIVE_FILE_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        blocked: true,
        reason: `出于安全考虑，不允许读取敏感凭据文件："${normalized}"。如需查看文件内容，请用户手动复制相关内容。`
      }
    }
  }

  return { blocked: false }
}

// ---------- SSRF 防护 ----------

/** 云元数据端点 — 禁止访问 */
const METADATA_HOSTS = [
  '169.254.169.254',    // AWS / Azure / GCP 元数据
  'fd00:ec2::254',      // AWS IPv6 元数据
  'metadata.google.internal',  // GCP 元数据
  'metadata.azure.com',        // Azure 元数据
]

/** 回环/内网 IP 范围正则 */
const INTERNAL_IP_PATTERNS = [
  /^127\./,                         // 127.0.0.0/8 回环
  /^10\./,                           // 10.0.0.0/8 内网
  /^172\.(1[6-9]|2\d|3[01])\./,     // 172.16.0.0/12 内网
  /^192\.168\./,                     // 192.168.0.0/16 内网
  /^169\.254\./,                     // 169.254.0.0/16 链路本地
  /^0\./,                            // 0.0.0.0/8 本机
  /^::1$/,                            // IPv6 回环
  /^fe80:/i,                          // IPv6 链路本地
  /^fc00:/i,                          // IPv6 唯一本地地址
  /^fd/i,                             // IPv6 本地地址
]

/** 内网主机名 */
const INTERNAL_HOSTNAMES = [
  'localhost',
  'ip6-localhost',
  'ip6-loopback',
  'broadcasthost',
]

/**
 * SSRF 防护 — 检查 URL 是否安全
 * 禁止访问内网 IP、回环地址、云元数据端点
 * @returns { blocked: boolean; reason?: string }
 */
export function checkSsrf(url: string): { blocked: boolean; reason?: string } {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()

    // 检查云元数据端点
    if (METADATA_HOSTS.includes(hostname)) {
      return {
        blocked: true,
        reason: `SSRF 防护：禁止访问云元数据端点 "${hostname}"`
      }
    }

    // 检查内网主机名
    if (INTERNAL_HOSTNAMES.includes(hostname)) {
      return {
        blocked: true,
        reason: `SSRF 防护：禁止访问内网地址 "${hostname}"`
      }
    }

    // 检查内网 IP 范围
    for (const pattern of INTERNAL_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        return {
          blocked: true,
          reason: `SSRF 防护：禁止访问内网地址 "${hostname}"`
        }
      }
    }

    // 检查协议 — 仅允许 http/https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        blocked: true,
        reason: `SSRF 防护：仅允许 http/https 协议，不允许 "${parsed.protocol}"`
      }
    }

    return { blocked: false }
  } catch {
    return {
      blocked: true,
      reason: `SSRF 防护：URL 解析失败 "${url}"`
    }
  }
}
