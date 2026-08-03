import { join } from 'path'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { create, insert, search, remove, update } from '@orama/orama'
import type { AnyOrama } from '@orama/orama'
import type { Mode } from '@shared/types'
import { knowledgeDir } from './paths'

/** 知识条目 — 存储在 JSON 文件中的完整数据 */
export interface KnowledgeEntry {
  id: string
  title: string
  content: string
  tags: string[]
  source: string
  createdAt: number
  updatedAt: number
}

/** 搜索结果项 */
export interface KnowledgeSearchResult {
  id: string
  title: string
  content: string
  tags: string[]
  source: string
  score: number
  createdAt: number
  updatedAt: number
}

/** 分页列表结果 */
export interface KnowledgeListResult {
  items: KnowledgeEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** 搜索结果（带分页） */
export interface KnowledgeSearchResponse {
  results: KnowledgeSearchResult[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const dataDir = knowledgeDir

const schema = {
  title: 'string',
  content: 'string',
  tags: 'string[]',
  source: 'string',
  createdAt: 'number',
  updatedAt: 'number'
} as const

/** 每个模式的 Orama 索引 + 条目列表 */
interface ModeStore {
  db: AnyOrama
  entries: KnowledgeEntry[]
  idMap: Map<string, string> // entry.id → orama doc id
}

const stores = new Map<Mode, ModeStore>()

/** 生成知识条目 ID */
function genId(): string {
  return `kb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

async function getOrLoadStore(mode: Mode): Promise<ModeStore> {
  if (stores.has(mode)) return stores.get(mode)!

  const modeDir = join(dataDir, mode)
  await mkdir(modeDir, { recursive: true })
  const file = join(modeDir, 'entries.json')

  let entries: KnowledgeEntry[] = []
  try {
    const raw = await readFile(file, 'utf-8')
    entries = JSON.parse(raw)
    if (!Array.isArray(entries)) entries = []
  } catch { /* 文件不存在，空起始 */ }

  // 构建 Orama 索引
  const db = await create({ schema })
  const idMap = new Map<string, string>()
  for (const entry of entries) {
    try {
      const oramaId = await insert(db, { ...entry })
      idMap.set(entry.id, oramaId as string)
    } catch (e) {
      console.error(`[KnowledgeStore] 重建索引失败 (${entry.id}):`, e)
    }
  }

  const store: ModeStore = { db, entries, idMap }
  stores.set(mode, store)
  return store
}

async function persist(mode: Mode): Promise<void> {
  const store = stores.get(mode)
  if (!store) return
  const modeDir = join(dataDir, mode)
  await mkdir(modeDir, { recursive: true })
  await writeFile(
    join(modeDir, 'entries.json'),
    JSON.stringify(store.entries, null, 2),
    'utf-8'
  )
}

// ---------- 公开 API ----------

/** 添加知识条目 */
export async function addKnowledge(
  mode: Mode,
  data: { title: string; content: string; tags?: string[]; source?: string }
): Promise<KnowledgeEntry> {
  const store = await getOrLoadStore(mode)
  const now = Date.now()
  const entry: KnowledgeEntry = {
    id: genId(),
    title: data.title,
    content: data.content,
    tags: data.tags ?? [],
    source: data.source ?? 'agent',
    createdAt: now,
    updatedAt: now
  }
  const oramaId = await insert(store.db, { ...entry })
  store.idMap.set(entry.id, oramaId as string)
  store.entries.push(entry)
  await persist(mode)
  return entry
}

/** 搜索知识（BM25 全文搜索，带分页） */
export async function searchKnowledge(
  mode: Mode,
  query: string,
  page = 1,
  pageSize = 10
): Promise<KnowledgeSearchResponse> {
  const store = await getOrLoadStore(mode)
  const offset = (page - 1) * pageSize

  const results = await search(store.db, {
    term: query,
    limit: pageSize,
    offset,
    properties: ['title', 'content', 'tags']
  })

  const mapped: KnowledgeSearchResult[] = results.hits.map((hit) => {
    const doc = hit.document as Record<string, unknown>
    return {
      id: (doc.id as string) ?? '',
      title: (doc.title as string) ?? '',
      content: (doc.content as string) ?? '',
      tags: (doc.tags as string[]) ?? [],
      source: (doc.source as string) ?? '',
      score: hit.score,
      createdAt: (doc.createdAt as number) ?? 0,
      updatedAt: (doc.updatedAt as number) ?? 0
    }
  })

  return {
    results: mapped,
    total: results.count,
    page,
    pageSize,
    totalPages: Math.ceil(results.count / pageSize) || 1
  }
}

/** 分页浏览全部知识条目 */
export async function listKnowledge(
  mode: Mode,
  page = 1,
  pageSize = 20
): Promise<KnowledgeListResult> {
  const store = await getOrLoadStore(mode)
  const total = store.entries.length
  const offset = (page - 1) * pageSize
  const items = store.entries
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(offset, offset + pageSize)

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1
  }
}

/** 更新知识条目 */
export async function updateKnowledge(
  mode: Mode,
  id: string,
  updates: Partial<Pick<KnowledgeEntry, 'title' | 'content' | 'tags' | 'source'>>
): Promise<KnowledgeEntry | null> {
  const store = await getOrLoadStore(mode)
  const idx = store.entries.findIndex((e) => e.id === id)
  if (idx === -1) return null

  const entry = store.entries[idx]
  const updated: KnowledgeEntry = {
    ...entry,
    ...updates,
    updatedAt: Date.now()
  }
  store.entries[idx] = updated

  // 同步 Orama 索引
  const oramaId = store.idMap.get(id)
  if (oramaId) {
    try {
      await update(store.db, oramaId, { ...updated })
    } catch (e) {
      console.error(`[KnowledgeStore] 更新索引失败 (${id}):`, e)
    }
  }

  await persist(mode)
  return updated
}

/** 删除知识条目 */
export async function deleteKnowledge(mode: Mode, id: string): Promise<boolean> {
  const store = await getOrLoadStore(mode)
  const idx = store.entries.findIndex((e) => e.id === id)
  if (idx === -1) return false

  store.entries.splice(idx, 1)

  const oramaId = store.idMap.get(id)
  if (oramaId) {
    try {
      await remove(store.db, oramaId)
    } catch (e) {
      console.error(`[KnowledgeStore] 删除索引失败 (${id}):`, e)
    }
    store.idMap.delete(id)
  }

  await persist(mode)
  return true
}
