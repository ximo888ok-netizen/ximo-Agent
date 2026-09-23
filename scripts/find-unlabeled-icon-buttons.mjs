/**
 * 找出"只有图标、没有文字，且没有可访问名"的按钮 —— 附带位置与图标名，
 * 便于逐个起名后回填。
 *
 * 用法：node scripts/find-unlabeled-icon-buttons.mjs
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, extname } from 'node:path'

const SRC = 'src/renderer/src'
const CODE_EXT = new Set(['.ts', '.tsx'])

async function walk(dir) {
  const out = []
  const stack = [dir]
  while (stack.length) {
    const cur = stack.pop()
    let entries
    try {
      entries = await readdir(cur, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const p = join(cur, e.name)
      if (e.isDirectory()) {
        if (e.name === 'node_modules') continue
        stack.push(p)
      } else if (CODE_EXT.has(extname(e.name))) out.push(p)
    }
  }
  return out
}

/**
 * 判定"元素体里有没有文字"。
 *
 * 规则：把每个 `{...}` 展开成"**内部剥掉标签后的剩余内容**" ——
 *   · `{label}`                        → `label`（变量渲染的是文字）
 *   · `{cond ? <Loader2/> : '测试'}`    → `'测试'`（标签剥掉，文字留下）
 *   · `<Loader2 size={13} />` 这类标签  → 整体剥掉，不留文字
 * 再剥掉所有标签，看剩下有没有文字。
 *
 * 三次修正的假阳性（都是这一条规则在起作用）：
 *   1. `{busy ? <Loader2/> : '测试连接'}` 整个当空 → 误判无文字
 *   2. `{label}` 当空                      → 误判无文字
 *   3. `{cond ? (<>测试中...</>) : (<>测试</>)}` 只看"含 `<`"就跳过，
 *      没剥里面的标签再看剩余文字 → 误判无文字
 */
function stripJsxExpr(s) {
  let prev = ''
  let out = s
  while (out !== prev) {
    prev = out
    out = out.replace(/\{([^{}]*)\}/g, (_, inner) => ` ${inner.replace(/<[^>]*>/g, ' ')} `)
  }
  return out
}

/** 从元素内容里猜图标组件名（第一个大写开头的自闭合标签） */
function guessIcon(inner) {
  const m = /<([A-Z][A-Za-z0-9_]*)\b/.exec(inner)
  return m ? m[1] : '(无图标标签)'
}

/** 就近上下文：取按钮开头前 200 字符里最近的函数名 / 注释，辅助判断语义 */
function nearbyContext(whole, pos) {
  const before = whole.slice(Math.max(0, pos - 400), pos)
  const fn = [...before.matchAll(/(?:function|const)\s+(\w+)/g)].pop()
  const comment = [...before.matchAll(/\/\*+\s*([^*\n]{4,60})|\/\/\s*(.{4,60})/g)].pop()
  return {
    fn: fn ? fn[1] : '',
    comment: comment ? (comment[1] || comment[2] || '').trim() : '',
  }
}

const rows = []
for (const f of await walk(SRC)) {
  const text = await readFile(f, 'utf8')
  const re = /<button\b([\s\S]{0,1200}?)<\/button>/g
  let m
  while ((m = re.exec(text))) {
    const attrs = m[1]
    if (/aria-label/.test(attrs)) continue
    const body = attrs.slice(attrs.indexOf('>') + 1)
    const stripped = stripJsxExpr(body).replace(/<[^>]*>/g, '')
    if (/[A-Za-z\u4e00-\u9fa5]/.test(stripped)) continue // 有可见文字

    const icon = guessIcon(body)
    // 图标名无法推断语义的（Loader2 / RefreshCw 等），给出图标名供人工判断
    const line = text.slice(0, m.index).split('\n').length
    const { fn, comment } = nearbyContext(text, m.index)
    rows.push({
      file: f.replace(/\\/g, '/').replace(/^.*?src\/renderer\/src\//, ''),
      line,
      icon,
      fn,
      comment,
    })
  }
}

const lines = [
  `# 缺可访问名的图标按钮（${rows.length} 个）`,
  '',
  '`图标` 是该按钮内唯一的图形元素；`所在函数/邻近注释` 用于推断语义。',
  '推断不出语义的（如 Loader2 这类纯状态图标）需要人工确认。',
  '',
  '| # | 文件 | 行 | 图标 | 所在函数 | 邻近注释 |',
  '|---|---|---|---|---|---|',
  ...rows.map((r, i) => `| ${i + 1} | \`${r.file}\` | ${r.line} | ${r.icon} | ${r.fn} | ${r.comment} |`),
  '',
]
await writeFile('deliverables/unlabeled-icon-buttons.md', lines.join('\n'), 'utf8')
console.log(`找到 ${rows.length} 个，已写入 deliverables/unlabeled-icon-buttons.md`)
