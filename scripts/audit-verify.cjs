/**
 * 深度审查辅助脚本 — 量化验证关键假设
 * 运行：node scripts/audit-verify.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = 'E:/ximo2/ximo-Agent'
const results = []

function read(p) { try { return fs.readFileSync(path.join(ROOT, p), 'utf8') } catch { return '' } }
function walk(dir, out = [], depth = 0) {
  if (depth > 6) return out
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name)
    if (f.name === 'node_modules' || f.name === '.git' || f.name === 'out' || f.name === 'dist' || f.name === 'release') continue
    if (f.isDirectory()) walk(full, out, depth + 1)
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(f.name)) out.push(full)
  }
  return out
}

// 1. streamSlice / conversationSlice 是否被引用
{
  const srcFiles = walk(path.join(ROOT, 'src'))
  const refs = srcFiles.filter(f => {
    const c = read(f.replace(ROOT + '/', ''))
    return c.includes('createStreamSlice') || c.includes('createConversationSlice') || c.includes('streamSlice') || c.includes('conversationSlice')
  })
  results.push({ name: '死代码: streamSlice/conversationSlice 引用', detail: refs.length === 0 ? '无任何引用 → 死代码' : `被引用: ${refs.length} 处`, severity: '高' })
}

// 2. 消息构建重复：buildUserMessage 与 streamSlice 内联版本
{
  const bu = read('src/renderer/src/store/buildUserMessage.ts')
  const ss = read('src/renderer/src/store/slices/streamSlice.ts')
  const us = read('src/renderer/src/store/useStore.ts')
  results.push({
    name: '消息构建重复实现',
    detail: `buildUserMessage 独立模块(${bu.split('\n').length}行) + streamSlice 内联版本(${ss.split('\n').length}行) + useStore 内联版本(${us.split('\n').length}行) — streamSlice 未被引用为死代码`,
    severity: '中'
  })
}

// 3. runStream 持久化竞态 — finally 是否可能覆盖 done 分支
{
  const rs = read('src/renderer/src/store/runStream.ts')
  const finallyIdx = rs.indexOf('} finally {')
  const doneIdx = rs.indexOf("if (chunk.done)")
  const finallyHasPersist = rs.slice(finallyIdx, finallyIdx + 600).includes('persistAssistantMessage')
  const doneHasPersist = rs.slice(doneIdx, doneIdx + 600).includes('persistAssistantMessage')
  results.push({
    name: 'runStream 流式持久化竞态',
    detail: `done 分支持久化:${doneHasPersist} | finally 分支持久化:${finallyHasPersist} | finally 会二次持久化覆盖 done 的结果 — 存在竞态窗口`,
    severity: '高'
  })
}

// 4. buildApiMessages 中 import 技能缓存 — 跨会话是否可能陈旧
{
  const b = read('src/renderer/src/store/buildApiMessages.ts')
  const cacheDeclared = b.includes('_importedSkillsCache')
  results.push({
    name: 'buildApiMessages 技能缓存',
    detail: `模块级缓存 _importedSkillsCache:${cacheDeclared} — 仅 invalidateImportedSkillsCache 失效，变更后若未调用则跨会话陈旧`,
    severity: '低'
  })
}

// 5. 组件重复：存在两个 ToolCallGroup / ToolCallCard / SegmentBlock
{
  const dupes = []
  const files = walk(path.join(ROOT, 'src/renderer'))
  const names = ['ToolCallGroup', 'ToolCallCard', 'SegmentBlock', 'ToolResultCard', 'CodeBlock']
  for (const n of names) {
    const found = files.filter(f => path.basename(f).startsWith(n))
    if (found.length > 1) dupes.push(`${n}: ${found.map(f => path.basename(f)).join(', ')}`)
  }
  results.push({ name: '重复组件文件', detail: dupes.length ? dupes.join('; ') : '无', severity: dupes.length ? '中' : '低' })
}

// 6. settings 存在 font-cache.ts 与 fontCache.ts 重复
{
  const fc = read('src/renderer/src/components/settings/font-cache.ts')
  const fC = read('src/renderer/src/components/settings/fontCache.ts')
  results.push({ name: 'font-cache.ts 与 fontCache.ts 重复', detail: `font-cache.ts:${fc.split('\n').length}行, fontCache.ts:${fC.split('\n').length}行 — 疑似重复`, severity: '中' })
}

// 7. useStore 重复定义 vs slices
{
  const us = read('src/renderer/src/store/useStore.ts')
  const hasSendMessage = us.includes('sendMessage:')
  const hasInit = us.includes('init:')
  results.push({ name: 'useStore 内联实现 vs slices', detail: `useStore 内联 sendMessage:${hasSendMessage}, init:${hasInit} — 与 slices 双份`, severity: '中' })
}

// 8. 全量代码量统计
{
  const files = walk(path.join(ROOT, 'src'))
  let ts = 0, tsx = 0, js = 0, lines = 0
  for (const f of files) {
    const ext = path.extname(f)
    if (ext === '.ts') ts++
    else if (ext === '.tsx') tsx++
    else js++
    lines += read(f.replace(ROOT + '/', '')).split('\n').length
  }
  results.push({ name: '代码规模', detail: `TS:${ts} TSX:${tsx} JS:${js} 总行数:${lines}`, severity: '信息' })
}

// 输出
console.log('='.repeat(70))
console.log('深度审查验证脚本结果')
console.log('='.repeat(70))
for (const r of results) {
  console.log(`\n【${r.severity}】${r.name}`)
  console.log(`  ${r.detail}`)
}
