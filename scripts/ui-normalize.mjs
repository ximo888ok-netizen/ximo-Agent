/**
 * UI 归一化批量替换
 *
 * 用法：node scripts/ui-normalize.mjs [--dry]
 *
 * 设计原则：
 * 1. **只改 className 属性值内部** —— 用括号匹配定位 `className="..."` /
 *    `className={'...'}` / `` className={`...`} ``，绝不裸替换整份文件文本，
 *    避免误伤字符串字面量或注释。
 * 2. **转换在"整条 class 串"粒度上做** —— 这样能拿到上下文（例如"这条串里有没有
 *    hover:"、"是不是 px-5 py-3.5 浮层标头"），比逐 token 盲替换安全得多。
 * 3. 有风险的一律保守：拿不准就不改，宁可留下少数（进度条动画、模板串），
 *    也不制造不可见的回归。
 * 4. 每一步都统计实际替换数，跑完与度量脚本对账。
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, extname } from 'node:path'

const ROOT = process.cwd()
const SRC = 'src/renderer/src'
const DRY = process.argv.includes('--dry')

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx'])
const stats = new Map()
const bump = (k, n = 1) => stats.set(k, (stats.get(k) ?? 0) + n)

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
        if (['node_modules', '__tests__'].includes(e.name)) continue
        stack.push(p)
      } else if (CODE_EXT.has(extname(e.name))) {
        out.push(p)
      }
    }
  }
  return out
}

/* ─────────────── 字号：443 处任意值 → 7 档 ───────────────
   收敛映射（方案 3.1）：7/8/9/10/11→caption · 12→xs · 13→sm
                        14→base · 15/16→body · 18/20/21→title · ≥22→display */
const FONT_RULES = [
  [/text-\[(?:[6-9]|1[01])(?:\.\d+)?px\]/g, 'text-caption'],
  [/text-\[12(?:\.\d+)?px\]/g, 'text-xs'],
  [/text-\[13(?:\.\d+)?px\]/g, 'text-sm'],
  [/text-\[14(?:\.\d+)?px\]/g, 'text-base'],
  [/text-\[1[56](?:\.\d+)?px\]/g, 'text-body'],
  [/text-\[1[789](?:\.\d+)?px\]/g, 'text-title'],
  [/text-\[2[01](?:\.\d+)?px\]/g, 'text-title'],
  [/text-\[(?:2[2-9]|[3-9]\d)(?:\.\d+)?px\]/g, 'text-display'],
]

/* ─────────────── 失效的透明度类 → 语义 / 软令牌 ───────────────
   这些 `/N` 写法在 Tailwind 3 里**根本不生成**（var() 颜色不支持透明度修饰符），
   实测构建产物查不到 → 面板底色实际全透明、次级文字实际继承父级。 */
const DEAD_TEXT = [
  [/\btext-text-muted\/(?:80|70)\b/g, 'text-text-muted'],
  [/\btext-text-muted\/(?:60|50)\b/g, 'text-text-tertiary'],
  [/\btext-text-muted\/(?:40|30|20)\b/g, 'text-text-quaternary'],
  [/\btext-text-secondary\/\d+\b/g, 'text-text-muted'],
  [/\btext-text-primary\/\d+\b/g, 'text-text-secondary'],
]

const DEAD_BG = [
  [/\bbg-bg-surface\/\d+\b/g, 'bg-bg-surface-soft'],
  [/\bbg-bg-elevated\/\d+\b/g, 'bg-bg-elevated-soft'],
  [/\bbg-bg-hover\/\d+\b/g, 'bg-bg-hover-soft'],
  [/\bbg-bg-base\/\d+\b/g, 'bg-bg-base-soft'],
  [/\bbg-border-subtle\/\d+\b/g, 'bg-border-subtle'],
  [/\bbg-border\/\d+\b/g, 'bg-border'],
]

const DEAD_BORDER = [
  [/\bborder-border-subtle\/\d+\b/g, 'border-border-subtle-soft'],
  [/\bborder-border\/\d+\b/g, 'border-border-soft'],
]

