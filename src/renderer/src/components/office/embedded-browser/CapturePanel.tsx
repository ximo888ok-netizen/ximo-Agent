import { Radio, Trash2, X } from 'lucide-react'
import type { CapturedRequest } from '@renderer/components/office/shared/types'

interface CapturePanelProps {
  requests: CapturedRequest[]
  isRecording: boolean
  onClear: () => void
  onClose: () => void
}

/** API 抓包面板 */
export function CapturePanel({ requests, isRecording, onClear, onClose }: CapturePanelProps): React.ReactElement {
  return (
    <div className="flex max-h-32 flex-col border-t border-border-subtle shrink-0">
      <div className="flex items-center justify-between px-2 py-1 bg-bg-surface/50">
        <div className="flex items-center gap-1.5">
          <Radio size={11} className="text-accent" />
          <span className="text-[10px] font-medium text-text-secondary">API 抓包</span>
          <span className="text-[9px] text-text-muted">{requests.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onClear} className="icon-btn rounded p-0.5" title="清空">
            <Trash2 size={10} />
          </button>
          <button onClick={onClose} className="icon-btn rounded p-0.5" title="收起">
            <X size={10} />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {requests.length === 0 ? (
          <div className="px-3 py-2 text-center text-[10px] text-text-muted">
            {isRecording ? '等待 API 请求...' : '开启录制后自动捕获 XHR/Fetch 请求'}
          </div>
        ) : (
          requests.slice(-30).reverse().map((req) => (
            <div key={req.id} className="border-b border-border-subtle/50 px-2 py-1 text-[10px]">
              <div className="flex items-center gap-1.5">
                <span className={`shrink-0 rounded px-1 py-0.5 text-[8px] font-bold ${
                  req.method === 'GET' ? 'bg-blue-500/15 text-blue-400' :
                  req.method === 'POST' ? 'bg-green-500/15 text-green-400' :
                  req.method === 'PUT' ? 'bg-amber-500/15 text-amber-400' :
                  req.method === 'DELETE' ? 'bg-red-500/15 text-red-400' :
                  'bg-gray-500/15 text-gray-400'
                }`}>
                  {req.method}
                </span>
                {req.statusCode && (
                  <span className={`shrink-0 text-[8px] font-medium ${
                    req.statusCode < 300 ? 'text-green-400' : req.statusCode < 400 ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {req.statusCode}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-text-secondary" title={req.url}>
                  {(() => {
                    try {
                      const u = new URL(req.url)
                      return u.pathname + u.search
                    } catch {
                      return req.url
                    }
                  })()}
                </span>
                {req.duration !== undefined && (
                  <span className="shrink-0 text-[8px] text-text-muted">{req.duration}ms</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
