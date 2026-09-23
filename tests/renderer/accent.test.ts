import { describe, it, expect } from 'vitest'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import chroma from 'chroma-js'
import {
  ACCENT_ON_FILL,
  ACCENT_SURFACE,
  CONTRAST_GRAPHIC,
  CONTRAST_TEXT,
  CONTRAST_TEXT_STRONG,
  applyAccentTokens,
  auditAccent,
  clearAccentTokens,
  deriveAccentTokens,
  readableOn,
  type ThemeMode,
} from '../../src/renderer/src/lib/accent'

/** 测试跑在 node 环境（无 DOM），造一个只实现 style 接口的最小替身 */
function makeRoot(): HTMLElement {
  const store = new Map<string, string>()
  return {
    style: {
      setProperty: (k: string, v: string): void => { store.set(k, v) },
      removeProperty: (k: string): void => { store.delete(k) },
      getPropertyValue: (k: string): string => store.get(k) ?? '',
    },
  } as unknown as HTMLElement
}

/** 设置面板里的 8 个主色预设 + 几个极端色，用来压边界 */
const COLORS: Record<string, string> = {
  Indigo: '#6366f1',
  Blue: '#3b82f6',
  Emerald: '#10b981',
  Rose: '#f43f5e',
  Amber: '#f59e0b',
  Violet: '#8b5cf6',
  Cyan: '#06b6d4',
  Orange: '#f97316',
}

/** 用户可能自己填的极端值 */
const EDGE_COLORS: Record<string, string> = {
  纯白: '#ffffff',
  纯黑: '#000000',
  近白黄: '#ffe600',
  深墨蓝: '#0b1020',
  高饱和品红: '#ff00ff',
  中灰: '#808080',
}

const MODES: ThemeMode[] = ['light', 'dark']

const names = (all: Record<string, string>, mode: ThemeMode): [string, string][] =>
  Object.entries(all).map(([n, c]) => [`${n} · ${mode}`, c])