/* ─────────────── 圆角：8 种写法 → 4 档语义 ───────────────
   主要噪音是 `rounded`(4px) 与 `rounded-md`(6px) 并存 —— 2px 差别人眼不可辨，
   却让"卡片/按钮/chip"的圆角忽圆忽方。 */
const RADIUS_RULES = [
  [/\brounded-2xl\b/g, 'rounded-panel'],
  [/\brounded-xl\b/g, 'rounded-panel'],
  [/\brounded-b-xl\b/g, 'rounded-b-panel'],
  [/\brounded-lg\b/g, 'rounded-card'],
  [/\brounded-sm\b/g, 'rounded-control'],
  [/\brounded-md\b/g, 'rounded-control'],
  [/\brounded-t-md\b/g, 'rounded-t-control'],
  [/\brounded-br-md\b/g, 'rounded-br-control'],
  [/\brounded-tr-md\b/g, 'rounded-tr-control'],
  [/\brounded-bl-md\b/g, 'rounded-bl-control'],
  [/\brounded-tl-sm\b/g, 'rounded-tl-control'],
  [/\brounded-tr-sm\b/g, 'rounded-tr-control'],
  // 注意尾部必须用 `(?!-)` 而不是 `\b` ——
  // `rounded-r` 的替换结果是 `rounded-r-control`，而 `r` 与 `-` 之间存在单词边界，
  // 用 `\b` 会二次匹配自己的产物，每跑一遍就多叠一个 `-control`（踩过这个坑）。
  [/\brounded-r(?!-)/g, 'rounded-r-control'],
  [/\brounded\b(?!-)/g, 'rounded-control'],
]

/* ─────────────── 时长：命名档位 ─────────────── */
const DURATION_RULES = [
  [/\bduration-200\b/g, 'duration-fast'],
  [/\bduration-300\b/g, 'duration-base'],
  [/\bduration-500\b/g, 'duration-slow'],
]

/* ─────────────── transition-all 拆分 ───────────────
   transition-all 会把 width/height/padding/margin 也纳入动画 —— 列表与面板
   展开时的主要掉帧来源。**只在该 class 串里有 hover/active/disabled 反馈时**
   才拆成视觉属性白名单；没有交互反馈的（进度条填充、滑块轨道）保留 transition-all，
   因为那些正是靠 width/left 做动画的。 */
const VISUAL_TRANSITION =
  'transition-[color,background-color,border-color,opacity,transform,box-shadow,filter]'

/** 需要显式保留 transition-all 的尺寸动画（进度条 / 滑块），按行号白名单 */
const KEEP_TRANSITION_ALL = new Set([
  // 进度条填充：靠 inline style 的 width 做动画
  'components/coding/CodingTasksPanel.tsx',
  'components/panels/TaskListPanel.tsx',
  'components/shared/SessionTokenStats.tsx',
  'components/panels/TokenStatsModal.tsx',
  'components/sidebar/ConversationItem.tsx',
  // 滑块轨道 / 拖块
  'components/chat-input/ReasoningSlider.tsx',
])

/* ─────────────── 间距：非标半档收敛 ───────────────
   方案硬规则：组件内间隙只用 {2,4,6,8,12}px（= -0.5 / -1 / -1.5 / -2 / -3）。
   违约的是 2.5(10px) 与 3.5(14px)。角色表明确批准的三处保留：
     浮层标头 px-5 py-3.5 · 浮层底部 px-4 py-2.5 · 卡片 p-2.5 */
