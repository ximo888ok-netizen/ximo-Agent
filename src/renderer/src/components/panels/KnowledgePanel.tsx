import { useState, useEffect, useCallback } from 'react'
import { X, Library, Search, Plus, Trash2, Pencil, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { MODE_CONFIGS } from '@renderer/modes'
import type { Mode } from '@shared/types'

interface KnowledgeItem {
  id: string; title: string; content: string; tags: string[]
  source: string; createdAt: number; updatedAt: number
}

interface ListResult {
  items: KnowledgeItem[]; total: number; page: number; pageSize: number; totalPages: number
}

const PAGE_SIZE = 10

export function KnowledgePanel(): React.ReactElement | null {
  const show = useStore((s) => s.showKnowledgePanel)
  const setShow = useStore((s) => s.setShowKnowledgePanel)
  const currentMode = useStore((s) => s.currentMode) as Mode

  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<KnowledgeItem | null>(null)
  const [showForm, setShowForm] = useState(false)

  const modeConfig = MODE_CONFIGS[currentMode]

  const loadData = useCallback(async (mode: Mode, p: number) => {
    setLoading(true)
    try {
      const res = await window.api.knowledge.list(mode, p, PAGE_SIZE) as ListResult
      setItems(res.items); setTotal(res.total)
      setPage(res.page); setTotalPages(res.totalPages)
    } catch (e) { console.error('加载知识库失败:', e) }
    setLoading(false)
  }, [])

  const doSearch = useCallback(async (mode: Mode, query: string, p: number) => {
    setLoading(true)
    try {
      const res = await window.api.knowledge.search(mode, query, p, PAGE_SIZE)
      setItems(res.results.map(r => ({ id: r.id, title: r.title, content: r.content, tags: r.tags, source: r.source, createdAt: r.createdAt, updatedAt: r.updatedAt })))
      setTotal(res.total); setPage(res.page); setTotalPages(res.totalPages)
    } catch (e) { console.error('搜索知识库失败:', e) }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (show) {
      setSearchQuery(''); setIsSearching(false)
      void loadData(currentMode, 1)
    }
  }, [show, currentMode, loadData])

  const handleSearch = (): void => {
    if (searchQuery.trim()) { setIsSearching(true); void doSearch(currentMode, searchQuery.trim(), 1) }
    else { setIsSearching(false); void loadData(currentMode, 1) }
  }

  const handlePageChange = (newPage: number): void => {
    if (isSearching) void doSearch(currentMode, searchQuery.trim(), newPage)
    else void loadData(currentMode, newPage)
  }

  const handleDelete = async (id: string): Promise<void> => {
    if (!confirm('确认删除此知识条目？')) return
    await window.api.knowledge.delete(currentMode, id)
    if (isSearching) void doSearch(currentMode, searchQuery.trim(), page)
    else void loadData(currentMode, page)
  }

  const handleFormSaved = (): void => {
    setShowForm(false); setEditing(null)
    if (isSearching) void doSearch(currentMode, searchQuery.trim(), 1)
    else void loadData(currentMode, 1)
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setShow(false)}>
      <div className="glass-panel flex h-[80vh] w-[760px] max-w-[94vw] flex-col overflow-hidden animate-fade-scale" onClick={(e) => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20">
              <Library size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">{modeConfig.name} · 知识库</h2>
              <p className="text-xs text-text-muted">BM25 全文检索 · 共 {total} 条</p>
            </div>
          </div>
          <button onClick={() => setShow(false)} className="icon-btn rounded-lg p-1.5"><X size={18} /></button>
        </div>

        {/* 搜索栏 */}
        <div className="flex items-center gap-2 border-b border-border-subtle px-5 py-3">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-bg-input px-3 py-1.5">
            <Search size={14} className="text-text-muted" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
              placeholder="搜索知识库..."
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none"
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setIsSearching(false); void loadData(currentMode, 1) }} className="text-text-muted hover:text-text-primary">
                <X size={14} />
              </button>
            )}
          </div>
          <button onClick={() => { setEditing(null); setShowForm(true) }} className="btn-liquid flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold">
            <Plus size={14} /> 添加
          </button>
        </div>

        {/* 内容区 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex h-full items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" /></div>
          ) : showForm ? (
            <KnowledgeForm mode={currentMode} editing={editing} onSaved={handleFormSaved} onCancel={() => { setShowForm(false); setEditing(null) }} />
          ) : items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-text-muted">
              <Library size={40} className="mb-3 opacity-40" />
              <p className="text-sm">{isSearching ? '未找到匹配的知识条目' : '知识库为空，点击"添加"创建第一条知识'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="group rounded-xl border border-border-subtle bg-bg-card p-3.5 transition-colors hover:border-indigo-500/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-text-primary">{item.title}</h3>
                      <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-text-muted">{item.content}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {item.tags.map((tag) => (
                          <span key={tag} className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-400">{tag}</span>
                        ))}
                        <span className="text-[10px] text-text-muted/60">来源: {item.source}</span>
                        <span className="text-[10px] text-text-muted/60">{new Date(item.updatedAt).toLocaleDateString('zh-CN')}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button onClick={() => { setEditing(item); setShowForm(true) }} className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-indigo-400" title="编辑"><Pencil size={13} /></button>
                      <button onClick={() => void handleDelete(item.id)} className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-red-400" title="删除"><Trash2 size={13} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 分页 */}
        {items.length > 0 && !showForm && (
          <div className="flex items-center justify-between border-t border-border-subtle px-5 py-2.5">
            <span className="text-[11px] text-text-muted">
              {isSearching ? `搜索结果 ${total} 条` : `共 ${total} 条`} · 第 {page}/{totalPages} 页
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => handlePageChange(page - 1)} disabled={page <= 1} className="rounded-lg p-1 text-text-muted hover:bg-bg-hover disabled:opacity-30">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages} className="rounded-lg p-1 text-text-muted hover:bg-bg-hover disabled:opacity-30">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- 编辑表单子组件 ----------