describe('accent — 双支派生', () => {
  it('非法颜色不产生任何令牌（保持 CSS 兜底）', () => {
    expect(deriveAccentTokens('', 'light')).toEqual({})
    expect(deriveAccentTokens('not-a-color', 'light')).toEqual({})
    expect(deriveAccentTokens('#12345', 'dark')).toEqual({})
  })

  it('令牌集合稳定且全部为合法 CSS 颜色', () => {
    const hexTokens = [
      '--accent-fill',
      '--accent-fill-top',
      '--accent-fill-deep',
      '--accent-fill-hover',
      '--accent-on-fill',
      '--accent-ink',
      '--accent-ink-strong',
      '--accent-ink-subtle',
      '--focus-ring',
    ]
    const rgbaTokens = ['--theme-glow', '--focus-ring-soft', '--orb-1-c']

    for (const mode of MODES) {
      const tokens = deriveAccentTokens('#3b82f6', mode)

      for (const k of [...hexTokens, ...rgbaTokens]) {
        expect(tokens[k], `${mode} 缺少 ${k}`).toBeDefined()
      }
      for (const [k, v] of Object.entries(tokens)) {
        // `-rgb` 是通道三元组（"29 111 245"），不是独立颜色值
        if (k.endsWith('-rgb')) continue
        expect(chroma.valid(v), `${mode} 令牌值非法 ${k}=${v}`).toBe(true)
      }

      // 每个纯色令牌都要有 `-rgb` 通道伴随令牌，否则 Tailwind 的
      // `bg-accent/10` 这类透明度修饰符会静默丢失
      for (const k of hexTokens) {
        const rgb = tokens[`${k}-rgb`]
        expect(rgb, `${mode} 缺少 ${k}-rgb`).toBeDefined()
        expect(rgb, `${k}-rgb 应为 "r g b" 三元组`).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/)
        const [r, g, b] = rgb.split(' ').map(Number)
        expect(chroma(r, g, b).hex()).toBe(tokens[k])
      }

      // rgba() 形式的令牌不派生 rgbtokens（无法承载 alpha）
      for (const k of rgbaTokens) {
        expect(tokens[`${k}-rgb`]).toBeUndefined()
      }
    }
  })

  it('readableOn 在亮底给近黑、暗底给白', () => {
    expect(readableOn('#f59e0b')).not.toBe('#ffffff')
    expect(readableOn('#1d6ff5')).toBe('#ffffff')
    expect(readableOn('#ffffff')).not.toBe('#ffffff')
    expect(readableOn('#000000')).toBe('#ffffff')
    expect(readableOn('nope')).toBe('#ffffff')
  })

  describe.each(MODES)('对比度门槛 · %s', (mode) => {
    const surface = ACCENT_SURFACE[mode]

    it.each([...names(COLORS, mode), ...names(EDGE_COLORS, mode)])(
      '%s —— 填充支白字 ≥4.5:1，墨色支 ≥4.5:1，焦点环 ≥3:1',
      (_label, color) => {
        const t = deriveAccentTokens(color, mode)
        const fill = chroma(t['--accent-fill'])
        const top = chroma(t['--accent-fill-top'])
        const deep = chroma(t['--accent-fill-deep'])
        const hover = chroma(t['--accent-fill-hover'])
        const ink = chroma(t['--accent-ink'])
        const inkStrong = chroma(t['--accent-ink-strong'])
        const inkSubtle = chroma(t['--accent-ink-subtle'])
        const ring = chroma(t['--focus-ring'])

        // 填充支 —— 四个面全部承载白字/白图标
        expect(chroma.contrast(fill, ACCENT_ON_FILL)).toBeGreaterThanOrEqual(CONTRAST_TEXT - 1e-6)
        expect(chroma.contrast(top, ACCENT_ON_FILL)).toBeGreaterThanOrEqual(CONTRAST_TEXT - 1e-6)
        expect(chroma.contrast(deep, ACCENT_ON_FILL)).toBeGreaterThanOrEqual(CONTRAST_TEXT - 1e-6)
        expect(chroma.contrast(hover, ACCENT_ON_FILL)).toBeGreaterThanOrEqual(CONTRAST_TEXT - 1e-6)

        // 墨色支 —— 落在页面底色上
        expect(chroma.contrast(ink, surface)).toBeGreaterThanOrEqual(CONTRAST_TEXT - 1e-6)
        expect(chroma.contrast(inkStrong, surface)).toBeGreaterThanOrEqual(CONTRAST_TEXT_STRONG - 1e-6)
        expect(chroma.contrast(inkSubtle, surface)).toBeGreaterThanOrEqual(CONTRAST_GRAPHIC - 1e-6)

        // 发光支 —— 焦点环是图形元素
        expect(chroma.contrast(ring, surface)).toBeGreaterThanOrEqual(CONTRAST_GRAPHIC - 1e-6)
      },
    )
  })

  it('派生的填充色不跑色相（偏移 ≤15°）', () => {
    for (const mode of MODES) {
      for (const color of Object.values(COLORS)) {
        const report = auditAccent(color, mode)
        expect(report.hueShift, `${color} @ ${mode} 色相偏移 ${report.hueShift}°`).toBeLessThanOrEqual(15)
      }
    }
  })

  it('auditAccent 对全部预设返回合格', () => {
    for (const mode of MODES) {
      for (const [name, color] of Object.entries(COLORS)) {
        const report = auditAccent(color, mode)
        expect(report.ok, `${name} @ ${mode} 未达标: ${JSON.stringify(report)}`).toBe(true)
      }
    }
  })

  it('分发到 DOM：apply 写入内联样式，clear 全部清掉', () => {
    const root = makeRoot()
    const tokens = deriveAccentTokens('#f59e0b', 'light')

    applyAccentTokens(root, tokens)
    expect(root.style.getPropertyValue('--accent-fill')).toBe(tokens['--accent-fill'])
    expect(root.style.getPropertyValue('--focus-ring')).toBe(tokens['--focus-ring'])

    clearAccentTokens(root, tokens)
    for (const k of Object.keys(tokens)) {
      expect(root.style.getPropertyValue(k)).toBe('')
    }
  })

  it('填充支两模式一致（白字门槛与底色无关），墨色支/发光支随模式变', () => {
    const light = deriveAccentTokens('#3b82f6', 'light')
    const dark = deriveAccentTokens('#3b82f6', 'dark')

    // 填充支承载白字 —— 无论深色浅色底，够深就是够深，刻意保持同值
    expect(light['--accent-fill']).toBe(dark['--accent-fill'])

    // 墨色支落在页面底色上 —— 必须随明暗翻转方向
    expect(light['--accent-ink']).not.toBe(dark['--accent-ink'])

    // 渐变端与光晕按模式各自调
    expect(light['--accent-fill-deep']).not.toBe(dark['--accent-fill-deep'])
    expect(light['--theme-glow']).not.toBe(dark['--theme-glow'])
  })
})