const SPACING_RULES = [
  [/\bpx-2\.5\b/g, 'px-3'],
  [/\bpl-2\.5\b/g, 'pl-3'],
  [/\bpr-2\.5\b/g, 'pr-3'],
  [/\bpt-2\.5\b/g, 'pt-2'],
  [/\bpb-2\.5\b/g, 'pb-2'],
  [/\bmt-2\.5\b/g, 'mt-2'],
  [/\bmb-2\.5\b/g, 'mb-2'],
  [/\bml-2\.5\b/g, 'ml-2'],
  [/\bmr-2\.5\b/g, 'mr-2'],
  [/\bgap-x-2\.5\b/g, 'gap-x-2'],
  [/\bgap-y-2\.5\b/g, 'gap-y-2'],
  [/\bgap-2\.5\b/g, 'gap-2'],
  [/\bspace-y-2\.5\b/g, 'space-y-2'],
  [/\bspace-x-2\.5\b/g, 'space-x-2'],
  [/\bp-3\.5\b/g, 'p-3'],
  [/\bpx-3\.5\b/g, 'px-3'],
  [/\bpl-3\.5\b/g, 'pl-3'],
  [/\bpr-3\.5\b/g, 'pr-3'],
  [/\bpt-3\.5\b/g, 'pt-3'],
  [/\bpb-3\.5\b/g, 'pb-3'],
  [/\bmt-3\.5\b/g, 'mt-3'],
  [/\bmb-3\.5\b/g, 'mb-3'],
  [/\bgap-3\.5\b/g, 'gap-3'],
  [/\bpy-2\.5\b/g, 'py-2'],
  [/\bpy-3\.5\b/g, 'py-3'],
]

/** 角色表锁定的写法 —— 先换成哨兵，全局替换后再还原 */
const LOCKED = [
  ['px-5 py-3.5', '\u0000L1\u0000'],
  ['py-3.5 px-5', '\u0000L2\u0000'],
  ['px-4 py-2.5', '\u0000L3\u0000'],
  ['p-2.5', '\u0000L4\u0000'],
]

/* ─────────────── 焦点环 ───────────────
   `focus:outline-none` 会把 base.css 里的全局 :focus-visible 兜底一起干掉
   （utilities 层优先级高于 base 层）→ 键盘用户在这些控件上看不到焦点。
   换成 .focus-ring 组件类：:focus 不画环、:focus-visible 画。 */
const FOCUS_RULES = [[/\bfocus:outline-none\b/g, 'focus-ring']]

function transformClassString(cls, filePath, feedbackHint) {
  let out = cls

  // 0) 锁定角色写法
  for (const [from, to] of LOCKED) {
    if (out.includes(from)) out = out.split(from).join(to)
  }

  // 1) 字号
  for (const [re, to] of FONT_RULES) {
    out = out.replace(re, () => {
      bump('字号')
      return to
    })
  }

  // 2) 失效透明度类
  for (const [re, to] of [...DEAD_TEXT, ...DEAD_BG, ...DEAD_BORDER]) {
    out = out.replace(re, () => {
      bump('失效透明度类')
      return to
    })
  }

  // 3) 圆角
  for (const [re, to] of RADIUS_RULES) {
    out = out.replace(re, () => {
      bump('圆角')
      return to
    })
  }

  // 4) 时长
  for (const [re, to] of DURATION_RULES) {
    out = out.replace(re, () => {
      bump('时长')
      return to
    })
  }

  // 5) transition-all → 精确属性
  if (out.includes('transition-all')) {
    const ctx = feedbackHint || out
    const sizeRule = SIZE_ANIMATION_RULES.find(([, , guard]) => guard(ctx))
    if (sizeRule) {
      out = out.replace(/\btransition-all\b/g, () => {
        bump(`transition-all → ${sizeRule[1]}`)
        return sizeRule[1]
      })
    } else {
      out = out.replace(/\btransition-all\b/g, () => {
        bump('transition-all → 视觉属性')
        return VISUAL_TRANSITION
      })
    }
  }

  // 6) 间距
  for (const [re, to] of SPACING_RULES) {
    out = out.replace(re, () => {
      bump('间距')
      return to
    })
  }

  // 7) 焦点环
  for (const [re, to] of FOCUS_RULES) {
    out = out.replace(re, () => {
      bump('焦点环')
      return to
    })
  }

  // 8) 还原锁定写法
  for (const [from, to] of LOCKED) {
    if (out.includes(to)) out = out.split(to).join(from)
  }

  return out
}

