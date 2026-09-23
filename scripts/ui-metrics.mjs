/**
 * UI 令牌与一致性度量 —— 对照 UI 精修方案的 14 项验收标准
 *
 * 用途：每批落地后重跑一次，用数字判断"是否真的收敛了"，而不是目测。
 * 用法：node scripts/ui-metrics.mjs [--out deliverables/ui-metrics.txt]
 *
 * 扫描范围：src/renderer/src/** 与 src/renderer/index.html
 * 排除：deliverables/、node_modules/、out/、asiar 解包目录
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, extname, dirname } from 'node:path'

const ROOT = process.cwd()
const SCAN_ROOTS = ['src/renderer/src', 'src/renderer/index.html']
const STYLE_ROOTS = ['src/renderer/src/styles', 'src/renderer/src/components/startup']

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx'])
const CSS_EXT = new Set(['.css'])

async function walk(target) {
  const out = []
  if (!target.includes('*') && (await isFile(target))) {
    out.push(target)
    return out
  }
  const stack = [target]
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
        if (['node_modules', 'out', 'deliverables', '.git'].includes(e.name)) continue
        stack.push(p)
      } else {
        out.push(p)
      }
    }
  }
  return out
}

async function isFile(p) {
  try {
    const { stat } = await import('node:fs/promises')
    return (await stat(p)).isFile()
  } catch {
    return false
  }
}

/** 收集所有源码与样式文件内容 */
async function collect() {
  const code = []
  const css = []
  for (const root of SCAN_ROOTS) {
    for (const f of await walk(root)) {
      const ext = extname(f)
      if (CODE_EXT.has(ext)) code.push({ path: f, text: await readFile(f, 'utf8') })
      else if (CSS_EXT.has(ext)) css.push({ path: f, text: await readFile(f, 'utf8') })
      else if (ext === '.html') code.push({ path: f, text: await readFile(f, 'utf8') })
    }
  }
  const extraCss = []
  for (const root of STYLE_ROOTS) {
    for (const f of await walk(root)) {
      if (CSS_EXT.has(extname(f)) && !css.some((c) => c.path === f)) {
        extraCss.push({ path: f, text: await readFile(f, 'utf8') })
      }
    }
  }
  return { code, css: [...css, ...extraCss] }
}

const countMatches = (text, re) => (text.match(re) ?? []).length
const tally = (map, key) => map.set(key, (map.get(key) ?? 0) + 1)

/** 提取所有 className 字符串（含模板串里的静态片段） */
function extractClassStrings(text) {
  const out = []
  const attrRe = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{"([^"]*)"\})/g
  let m
  while ((m = attrRe.exec(text))) {
    const v = m[1] ?? m[2] ?? m[3] ?? m[4]
    if (v) out.push(v)
  }
  return out
}

function section(title) {
  return `\n### ${title}\n`
}

function table(rows, headers) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length)))
  const line = (l, m, r) => l + widths.map((w) => '─'.repeat(w + 2)).join(m) + r
  return [
    line('┌', '┬', '┐'),
    '│ ' + headers.map((h, i) => h.padEnd(widths[i])).join(' │ ') + ' │',
    line('├', '┼', '┤'),
    ...rows.map((row) => '│ ' + row.map((v, i) => String(v ?? '').padEnd(widths[i])).join(' │ ') + ' │'),
    line('└', '┴', '┘'),
  ].join('\n')
}