describe('accent — 诊断表（失败时看这里）', () => {
  it('打印 8 预设 × 2 模式的实测对比度', () => {
    const rows: Record<string, string | number>[] = []
    for (const mode of MODES) {
      for (const [name, color] of Object.entries({ ...COLORS, ...EDGE_COLORS })) {
        const t = deriveAccentTokens(color, mode)
        rows.push({
          name,
          mode,
          theme: color,
          fill: t['--accent-fill'],
          'fill/white': +chroma.contrast(t['--accent-fill'], '#fff').toFixed(2),
          'top/white': +chroma.contrast(t['--accent-fill-top'], '#fff').toFixed(2),
          'deep/white': +chroma.contrast(t['--accent-fill-deep'], '#fff').toFixed(2),
          'hover/white': +chroma.contrast(t['--accent-fill-hover'], '#fff').toFixed(2),
          ink: t['--accent-ink'],
          'ink/surface': +chroma.contrast(t['--accent-ink'], ACCENT_SURFACE[mode]).toFixed(2),
          'inkStrong/surface': +chroma.contrast(t['--accent-ink-strong'], ACCENT_SURFACE[mode]).toFixed(2),
          ring: t['--focus-ring'],
          'ring/surface': +chroma.contrast(t['--focus-ring'], ACCENT_SURFACE[mode]).toFixed(2),
          'fill/page': +chroma.contrast(
            t['--accent-fill'],
            mode === 'light' ? '#eef0f4' : '#090b10',
          ).toFixed(2),
        })
      }
    }
    const total = (Object.keys(COLORS).length + Object.keys(EDGE_COLORS).length) * MODES.length
    // 诊断数据落盘成 txt，避免终端编码把表格打花
    writeFileSync(
      resolve(__dirname, '../../deliverables/accent-derivation-matrix.txt'),
      toAsciiTable(rows),
      'utf8',
    )
    expect(rows.length).toBe(total)
  })
})

/** 极简 ASCII 表格 —— 不依赖第三方，且不受终端编码影响 */
function toAsciiTable(rows: Record<string, string | number>[]): string {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  const cells = rows.map((r) => cols.map((c) => String(r[c])))
  const widths = cols.map((c, i) => Math.max(c.length, ...cells.map((row) => row[i].length)))
  const line = (chars: [string, string, string]): string =>
    chars[0] + widths.map((w) => '─'.repeat(w + 2)).join(chars[1]) + chars[2]

  return [
    line(['┌', '┬', '┐']),
    '│ ' + cols.map((c, i) => c.padEnd(widths[i])).join(' │ ') + ' │',
    line(['├', '┼', '┤']),
    ...cells.map((row) => '│ ' + row.map((v, i) => v.padEnd(widths[i])).join(' │ ') + ' │'),
    line(['└', '┴', '┘']),
    '',
  ].join('\n')
}