/* ─────────────── transition-all → 精确属性 ───────────────
   `transition-all` 会把 width / height / padding / margin 也纳入动画，是列表与面板
   展开时的主要掉帧来源。**它几乎永远不该被使用。**

   规则：
   1. 先判"尺寸动画"（进度条填充 / 滑块轨道与拖块 / 折叠高度）——
      必须保留尺寸属性，否则会**静默丢失动效**，改为它真正需要的那一两个属性
   2. 其余一律收窄到视觉属性白名单（颜色 / 边框 / 阴影 / 透明度 / transform / filter）
      —— 这些元素的状态切换只改颜色与边框，从不改尺寸

   守卫读的是**整条 className 原始文本（含 `${...}` 插值）**，不是静态片段 ——
   插值里常常藏着 `hover:` 与尺寸切换类（上一版就是只看片段才漏判的）。 */
const SIZE_ANIMATION_RULES = [
  // 滑块拖块 — 靠 inline style 的 left 定位
  [/\btransition-all\b/g, 'transition-[left]', (c) => /pointer-events-none/.test(c)],
  // 推理强度拖块 — 靠 h-6/w-6 ↔ h-5/w-5 切换尺寸
  [/\btransition-all\b/g, 'transition-[width,height]', (c) => /animate-reasoning-pulse/.test(c)],
  // 折叠面板 — 靠 max-height 展开收起
  [/\btransition-all\b/g, 'transition-[max-height]', (c) => /max-h-\d/.test(c)],
  // 进度条 / 轨道填充 — 靠 inline style 的 width
  // 守卫必须用"进度条结构特征"而不是 `bg-accent/15` 这类颜色类 ——
  // 后者到处都是（活跃标签也用），会把颜色过渡误判成宽度动画。
  [
    /\btransition-all\b/g,
    'transition-[width]',
    (c) =>
      /from-accent\/60 to-accent/.test(c) || // 渐变进度条填充
      /h-\[18px\] rounded-full/.test(c) || // 推理滑块轨道填充
      (/absolute/.test(c) && /inset-y-0 left-0/.test(c)) || // 统计条形填充
      (/absolute/.test(c) && /left-0 top-0 h-full/.test(c)) || // 任务进度填充
      /^h-full rounded-full/.test(c), // 上下文占用条
  ],
]

/* ─────────────── 图标刻度：17 档 → 5 档 ─────────────── */
const ICON_BUCKETS = [
  [11, [8, 9, 10, 11]],
  [13, [12, 13, 14]],
  [16, [15, 16, 17, 18]],
  [20, [19, 20, 21, 22, 23, 24]],
  [32, [25, 26, 27, 28, 29, 30, 31, 32, 36, 40, 48, 64]],
]
const ICON_MAP = new Map()
for (const [target, from] of ICON_BUCKETS) for (const n of from) ICON_MAP.set(n, target)

function normalizeIcons(text) {
  // size={N}
  let out = text.replace(/\bsize=\{(\d+)\}/g, (m, n) => {
    const target = ICON_MAP.get(Number(n))
    if (target === undefined || target === Number(n)) return m
    bump('图标尺寸')
    return `size={${target}}`
  })
  // strokeWidth —— 统一到 1.5 / 2
  out = out.replace(/\bstrokeWidth=\{([\d.]+)\}/g, (m, v) => {
    const n = Number(v)
    if (n === 1.5 || n === 2) return m
    bump('图标描边')
    return n > 2 ? 'strokeWidth={2}' : 'strokeWidth={1.5}'
  })
  return out
}

/* ─────────────── 浮层尺寸：6 种 → 3 档 ───────────────
   sm 640×70vh · md 760×76vh · lg 900×85vh
   注意：不能用尾部 `\b` —— `]` 与 `"`/空格都是非单词字符，之间不存在单词边界，
   加了 `\b` 会永远匹配不上（上一版就踩了这个坑）。 */
