/**
 * 记忆文本的解析与拼回 — 与 MemoryTool 的落盘约定保持一致。
 *
 * 抽成独立模块的原因：这两个函数直接决定写入用户持久化记忆的内容，
 * 必须能脱离 React 单独测试（见 tests/renderer/memory-format.test.ts）。
 */

/** 记忆的三类内容 — 与 MemoryTool 的约定一致 */
export const MEMORY_SECTIONS = [
  { key: 'habits', title: '用户习惯', hint: '偏好的格式、风格、工作方式', example: '- 例：回答默认中文，技术术语保留英文' },
  { key: 'pitfalls', title: '踩过的坑', hint: '犯过的错误及纠正方法', example: '- 例：改文件前必须先读取全文，否则会覆盖' },
  { key: 'tooling', title: '工具语法', hint: '本项目工具调用的正确用法', example: '- 例：office_docs 的 action 取 create / append' },
] as const

export type SectionKey = typeof MEMORY_SECTIONS[number]['key']

/** MemoryTool 建议的总量上限（行） */
export const LINE_BUDGET = 30

export interface ParsedMemory {
  /** freeform = 原文没有可识别的分类标题，保持整块编辑，不擅自重构 */
  mode: 'freeform' | 'structured'
  sections: Record<SectionKey, string>
  /** 未能归入三类的正文（含无法识别的标题行，原文保留） */
  other: string
  /** freeform 模式下的原始文本 */
  freeText: string
}

export const EMPTY_SECTIONS: Record<SectionKey, string> = { habits: '', pitfalls: '', tooling: '' }

export const EMPTY_PARSED: ParsedMemory = { mode: 'structured', sections: EMPTY_SECTIONS, other: '', freeText: '' }

/** 按 `## 标题` 把记忆拆进三类；识别不到任何已知标题则保持 freeform */
export function parseMemory(raw: string): ParsedMemory {
  if (!raw.trim()) return { ...EMPTY_PARSED, sections: { ...EMPTY_SECTIONS } }

  const buckets: Record<string, string[]> = { habits: [], pitfalls: [], tooling: [], other: [] }
  let cursor = 'other'
  let matched = false

  for (const line of raw.split('\n')) {
    const heading = line.match(/^#{1,4}\s*(.+?)\s*$/)
    if (heading) {
      const hit = MEMORY_SECTIONS.find((s) => heading[1].includes(s.title) || s.title.includes(heading[1]))
      if (hit) {
        cursor = hit.key
        matched = true
        continue
      }
      cursor = 'other'
      buckets.other.push(line) // 无法识别的标题原样保留
      continue
    }
    buckets[cursor].push(line)
  }

  if (!matched) return { ...EMPTY_PARSED, mode: 'freeform', freeText: raw }
  return {
    mode: 'structured',
    sections: {
      habits: buckets.habits.join('\n').trim(),
      pitfalls: buckets.pitfalls.join('\n').trim(),
      tooling: buckets.tooling.join('\n').trim(),
    },
    other: buckets.other.join('\n').trim(),
    freeText: '',
  }
}

/** 拼回落盘文本；空分类不写标题，全空则返回空串（等价于清空记忆） */
export function buildMemory(p: ParsedMemory): string {
  if (p.mode === 'freeform') return p.freeText
  const parts = MEMORY_SECTIONS
    .filter((s) => p.sections[s.key].trim())
    .map((s) => `## ${s.title}\n${p.sections[s.key].trim()}`)
  if (p.other.trim()) parts.push(`## 其他\n${p.other.trim()}`)
  return parts.length > 0 ? `${parts.join('\n\n')}\n` : ''
}

/** 正文行数（不含标题行） */
export function countContentLines(text: string): number {
  return text.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).length
}
