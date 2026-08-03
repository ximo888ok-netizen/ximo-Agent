import {
  Eye,
  EyeOff,
  Zap,
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink
} from 'lucide-react'
import type { AppSettings, TestResult } from '@shared/types'
import { SectionTitle } from './shared-components'
import type { TestState } from './shared-components'

export function ApiTab({
  local,
  update,
  showKey,
  setShowKey,
  testState,
  testResult,
  onTest
}: {
  local: AppSettings
  update: (patch: Partial<AppSettings>) => void
  showKey: boolean
  setShowKey: (v: boolean) => void
  testState: TestState
  testResult: TestResult | null
  onTest: () => void
}): React.ReactElement {
  const keyConfigured = local.apiKey.trim().length > 0

  return (
    <div className="space-y-5">
      <SectionTitle title="API 密钥" desc="配置 DeepSeek-V4 的访问凭证，密钥仅存储在本地" />

      {/* API Key */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-text-primary">API Key</label>
          <span
            className={`flex items-center gap-1 text-xs ${
              keyConfigured ? 'text-emerald-400' : 'text-text-muted'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                keyConfigured ? 'bg-emerald-400' : 'bg-text-muted'
              }`}
            />
            {keyConfigured ? '已配置' : '未配置'}
          </span>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showKey ? 'text' : 'password'}
              value={local.apiKey}
              onChange={(e) => update({ apiKey: e.target.value })}
              placeholder="sk-..."
              className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 pr-10 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted transition-colors hover:text-text-primary"
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <a
          href="https://platform.deepseek.com/api_keys"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:text-accent-hover"
        >
          <ExternalLink size={11} />
          前往 DeepSeek 平台获取 API Key
        </a>
      </div>

      {/* 连接测试 */}
      <div className="rounded-lg border border-border-subtle bg-bg-elevated p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-accent" />
            <span className="text-sm font-medium text-text-primary">连接测试</span>
          </div>
          <button
            onClick={onTest}
            disabled={testState === 'testing' || !keyConfigured}
            className="flex items-center gap-1.5 rounded-lg bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {testState === 'testing' ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                测试中...
              </>
            ) : (
              <>
                <Zap size={13} />
                测试连接
              </>
            )}
          </button>
        </div>

        {testState === 'idle' && (
          <p className="text-xs text-text-muted">
            点击「测试连接」验证 API Key 和网络连通性，将发送一个最小化请求。
          </p>
        )}

        {testState === 'testing' && (
          <p className="text-xs text-text-muted">正在向 DeepSeek API 发送测试请求...</p>
        )}

        {(testState === 'success' || testState === 'error') && testResult && (
          <div
            className={`flex items-start gap-2 rounded-xl p-3 text-xs ${
              testResult.success
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-red-500/10 text-red-400'
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 size={15} className="mt-0.5 flex-shrink-0" />
            ) : (
              <XCircle size={15} className="mt-0.5 flex-shrink-0" />
            )}
            <div className="flex-1">
              <p className="font-medium">{testResult.message}</p>
              {testResult.latency !== undefined && (
                <p className="mt-0.5 text-text-muted">
                  延迟 {testResult.latency}ms
                  {testResult.model ? ` · 模型 ${testResult.model}` : ''}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Base URL */}
      <div>
        <label className="mb-2 block text-sm font-medium text-text-primary">API 地址</label>
        <input
          type="text"
          value={local.baseUrl}
          onChange={(e) => update({ baseUrl: e.target.value })}
          className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        />
        <p className="mt-1.5 text-xs text-text-muted">
          DeepSeek API 基础地址，兼容 OpenAI 格式，一般无需修改
        </p>
      </div>
    </div>
  )
}