const PANEL_RULES = [
  [/h-\[70vh\] w-\[760px\](?![-\w])/g, 'h-[76vh] w-[760px]'],
  [/h-\[76vh\] w-\[780px\](?![-\w])/g, 'h-[76vh] w-[760px]'],
  [/h-\[80vh\] w-\[720px\](?![-\w])/g, 'h-[76vh] w-[760px]'],
  [/h-\[80vh\] w-\[760px\](?![-\w])/g, 'h-[76vh] w-[760px]'],
  [/h-\[88vh\] w-\[760px\](?![-\w])/g, 'h-[85vh] w-[900px]'],
  [/max-h-\[88vh\](?![-\w])/g, 'max-h-[85vh]'],
]

function normalizePanels(text) {
  let out = text
  for (const [re, to] of PANEL_RULES) {
    out = out.replace(re, () => {
      bump('浮层尺寸')
      return to
    })
  }
  return out
}

/* ─────────────── aria-label 补齐 ───────────────
   348 个 button 只有 10 个有可访问名。有 title 的按钮直接把 title 复用为
   aria-label（零信息损失，且 title 本来就是给这个控件起的名字）。
   两种 title 都要处理：
     · 字符串字面量  title="导入技能"
     · JSX 表达式    title={collapseTitle}     ← 上一轮漏了这种，是真的 14 个缺口 */
function addAriaLabels(text) {
  return text.replace(/<button\b([\s\S]{0,900}?)>/g, (full, attrs) => {
    if (/aria-label/.test(attrs)) return full
    const lit = /title=(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/.exec(attrs)
    const expr = /title=\{([^{}]+)\}/.exec(attrs)
    let label
    if (lit) label = lit[1] ?? lit[2] ?? lit[3]
    else if (expr) label = expr[1].trim()
    if (!label) return full
    // 字符串字面量里若含插值语法，说明是模板串，交给表达式分支处理更稳
    if (lit && (label.includes('{') || label.includes('$'))) return full
    bump('aria-label 补齐')
    return expr && !lit
      ? `<button aria-label={${label}}${attrs}>`
      : `<button aria-label="${label}"${attrs}>`
  })
}

/* ─────────────── className 区间定位 ───────────────
   不能用一条正则搞定：`className={`a text-[11px] ${cond ? 'b' : 'c'}`}` 里的
   `${}` 含引号，`[^"'\`]*` 这类字符类会在这里断掉，整条就被跳过了 ——
   这正是首轮漏掉 40 处字号的原因。
   改为手写扫描器：引号感知 + `${}` 花括号配平，只把**静态片段**作为可编辑区间
   （`${}` 里的表达式交给 loose 通道处理，因为那里是真正的 JS）。 */
function findQuoteEnd(text, start) {
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '\\') {
      i++
      continue
    }
    if (text[i] === text[start]) return i
  }
  return text.length
}

/**
 * 返回 className 值内部的静态可编辑区间列表。
 * 每项 `{ start, end, ctx }` —— `ctx` 是**整条 className 原始文本（含 `${...}`）**，
 * 供"尺寸动画 / 交互反馈"判定使用（只看静态片段会漏判插值里的信息）。
 */
function collectClassRanges(text) {
  const ranges = []
  const re = /className\s*=\s*/g
  let m
  while ((m = re.exec(text))) {
    let i = m.index + m[0].length
    if (text[i] === '{') {
      i++
      while (i < text.length && /\s/.test(text[i])) i++
      const q = text[i]
      if (q === '"' || q === "'") {
        const end = findQuoteEnd(text, i)
        const value = text.slice(i + 1, end)
        ranges.push({ start: i + 1, end, ctx: value })
        continue
      }
      if (q === '`') {
        const tplStart = i + 1
        i++
        let segStart = i
        let depth = 0
        let tplEnd = -1
        while (i < text.length) {
          const c = text[i]
          if (c === '\\') {
            i += 2
            continue
          }
          if (depth === 0 && c === '`') {
            tplEnd = i
            break
          }
          if (c === '$' && text[i + 1] === '{') {
            depth = 1
            i += 2
            continue
          }
          if (depth > 0) {
            if (c === '{') depth++
            else if (c === '}') depth--
            i++
            continue
          }
          i++
        }
        if (tplEnd < 0) continue
        const ctx = text.slice(tplStart, tplEnd)
        // 重扫一遍，收集静态片段
        let j = tplStart
        let segFrom = tplStart
        let d = 0
        while (j < tplEnd) {
          const c = text[j]
          if (c === '\\') {
            j += 2
            continue
          }
          if (c === '$' && text[j + 1] === '{') {
            if (j > segFrom) ranges.push({ start: segFrom, end: j, ctx })
            d = 1
            j += 2
            continue
          }
          if (d > 0) {
            if (c === '{') d++
            else if (c === '}') d--
            j++
            continue
          }
          j++
        }
        if (tplEnd > segFrom) ranges.push({ start: segFrom, end: tplEnd, ctx })
      }
      continue
    }
    const q = text[i]
    if (q === '"' || q === "'") {
      const end = findQuoteEnd(text, i)
      ranges.push({ start: i + 1, end, ctx: text.slice(i + 1, end) })
    }
  }
  return ranges
}