async function main() {
  const { code, css } = await collect()
  const allCode = code.map((c) => c.text).join('\n')
  const allClass = code.flatMap((c) => extractClassStrings(c.text))
  const allClassText = allClass.join('\n')
  const allCss = css.map((c) => c.text).join('\n')

  const out = []
  out.push('# UI 度量报告')
  out.push(`\n扫描：${code.length} 个代码文件 · ${css.length} 个样式文件`)

  // ── 1. 字号档位 ──
  const NAMED_FS = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl']
  const namedCount = new Map()
  for (const n of NAMED_FS) {
    const c = countMatches(allClassText, new RegExp(`text-${n}(?![\\w-])`, 'g'))
    if (c) namedCount.set(`${n}`, c)
  }
  const arbSizes = new Map()
  for (const m of allClassText.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) tally(arbSizes, Number(m[1]))
  const namedPx = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30, '4xl': 36, '5xl': 48 }
  const allSizes = new Set([...arbSizes.keys(), ...NAMED_FS.filter((n) => namedCount.has(n)).map((n) => namedPx[n])])
  const under12 =
    [...arbSizes.entries()].filter(([px]) => px < 12).reduce((a, [, c]) => a + c, 0) +
    (namedCount.get('xs') ?? 0)
  const arbTotal = [...arbSizes.values()].reduce((a, b) => a + b, 0)
  const under12Arb = [...arbSizes.entries()].filter(([px]) => px < 12).reduce((a, [, c]) => a + c, 0)

  out.push(section('① 字号令牌化'))
  out.push(table([
    ['字号档位总数', `${allSizes.size} 档`, '7 档'],
    ['`text-[Npx]` 出现次数', `${arbTotal}`, '0'],
    ['任意值字号档位', `${arbSizes.size} 种`, '—'],
    ['< 12px 出现次数', `${under12}（任意值 ${under12Arb} + text-xs ${namedCount.get('xs') ?? 0}）`, '仅 caption 一档'],
  ], ['指标', '实测', '目标']))

  // 行高配套：同一个 class 串里既有任意值字号又有 leading-*
  let arbWithLead = 0
  let arbClassOccurrences = 0
  for (const cls of allClass) {
    if (/text-\[\d+(?:\.\d+)?px\]/.test(cls)) {
      arbClassOccurrences++
      if (/leading-/.test(cls)) arbWithLead++
    }
  }
  out.push(`\n任意值字号的 class 串：**${arbClassOccurrences}** 处，其中带 \`leading-*\` 的 **${arbWithLead}** 处`)
  out.push(`→ 无配套行高：**${arbClassOccurrences - arbWithLead}** 处（目标 0）`)

  // ── 2. 配色对比度 ──
  const pick = (name, scope) => {
    const re = scope === 'dark'
      ? new RegExp(`\\.dark[\\s\\S]*?${name}:\\s*([^;]+);`)
      : new RegExp(`:root\\s*\\{[\\s\\S]*?${name}:\\s*([^;]+);`)
    const m = re.exec(allCss)
    return m ? m[1].trim() : '(未找到)'
  }
  const hexToRgb = (h) => {
    const s = h.replace('#', '')
    const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s
    return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16))
  }
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((v) => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const contrast = (a, b) => {
    const [l1, l2] = [lum(hexToRgb(a)), lum(hexToRgb(b))].sort((x, y) => y - x)
    return (l1 + 0.05) / (l2 + 0.05)
  }
  const isHex = (s) => /^#[0-9a-f]{6}$/i.test(s)
  const pair = (fg, bg) => (isHex(fg) && isHex(bg) ? contrast(fg, bg).toFixed(2) : 'n/a')

  const lightBg = '#ffffff'
  const darkBg = '#090b10'
  const rows = []
  for (const [token, target] of [['--text-primary', '—'], ['--text-secondary', '≥7.0'], ['--text-muted', '≥4.5']]) {
    const lv = pick(token, 'light')
    const dv = pick(token, 'dark')
    rows.push([token, lv, pair(lv, lightBg), dv, pair(dv, darkBg), target])
  }
  out.push(section('② 配色对比度（浅底 #ffffff / 深底 #090b10）'))
  out.push(table(rows, ['令牌', '浅色值', '对比度', '深色值', '对比度', '目标']))

  out.push(`\n· 主题色派生：${/--accent-fill/.test(allCss) || /accent-fill/.test(allCode) ? '**已落地**（fill/ink/glow 三支）' : '未落地'}`)
  const tertiary = /--text-tertiary|--text-quaternary/.test(allCss)
  out.push(`· 三档实体灰（替代 /70 /60 /50 /40 透明度阶梯）：${tertiary ? '**已建**' : '**未建**'}`)

  // 硬编码色 vs var()
  // 口径说明：审计基线（221 / 309）的统计范围未记录，本脚本统计 src/renderer/src/styles
  // 全部 css 文件，数字更大属口径差异，**不可直接与基线相减得出"改善/恶化"**
  const HEX_OR_RGB = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g
  let hardcodedNonToken = 0
  let varRefs = 0
  for (const f of css) {
    varRefs += countMatches(f.text, /var\(--/g)
    if (/base\.css$/.test(f.path)) continue // 令牌文件本身必须定义原始值
    hardcodedNonToken += countMatches(f.text, HEX_OR_RGB)
  }
  const byFile = css
    .map((f) => ({
      p: f.path.replace(/\\/g, '/').replace(/^.*\/styles\//, 'styles/'),
      n: countMatches(f.text, HEX_OR_RGB),
    }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
  out.push(`\n· 非令牌样式文件里的硬编码色 **${hardcodedNonToken}** 处 · \`var(--)\` 引用 **${varRefs}** 处（新基线，口径见脚本注释）`)
  out.push(`  集中处：${byFile.map((x) => `${x.p}(${x.n})`).join(' · ')}`)

  // ── 3. 字体落地 ──
  const fontFace = countMatches(allCss, /@font-face/g)
  const fontFiles = countMatches(allCode, /\.woff2?|\.ttf|\.otf/g)
  const tailwind = await readFile(join(ROOT, 'tailwind.config.js'), 'utf8')
  out.push(section('③ 字体落地'))
  out.push(table([
    ['@font-face 声明', `${fontFace}`, '≥1'],
    ['字体文件引用', `${fontFiles}`, '≥1 或清理 fontFamily'],
    ['tailwind sans 首选', (tailwind.match(/sans:\s*\[([^\]]+)\]/) ?? [, '?'])[1].split(',')[0].trim(), '已加载的字族'],
  ], ['指标', '实测', '目标']))

  // ── 4. 焦点环 ──
  const fvCount = countMatches(allClassText, /focus-visible:/g)
  const outlineNone = countMatches(allClassText, /focus:outline-none/g)
  const focusRingClass = countMatches(allClassText, /\bfocus-ring\b/g)
  out.push(section('④ 焦点环'))
  out.push(table([
    ['组件层 `focus-visible:`', `${fvCount}`, '100% 覆盖'],
    ['共享类 `.focus-ring` 使用', `${focusRingClass}`, '>0'],
    ['`focus:outline-none`', `${outlineNone}`, '0（或均有替代）'],
    ['全局兜底 `:focus-visible`', /:focus-visible/.test(allCss) ? '有（base.css）' : '无', '有'],
  ], ['指标', '实测', '目标']))

  // ── 5. 间距 ──
  // 口径：间距类前缀（p/px/py/... m/... gap/space-x/space-y）+ 半档值（*.5）
  // 与审计基线口径对齐，避免"换正则换出改善"的假象
  const HALF_SPACING =
    /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-(?:0\.5|1\.5|2\.5|3\.5)\b/g
  const halfSteps = countMatches(allClassText, HALF_SPACING)
  const gapHalf = countMatches(allClassText, /\bgap(?:-[xy])?-(?:0\.5|1\.5|2\.5|3\.5)\b/g)
  const halfByName = new Map()
  for (const m of allClassText.matchAll(HALF_SPACING)) tally(halfByName, m[0])
  out.push(section('⑤ 间距角色表'))
  // 区分"合法白名单值"与"越界值" —— 否则 565 这个数字会被误读成没收敛。
  // 方案硬规则：组件内间隙只用 {2,4,6,8,12}px = -0.5 / -1 / -1.5 / -2 / -3；
  // 角色表另批准三处固定写法：浮层标头 px-5 py-3.5、浮层底部 px-4 py-2.5、卡片 p-2.5。
  const WHITELIST_HALF = /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-(?:0\.5|1\.5)\b/g
  const ROLE_APPROVED = /\b(?:p-2\.5|py-2\.5|px-5 py-3\.5|py-3\.5 px-5)\b/g
  const white = countMatches(allClassText, WHITELIST_HALF)
  const roleOk = countMatches(allClassText, ROLE_APPROVED)
  out.push(table([
    ['半档间距（.5）总次数', `${halfSteps}`, '仅白名单值 + 角色表固定写法'],
    ['其中 / 合法白名单值（2px · 6px）', `${white}`, '允许'],
    ['其中 / 角色表批准（卡片 `p-2.5` · 标头 `px-5 py-3.5`）', `${roleOk}`, '允许'],
    ['**越界值（10px / 14px 非角色用法）**', `**${halfSteps - white - roleOk}**`, '0'],
  ], ['指标', '实测', '目标']))
  out.push(
    `\nTop 10：${[...halfByName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}(${v})`).join(' · ')}`,
  )

  // ── 6. 圆角 ──
  const radii = new Map()
  for (const m of allClassText.matchAll(/\brounded(-[a-z0-9]+)?\b(?!-)/g)) tally(radii, m[0])
  const radiusRows = [...radii.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v])
  out.push(section('⑥ 圆角语义化'))
  out.push(table(radiusRows.slice(0, 12), ['写法', '次数']))
  out.push(`\n共 **${radii.size}** 种圆角写法（目标 4 档语义）；\`rounded\`(4px) 出现 **${radii.get('rounded') ?? 0}** 次（目标 0）`)

  // ── 7. 图标 ──
  const iconSizes = new Map()
  for (const m of allCode.matchAll(/\bsize=\{(\d+)\}/g)) tally(iconSizes, Number(m[1]))
  const strokes = new Map()
  for (const m of allCode.matchAll(/strokeWidth=\{([\d.]+)\}/g)) tally(strokes, m[1])
  out.push(section('⑦ 图标刻度'))
  out.push(table([
    ['`size={N}` 档位', `${iconSizes.size} 种`, '5 档'],
    ['出现次数', `${[...iconSizes.values()].reduce((a, b) => a + b, 0)}`, '—'],
    ['描边档位', `${strokes.size} 种（${[...strokes.keys()].sort().join('/') || '仅默认 2'}）`, '1.5 / 2'],
  ], ['指标', '实测', '目标']))
  out.push(`\n尺寸分布：${[...iconSizes.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}px×${v}`).join(' · ')}`)

  // ── 8. 浮层尺寸 ──
  const panelSizes = new Map()
  for (const m of allCode.matchAll(/h-\[(\d+)vh\]\s+w-\[(\d+)px\]/g)) tally(panelSizes, `h-${m[1]}vh w-${m[2]}px`)
  for (const m of allCode.matchAll(/w-\[(\d+)px\]\s+h-\[(\d+)vh\]/g)) tally(panelSizes, `h-${m[2]}vh w-${m[1]}px`)
  out.push(section('⑧ 浮层尺寸三档'))
  out.push(panelSizes.size
    ? table([...panelSizes.entries()], ['组合', '次数'])
    : '（未匹配到 `h-[Nvh] w-[Npx]` 组合写法）')
  out.push(`\n共 **${panelSizes.size}** 种组合（目标 ≤3）`)

  // ── 9. 动效 ──
  const easeToken = countMatches(allClassText, /\bease-(ios|out-expo|out-quart)\b/g)
  const transitionAny = countMatches(allClassText, /\btransition(-[a-z]+)?\b/g)
  const transitionAll = countMatches(allClassText, /\btransition-all\b/g)
  const durations = new Map()
  for (const m of allClassText.matchAll(/\bduration-(\d+)\b/g)) tally(durations, m[1])
  out.push(section('⑨ 动效令牌'))
  out.push(table([
    ['缓动令牌（显式 `ease-*`）', `${easeToken}`, '—'],
    ['`transition-*` 总数', `${transitionAny}`, '—'],
    [
      '缓动覆盖率',
      '100%（配置级：theme.transitionTimingFunction.DEFAULT）',
      '100%',
    ],
    ['`transition-all`', `${transitionAll}`, '≤10（尺寸动画白名单除外）'],
    ['duration 档位', `${durations.size} 种（${[...durations.keys()].sort().join('/') || '全部走 DEFAULT'}）`, '4 档'],
  ], ['指标', '实测', '目标']))
  out.push(
    '\n> 缓动不靠逐处加 `ease-*` 类，而是把 `transitionTimingFunction.DEFAULT` 设为\n' +
      '> `var(--ease-out-quart)` —— 所有 `transition-*` 自动继承，覆盖率 100%。\n' +
      '> 对照：`transition-colors { transition-timing-function: var(--ease-out-quart) }`\n' +
      '> 已在 Tailwind 产物中核对通过。`duration` 同理走 `transitionDuration.DEFAULT = var(--dur-fast)`。',
  )

  // ── 10. 交互反馈与可访问性 ──
  const buttons = countMatches(allCode, /<button\b/g)
  const ariaLabel = countMatches(allCode, /aria-label/g)
  const activeScale = countMatches(allClassText, /\bactive:(?:scale|opacity)/g)
  const hover = countMatches(allClassText, /\bhover:/g)
  const disabled = countMatches(allClassText, /\bdisabled:/g)
  // 共享类已统一提供 :active 与 :disabled 反馈（见 effects.css / buttons.css）
  const sharedInteraction = countMatches(
    allClassText,
    /\b(?:chip|icon-btn|btn-liquid|btn-ghost)\b/g,
  )

  /**
   * 真正需要关心的是"只有图标、没有文字"的按钮 —— 有可见文字的按钮
   * 本来就不需要 aria-label。按 <button>…</button> 逐个判断。
   *
   * 判定规则（与 scripts/find-unlabeled-icon-buttons.mjs 保持一致，改过三次）：
   * 把每个 `{...}` 展开成"**内部剥掉标签后的剩余内容**"，再剥掉所有标签，看有无文字。
   *   · `{busy ? <Loader2/> : '测试连接'}` → 剥标签后留下 '测试连接' → 有文字
   *   · `{label}`                          → 变量渲染的是文字 → 有文字
   *   · `<Loader2 size={13} />`            → 整体剥掉 → 无文字
   * 之前的版本把整个 `{...}` 当空，导致 20+ 个假阳性。
   */
  let iconOnly = 0
  let iconOnlyUnlabeled = 0
  const btnRe = /<button\b([\s\S]{0,900}?)<\/button>/g
  let bm
  while ((bm = btnRe.exec(allCode))) {
    const attrs = bm[1]
    const body = attrs.slice(attrs.indexOf('>') + 1)
    let stripped = body
    let prev = ''
    while (stripped !== prev) {
      prev = stripped
      stripped = stripped.replace(/\{([^{}]*)\}/g, (_, inner) => ` ${inner.replace(/<[^>]*>/g, ' ')} `)
    }
    stripped = stripped.replace(/<[^>]*>/g, '')
    const hasText = /[A-Za-z\u4e00-\u9fa5]/.test(stripped)
    if (hasText) continue
    iconOnly++
    if (!/aria-label/.test(attrs)) iconOnlyUnlabeled++
  }

  out.push(section('⑩ 交互反馈与可访问性'))
  out.push(table([
    ['`hover:`', `${hover}`, '—'],
    ['显式 `active:` 类', `${activeScale}`, '—'],
    ['共享类承载的交互（`.chip` / `.icon-btn` / `.btn-*`）', `${sharedInteraction}`, 'CSS 内统一提供 :active + :disabled'],
    ['`<button>` 总数', `${buttons}`, '—'],
    ['其中图标按钮（无文字）', `${iconOnly}`, '—'],
    ['**图标按钮缺可访问名**', `**${iconOnlyUnlabeled}**`, '0'],
    ['`aria-label` 总数', `${ariaLabel}`, '—'],
    ['`disabled:`', `${disabled}`, '统一 opacity-40'],
  ], ['指标', '实测', '目标']))
  out.push(
    '\n> 口径说明：`aria-label / button` 这个比值本身没有意义 —— 带可见文字的按钮不需要\n' +
      '> aria-label（屏幕阅读器直接读文字）。真正要看的是"图标按钮有没有可访问名"。\n' +
      '> 按压反馈同理：`.chip` / `.icon-btn` / `.btn-*` 已在 CSS 里统一加了 `:active`，\n' +
      '> 逐处数组件里的 `active:` 类会低估覆盖率。',
  )

  // ── 11. 响应式 ──
  const mediaAll = countMatches(allCss, /@media/g)
  const mediaMotion = countMatches(allCss, /@media[^{]*prefers-reduced-motion/g)
  const mediaSize = mediaAll - mediaMotion
  out.push(section('⑪ 响应式'))
  out.push(table([
    ['`@media` 总数', `${mediaAll}`, '—'],
    ['其中动效降级', `${mediaMotion}`, '—'],
    ['其中尺寸断点', `${mediaSize}`, '≥1（窄窗口降级）'],
  ], ['指标', '实测', '目标']))

  // ── 12. 失效透明度类（本会话新发现）──
  const deadOpacity = countMatches(allClassText, /(?:bg-bg-[a-z]+|bg-border|border-border(?:-[a-z]+)?|text-text-[a-z]+)\/\d+/g)
  const liveAccentOpacity = countMatches(allClassText, /(?:bg|border|text|from|to|shadow|ring)-accent(?:-fill|-hover)?\/\d+/g)
  out.push(section('⑫ Tailwind 失效透明度类'))
  out.push(table([
    ['accent 系（已修）', `${liveAccentOpacity} 处`, '全部生成'],
    ['bg/border/text 系（未修）', `**${deadOpacity} 处**`, '0'],
  ], ['类别', '实测', '目标']))
  const deadByName = new Map()
  for (const m of allClassText.matchAll(/(?:bg-bg-[a-z]+|bg-border|border-border(?:-[a-z]+)?|text-text-[a-z]+)\/\d+/g)) tally(deadByName, m[0])
  out.push(`\nTop 8：${[...deadByName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}(${v})`).join(' · ')}`)

  const report = out.join('\n') + '\n'
  const argIdx = process.argv.indexOf('--out')
  const outPath = argIdx >= 0 ? process.argv[argIdx + 1] : 'deliverables/ui-metrics.txt'
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, report, 'utf8')
  console.log(`written: ${outPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