function KnowledgeForm({ mode, editing, onSaved, onCancel }: {
  mode: Mode
  editing: KnowledgeItem | null
  onSaved: () => void
  onCancel: () => void
}): React.ReactElement {
  const [title, setTitle] = useState(editing?.title ?? '')
  const [content, setContent] = useState(editing?.content ?? '')
  const [tags, setTags] = useState(editing?.tags.join(', ') ?? '')
  const [source, setSource] = useState(editing?.source ?? 'manual')
  const [saving, setSaving] = useState(false)

  const handleSave = async (): Promise<void> => {
    if (!title.trim() || !content.trim()) return
    setSaving(true)
    const tagArr = tags.split(',').map((t) => t.trim()).filter(Boolean)
    if (editing) {
      await window.api.knowledge.update(mode, editing.id, { title: title.trim(), content: content.trim(), tags: tagArr, source: source.trim() })
    } else {
      await window.api.knowledge.add(mode, { title: title.trim(), content: content.trim(), tags: tagArr, source: source.trim() })
    }
    setSaving(false)
    onSaved()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <Check size={16} className="text-indigo-400" />
        <span className="text-sm font-semibold text-text-primary">{editing ? '编辑知识' : '添加知识'}</span>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="知识标题..."
        className="mb-2 rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-indigo-500/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="知识正文..."
        className="flex-1 resize-none rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-indigo-500/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
        style={{ lineHeight: 1.7 }}
      />
      <div className="mt-2 flex gap-2">
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="标签（逗号分隔）"
          className="flex-1 rounded-lg border border-border bg-bg-input px-3 py-2 text-xs text-text-primary placeholder:text-text-muted/60 focus:border-indigo-500/40 focus:outline-none"
        />
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="来源"
          className="w-32 rounded-lg border border-border bg-bg-input px-3 py-2 text-xs text-text-primary placeholder:text-text-muted/60 focus:border-indigo-500/40 focus:outline-none"
        />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg px-4 py-1.5 text-xs font-medium text-text-muted hover:bg-bg-hover">取消</button>
        <button
          onClick={() => void handleSave()}
          disabled={saving || !title.trim() || !content.trim()}
          className="btn-liquid flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  )
}

export default KnowledgePanel