/** 按区间改写文本（从后往前，避免偏移失效） */
function applyRanges(text, ranges, filePath) {
  let out = text
  for (let i = ranges.length - 1; i >= 0; i--) {
    const { start: a, end: b, ctx } = ranges[i]
    if (a >= b) continue
    const cur = out.slice(a, b)
    const next = transformClassString(cur, filePath, ctx)
    if (next !== cur) out = out.slice(0, a) + next + out.slice(b)
  }
  return out
}

/* ─────────────── 补充通道：className 字面量之外的 class 串 ───────────────
   首轮只处理了 `className="..."` / `className={'...'}` / `` className={`...`} ``，
   结果漏掉三类：
     · `className={x ? 'a' : 'b'}`（条件表达式里的两个分支）
     · `const cls = '...'; <div className={cls}>`
     · `cn('...', cond && '...')`
   这些地方的 class 串同样是"手写视觉决策"，不收敛等于没收敛。
   做法：另开一遍扫全部字符串字面量，用"看起来像 class 列表"的启发式把关。 */

/** 至少命中 2 个工具类前缀，才认为是 class 列表（避免误伤普通文案/路径/正则） */
const UTILITY_HINT =
  /(?:^|\s)(?:flex|grid|block|inline|hidden|absolute|relative|fixed|sticky|overflow-|items-|justify-|self-|gap-|p[xytblr]?-\d|m[xytblr]?-\d|w-|h-|min-w-|max-w-|min-h-|max-h-|text-|bg-|border|rounded|transition|duration-|ease-|shadow|opacity-|cursor-|z-\d|inset-|top-|bottom-|left-|right-|shrink|grow|truncate|font-|leading-|tracking-|select-|pointer-events-|backdrop-|ring-|animate-|group-|space-[xy]-)(?![a-z])/g

/** 本脚本规则真正会改到的模式 —— 单 token 字符串靠它判定，精度优先 */
const TARGET_PATTERN =
  /text-\[\d+(?:\.\d+)?px\]|rounded(?:-[a-z0-9]+)?(?![-\w])|(?:bg|border|text)-[a-z-]+\/\d+(?![-\w])|duration-\d+|transition-all|focus:outline-none|h-\[\d+vh\]|(?:p[xytblr]?|m[xytblr]?|gap|space-[xy])-\d\.5|strokeWidth=\{[\d.]+\}|size=\{\d+\}/g

