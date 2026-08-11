/**
 * 引用验证 — 确认死代码/重复文件的可删除性
 * 运行：node scripts/verify-refs.cjs
 */
const fs = require('fs')
const path = require('path')

const ROOT = 'E:/ximo2/ximo-Agent'

function walk(dir, out = [], depth = 0) {
  if (depth > 8) return out
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name)
    if (f.name === 'node_modules' || f.name === '.git' || f.name === 'out' || f.name === 'dist' || f.name === 'release' || f.name === '.qoder' || f.name === '.trae') continue
    if (f.isDirectory()) walk(full, out, depth + 1)
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(f.name) && !f.name.includes('.test.')) out.push(full)
  }
  return out
}

const allFiles = walk(path.join(ROOT, 'src'))
const testFiles = walk(path.join(ROOT, 'tests'))
const combined = [...allFiles, ...testFiles]

function grep(pattern) {
  const hits = []
  for (const f of combined) {
    try {
      const c = fs.readFileSync(f, 'utf8')
      if (c.includes(pattern)) hits.push(f.replace(ROOT + '/', ''))
    } catch { }
  }
  return hits
}

const targets = [
  ['slices/streamSlice', 'streamSlice 引用'],
  ['slices/conversationSlice', 'conversationSlice 引用'],
  ['createStreamSlice', 'createStreamSlice 引用'],
  ['createConversationSlice', 'createConversationSlice 引用'],
  ['StreamSlice', 'StreamSlice 类型引用'],
  ['ConversationSlice', 'ConversationSlice 类型引用'],
  ['font-cache', 'font-cache.ts 引用'],
  ['useSystemFonts', 'useSystemFonts 引用'],
]

console.log('='.repeat(70))
for (const [pattern, label] of targets) {
  const hits = grep(pattern)
  console.log(`\n【${label}】`)
  if (hits.length === 0) {
    console.log('  无引用（除文件自身外）→ 可删除')
  } else {
    for (const h of hits) console.log(`  - ${h}`)
  }
}
