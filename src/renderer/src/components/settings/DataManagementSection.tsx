import { useState } from 'react'
import { Download, Upload, Trash2, CheckCircle2, XCircle } from 'lucide-react'
import type { AppSettings } from '@shared/types'
import { SectionTitle, Divider, DataRow } from './shared-components'

interface DataManagementSectionProps {
  local: AppSettings
  update: (patch: Partial<AppSettings>) => void
  onExport: () => void
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void
  onClearAll: () => void
  importMsg: { ok: boolean; text: string } | null
  fileInputRef: React.RefObject<HTMLInputElement>
  convoCount: number
}

/** 数据管理区 — 导出/导入/清除本地会话数据 */
export function DataManagementSection({
  onExport, onImport, onClearAll, importMsg, fileInputRef, convoCount,
}: DataManagementSectionProps): React.ReactElement {
  const [confirmClear, setConfirmClear] = useState(false)

  return (
    <>
      <Divider />
      <SectionTitle title="数据管理" desc="导出、导入或清除本地会话数据" />

      <div className="rounded-lg border border-border-subtle bg-bg-elevated p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">本地会话数量</span>
          <span className="font-mono text-sm font-medium text-text-primary">{convoCount}</span>
        </div>
      </div>

      <DataRow icon={<Download size={15} />} title="导出会话" desc="将所有会话保存为 JSON 文件，可用于备份或迁移">
        <button
          onClick={onExport}
          disabled={convoCount === 0}
          className="rounded-lg border border-border bg-bg-elevated px-3 py-1.5 text-xs text-text-primary transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          导出
        </button>
      </DataRow>

      <DataRow icon={<Upload size={15} />} title="导入会话" desc="从 JSON 文件恢复会话（将覆盖当前会话）">
        <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={onImport} className="hidden" />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="rounded-lg border border-border bg-bg-elevated px-3 py-1.5 text-xs text-text-primary transition-colors hover:bg-bg-hover"
        >
          选择文件
        </button>
      </DataRow>

      {importMsg && (
        <div className={`flex items-center gap-2 rounded-lg p-2.5 text-xs ${importMsg.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
          {importMsg.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {importMsg.text}
        </div>
      )}

      <DataRow icon={<Trash2 size={15} />} title="清空所有会话" desc="永久删除所有本地会话数据，此操作不可撤销" danger>
        {confirmClear ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { onClearAll(); setConfirmClear(false) }}
              className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600"
            >
              确认清空
            </button>
            <button
              onClick={() => setConfirmClear(false)}
              className="rounded-lg px-2 py-1.5 text-xs text-text-muted hover:text-text-primary"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmClear(true)}
            disabled={convoCount === 0}
            className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            清空
          </button>
        )}
      </DataRow>
    </>
  )
}