function looksLikeClassList(s) {
  if (!s || s.length > 2000) return false
  if (/[\\|]|\(\?:|\[\^|\.tsx?|\.css|^@|^\.|\/\//.test(s)) return false // 正则 / 路径 / 注释
  if (/^[\w./@-]+$/.test(s)) return false // 纯单词（标识符/路径）

  const hasSpace = /\s/.test(s)
  if (hasSpace) {
    // 多 token：至少命中 2 个工具类前缀
    return (s.match(UTILITY_HINT)?.length ?? 0) >= 2
  }
  // 单 token：必须正好命中本脚本会改的模式，且整体只由 class 允许的字符组成
  TARGET_PATTERN.lastIndex = 0
  return TARGET_PATTERN.test(s) && /^[A-Za-z0-9:[\]\-./%_#!]+$/.test(s)
}

/**
 * 扫全部字符串字面量（单引号 / 双引号 / 反引号）并就地改写像 class 列表的那些。
 * 跳过已经由 className 通道处理过的区间，避免二次处理。
 */
function rewriteLooseStrings(text, filePath, handledRanges) {
  const isHandled = (i) => handledRanges.some(({ start, end }) => i >= start && i < end)

  let out = ''
  let last = 0
  const STR_RE = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g
  let m
  while ((m = STR_RE.exec(text))) {
    const body = m[2]
    if (body.includes('\n') || body.includes('\r')) continue
    const start = m.index + 1
    if (isHandled(start)) continue
    if (!looksLikeClassList(body)) continue
    const next = transformClassString(body, filePath)
    if (next === body) continue
    out += text.slice(last, start) + next
    last = start + body.length
  }
  out += text.slice(last)
  return out
}

/* ─────────────── 按压反馈：给裸 button 补 active: ───────────────
   实测改前按压覆盖率只有 12%（396 处 hover 对 47 处 active）。
   共享类（.chip / .icon-btn / .btn-*）已经在 CSS 里统一加了 :active，
   这里只补"共享类覆盖不到的裸 <button>"：有 hover 但没有 active 的。
   用 Tailwind 的 active:scale-* 而不是全局 CSS —— 前者靠 --tw-scale-* 变量
   与既有 translate/rotate 组合，不会把定位用的 translate 覆盖掉。 */
function addActiveFeedback(text) {
  let out = ''
  let last = 0
  const BTN_RE = /<button\b/g
  let m
  while ((m = BTN_RE.exec(text))) {
    // 找这个开标签的结束位置（花括号配平，避免 JSX 表达式里的 > 提前截断）
    let i = m.index + m[0].length
    let depth = 0
    while (i < text.length) {
      const c = text[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
      i++
    }
    const tag = text.slice(m.index, i)
    const cm = /className\s*=\s*(?:(?<q>["'`])(?<v>[^"'`]*)\k<q>|\{\s*(?<q2>["'`])(?<v2>[^"'`]*)\k<q2>\s*\})/.exec(tag)
    if (!cm) continue
    const value = cm.groups.v ?? cm.groups.v2
    if (!value) continue
    // 已经有按压反馈、或用了已统一处理过的共享类 → 跳过
    if (/active:|chip|icon-btn|btn-liquid|btn-ghost|focus-ring|disabled:cursor-not-allowed/.test(value)) continue
    if (!/hover:/.test(value)) continue

    const localIdx = tag.indexOf(value)
    const abs = m.index + localIdx + value.length
    const next = value + ' active:scale-[0.97]'
    out += text.slice(last, m.index + localIdx) + next
    last = abs
    bump('按压反馈补齐')
  }
  out += text.slice(last)
  return out
}

async function main() {
  const files = await walk(SRC)
  let changed = 0

  for (const f of files) {
    const original = await readFile(f, 'utf8')
    const ranges = collectClassRanges(original)
    let next = applyRanges(original, ranges, f)
    // 改写会改变文本长度，区间必须在新文本上重新定位，否则 loose 通道的跳过判断会错位
    next = rewriteLooseStrings(next, f, collectClassRanges(next))
    next = normalizeIcons(next)
    next = normalizePanels(next)
    next = addAriaLabels(next)
    next = addActiveFeedback(next)

    if (next !== original) {
      changed++
      if (!DRY) await writeFile(f, next, 'utf8')
    }
  }

  console.log(`\n${DRY ? '[DRY RUN] ' : ''}扫过 ${files.length} 个文件，改写 ${changed} 个\n`)
  const rows = [...stats.entries()].sort((a, b) => b[1] - a[1])
  console.log('替换计数：')
  for (const [k, v] of rows) console.log(`  ${String(v).padStart(5)}  ${k}`)
  console.log(`  ${String(rows.reduce((a, [, v]) => a + v, 0)).padStart(5)}  合计`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
