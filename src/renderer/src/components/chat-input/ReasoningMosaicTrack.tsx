import { useCallback, useEffect, useRef, type CSSProperties, type ReactElement } from 'react'

/**
 * 思考强度的「点阵轨道」—— canvas 绘制的马赛克填充。
 *
 * ## 设计语言
 * 用**点阵的物理分辨率**表达思考强度：档位越高，颗粒越细、越亮、闪烁越密。
 * 语义是「思考强度 = 计算的分辨率」。
 *
 * ## 三个视觉支柱
 *
 * **① 层次感：左侧浅、右侧深**
 *   注意这里**不能只靠调透明度** —— 透明是把颜色混向底色，而底色在浅色主题是白的、
 *   在深色主题是深的。只降 alpha 会在深色主题下让左侧变**暗**，方向刚好反了。
 *   所以左侧是**向白色混色**（`LIGHTEN_MAX`），配合一点 alpha 爬升，
 *   两种主题下都稳定读作「浅 → 深」。
 *
 * **② 立体感：补光照信息，不是加发光**
 *   · 逐格微浮雕：每格顶边提亮、底边压暗 ⇒ 瓦片有受光面与背光面
 *   · 逐行顶光衰减：首排亮、末排暗 ⇒ 轨道有弧度
 *   · 容器层内凹槽 + 顶光玻璃罩（CSS，见 effects.css）
 *   · 圆点凸起实体（见 ReasoningSlider）
 *
 * **③ 闪烁：稀疏 + 短暂 + 有节奏**
 *   只有约 20% 的格子是"闪光格"，每格按自己的相位与速率做正弦脉冲，
 *   只有正弦峰值附近的窄窗口才亮 —— 于是任意时刻只有少数几点在闪，
 *   读作「光擦过某个切面」，而不是满屏噪点闪烁。
 *   （这是与「一堆发光的小方块」的关键区别：那版是**每格持续随机**，这版是**少数格瞬时脉冲**。）
 *
 * ## 三轮修正的结论（为什么是现在这样画）
 * · v1「一堆发光的小方块」→ 每格 alpha 连续随机 0.45–1.0，相邻差 2.2 倍 ⇒
 *   改为**离散 4 档 + 窄对比带** + **不留透明空洞**
 * · v2「太模糊」→ 用双线性放大消硬边，把整条轨道插值成柔焦 ⇒
 *   回到**整数设备像素硬边方块**，并把宽高斯乘法增益改为**窄带叠加**
 * · v3「要清晰立体 + 浅到深 + 会闪烁」⇒ 本文档描述的当前版本
 */
const MOSAIC: readonly { cell: number; peak: number; flowMs: number; twinkle: number }[] = [
  { cell: 7, peak: 0.14, flowMs: 0, twinkle: 0 }, // 关闭 —— 静止底纹，不闪
  { cell: 6, peak: 0.4, flowMs: 1600, twinkle: 0.2 }, // 低
  { cell: 5.5, peak: 0.56, flowMs: 1000, twinkle: 0.3 }, // 中
  { cell: 5, peak: 0.7, flowMs: 620, twinkle: 0.42 }, // 高
  { cell: 4.5, peak: 0.84, flowMs: 380, twinkle: 0.55 } // 超高
]

/** 每格强度的离散档数 —— 离散才有抖动纹理感；连续随机就是噪点 */
const STEP = 4
/** 最弱格 / 最强格 —— 决定"瓦片之间"的对比度。这是"马赛克"与"发光小方块"的分界线 */
const MIN_I = 0.62
/** 左侧向白色混色的最大比例 —— 层次感的主要来源（两种主题下方向都正确） */
const LIGHTEN_MAX = 0.6
/** 透明度的左右爬升（辅助层次感，不宜大） */
const RAMP_MIN = 0.7
/** 逐格微浮雕强度 */
const EMBOSS = 0.085
/** 逐行顶光衰减 */
const ROW_LIT_TOP = 1.1
const ROW_LIT_BOTTOM = 0.88

/** 未填充区的中性底纹 */
const NEUTRAL_RGB: [number, number, number] = [139, 147, 161]
const NEUTRAL_ALPHA = 0.055

const FRAME_MS = 1000 / 30
/** 流动亮带：窄 + 叠加式 —— 宽高斯乘法会把轨道拖成一片模糊 */
const FLOW_WIDTH = 7
const FLOW_ADD = 0.2
const SPOT_WIDTH = 16
const SPOT_ADD = 0.26
const WAVE_WIDTH = 8
const WAVE_ADD = 0.22
const WAVE_MS = 240
const IDLE_SLOWDOWN = 3.2
const ACTIVE_SPEEDUP = 1.8
const ACTIVE_BOOST = 1.06

/** 闪光格占比 —— 稀疏才像"光擦过切面"，全格都闪就是噪点 */
const TWINKLER_RATIO = 0.2
/** 每格一个闪烁周期的基准时长（ms） */
const TW_CYCLE_MS = 2200
/** 正弦高于这个比例才起亮 —— 越高越稀疏 */
const TW_DUTY = 0.78
/** 推理中闪烁加速 */
const TW_ACTIVE_SPEEDUP = 1.7
/** 空闲时闪烁幅度衰减（不是消失 —— 面板仍要有"活着"的信号） */
const TW_IDLE_SCALE = 0.62

/** 解析 #rrggbb —— 派生后的强调色填充支一定是六位十六进制 */
function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [59, 130, 246]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export interface ReasoningMosaicTrackProps {
  /** 填充比例 0–1（右端 = 圆点位置） */
  fill: number
  /** 档位索引（0 = 关闭） */
  level: number
  /** 是否正在推理 —— 驱动闪烁/流动的速度与整体亮度 */
  active: boolean
  /** 拖拽中的指针位置 0–1；null = 未拖拽 */
  pointerX: number | null
  /** 已解析的主题色（CSS 变量在 canvas 里无效，必须由外部传入真实颜色值） */
  themeColor: string
  className?: string
  style?: CSSProperties
}

export function ReasoningMosaicTrack({
  fill,
  level,
  active,
  pointerX,
  themeColor,
  className,
  style
}: ReasoningMosaicTrackProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const cellsRef = useRef<Float32Array>(new Float32Array(0))
  /** 每格的闪烁相位与速率（速率为 0 表示这格不参与闪烁） */
  const twPhaseRef = useRef<Float32Array>(new Float32Array(0))
  const twRateRef = useRef<Float32Array>(new Float32Array(0))
  /** 网格用**设备像素**：cellDev 是整数，方块边界永不落在半个像素上 ⇒ 清晰 */
  const dimsRef = useRef({ gx: 0, gy: 0, cellDev: 5, cellCss: 5, w: 0, h: 0, dpr: 1 })
  const rgbRef = useRef<[number, number, number]>([59, 130, 246])
  const waveRef = useRef<{ born: number; x: number } | null>(null)
  const phaseRef = useRef(0)
  const lastLevelRef = useRef(level)
  const rafRef = useRef(0)
  const reducedRef = useRef(false)

  const stateRef = useRef({ fill, level, active, pointerX })
  stateRef.current = { fill, level, active, pointerX }

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedRef.current = mq.matches
    const onChange = (): void => {
      reducedRef.current = mq.matches
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const reseed = useCallback((ratio: number) => {
    const cells = cellsRef.current
    const n = Math.floor(cells.length * ratio)
    for (let k = 0; k < n; k++) {
      const i = (Math.random() * cells.length) | 0
      cells[i] = MIN_I + (1 - MIN_I) * (((Math.random() * STEP) | 0) / (STEP - 1))
    }
  }, [])

  const rebuild = useCallback(() => {
    const cv = canvasRef.current
    if (!cv) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = cv.clientWidth
    const h = cv.clientHeight
    if (!w || !h) return
    const cfg = MOSAIC[Math.min(stateRef.current.level, MOSAIC.length - 1)] ?? MOSAIC[0]
    const cellDev = Math.max(3, Math.round(cfg.cell * dpr))
    const W = Math.round(w * dpr)
    const H = Math.round(h * dpr)
    cv.width = W
    cv.height = H
    const gx = Math.ceil(W / cellDev)
    const gy = Math.ceil(H / cellDev)
    dimsRef.current = { gx, gy, cellDev, cellCss: cellDev / dpr, w, h, dpr }
    const total = gx * gy
    cellsRef.current = new Float32Array(total)
    twPhaseRef.current = new Float32Array(total)
    twRateRef.current = new Float32Array(total)
    for (let i = 0; i < total; i++) {
      twPhaseRef.current[i] = Math.random() * Math.PI * 2
      // 只有约 1/5 的格子参与闪烁 —— 速率 0 = 不闪
      twRateRef.current[i] = Math.random() < TWINKLER_RATIO ? 0.75 + Math.random() * 0.8 : 0
    }
    reseed(1)
  }, [reseed])

  const draw = useCallback((now: number) => {
    const cv = canvasRef.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const { gx, gy, cellDev, cellCss, w } = dimsRef.current
    if (!gx || !gy) return

    const { fill: f, level: lv, active: act, pointerX: px } = stateRef.current
    const cfg = MOSAIC[Math.min(lv, MOSAIC.length - 1)] ?? MOSAIC[0]
    const [cr, cg, cb] = rgbRef.current
    const cells = cellsRef.current
    const twPhase = twPhaseRef.current
    const twRate = twRateRef.current
    const motionOff = reducedRef.current

    // 流动亮带（CSS px）
    let bandX = -1e5
    if (cfg.flowMs > 0 && !motionOff) {
      const span = w + 80
      const speed = act ? ACTIVE_SPEEDUP : 1 / IDLE_SLOWDOWN
      bandX = (((now * speed) / cfg.flowMs) % 1) * span - 40
    }
    const wave = waveRef.current
    const waveT = wave && !motionOff ? Math.min(1, (now - wave.born) / WAVE_MS) : 1

    const fillX = f > 0 ? f * w : 0
    const peak = cfg.peak * (act ? ACTIVE_BOOST : 1)
    const lastRow = Math.max(1, gy - 1)
    // 闪烁：角度随时间推进；推理中加速，空闲时幅度衰减但仍保留
    const twAmp = motionOff ? 0 : cfg.twinkle * (act ? 1 : TW_IDLE_SCALE)
    const twAng = motionOff
      ? 0
      : (now / TW_CYCLE_MS) * Math.PI * 2 * (act ? TW_ACTIVE_SPEEDUP : 1)

    ctx.clearRect(0, 0, cv.width, cv.height)
    ctx.imageSmoothingEnabled = false

    for (let iy = 0; iy < gy; iy++) {
      const y = iy * cellDev
      const rowLit = ROW_LIT_TOP + (ROW_LIT_BOTTOM - ROW_LIT_TOP) * (iy / lastRow)
      for (let ix = 0; ix < gx; ix++) {
        const idx = iy * gx + ix
        const base = cells[idx]
        const x = ix * cellDev
        const rw = Math.min(cellDev, cv.width - x)
        const rh = Math.min(cellDev, cv.height - y)
        if (rw <= 0 || rh <= 0) continue
        const xCss = (ix + 0.5) * cellCss
        const filled = fillX > 0 && xCss <= fillX

        if (!filled) {
          ctx.globalAlpha = NEUTRAL_ALPHA * base
          ctx.fillStyle = `rgb(${NEUTRAL_RGB[0]},${NEUTRAL_RGB[1]},${NEUTRAL_RGB[2]})`
          ctx.fillRect(x, y, rw, rh)
          continue
        }

        // 层次感：越靠左越向白色混 —— 用色相混色而不是降透明度，
        // 这样深浅两种主题下都是"左浅右深"，方向不会反
        const t = (1 - Math.min(1, xCss / fillX)) * LIGHTEN_MAX
        const cr2 = cr + (255 - cr) * t
        const cg2 = cg + (255 - cg) * t
        const cb2 = cb + (255 - cb) * t

        const ramp = RAMP_MIN + (1 - RAMP_MIN) * Math.min(1, xCss / fillX)
        let a = base * peak * rowLit * ramp
        // 流动亮带 / 探照灯 / 脉冲一律用**叠加**而不是乘法 ——
        // 乘法在宽高斯下会把轨道拖出一道模糊，叠加则保持方块锐利
        if (bandX > -1e4) {
          const d = (xCss - bandX) / FLOW_WIDTH
          if (d > -2.5 && d < 2.5) a += FLOW_ADD * Math.exp(-d * d)
        }
        if (px !== null) {
          const d = (xCss - px * w) / SPOT_WIDTH
          if (d > -2.5 && d < 2.5) a += SPOT_ADD * Math.exp(-d * d)
        }
        if (waveT < 1 && wave) {
          const rad = waveT * w * 0.6
          const amp = WAVE_ADD * (1 - waveT)
          const dl = (xCss - (wave.x - rad)) / WAVE_WIDTH
          const dr = (xCss - (wave.x + rad)) / WAVE_WIDTH
          if (dl > -2.5 && dl < 2.5) a += amp * Math.exp(-dl * dl)
          if (dr > -2.5 && dr < 2.5) a += amp * Math.exp(-dr * dr)
        }
        // 闪烁：只有闪光格、且只在正弦峰值附近的窄窗口起亮
        if (twAmp > 0) {
          const rate = twRate[idx]
          if (rate !== 0) {
            const s = Math.sin(twAng * rate + twPhase[idx])
            if (s > TW_DUTY) {
              const k = (s - TW_DUTY) / (1 - TW_DUTY)
              a += twAmp * k * k
            }
          }
        }
        if (a > 1) a = 1
        else if (a < 0) a = 0
        if (a < 0.004) continue

        ctx.fillStyle = `rgb(${cr2 | 0},${cg2 | 0},${cb2 | 0})`
        // ① 格体
        ctx.globalAlpha = a
        ctx.fillRect(x, y, rw, rh)

        // ② 微浮雕：顶边受光、底边背光 —— 这一条是"立体感"的主要来源
        if (cellDev >= 4) {
          ctx.globalAlpha = a + EMBOSS > 1 ? 1 : a + EMBOSS
          ctx.fillRect(x, y, rw, 1)
          const lo = a - EMBOSS * 0.75
          ctx.globalAlpha = lo < 0 ? 0 : lo
          ctx.fillRect(x, y + rh - 1, rw, 1)
        }
      }
    }
    ctx.globalAlpha = 1
  }, [])

  /* 尺寸变化 → 重建网格 */
  useEffect(() => {
    rebuild()
    draw(performance.now())
    const cv = canvasRef.current
    if (!cv) return
    const ro = new ResizeObserver(() => {
      rebuild()
      draw(performance.now())
    })
    ro.observe(cv)
    return () => ro.disconnect()
  }, [rebuild, draw])

  /* 档位变化 → 换颗粒尺度 + 触发跨档脉冲 */
  useEffect(() => {
    if (lastLevelRef.current === level) return
    const prev = lastLevelRef.current
    lastLevelRef.current = level
    const n = MOSAIC.length - 1
    waveRef.current = { born: performance.now(), x: n > 0 ? (level / n) * dimsRef.current.w : 0 }
    if (MOSAIC[Math.min(level, n)]?.cell !== MOSAIC[Math.min(prev, n)]?.cell) rebuild()
    else reseed(0.6)
    draw(performance.now())
  }, [level, rebuild, reseed, draw])

  /* 拖拽中持续重掷 —— 指针扫过的地方先"醒"过来 */
  useEffect(() => {
    if (pointerX === null) return
    reseed(0.25)
  }, [pointerX, reseed])

  /* 主题色变化 */
  useEffect(() => {
    rgbRef.current = parseHex(themeColor)
    draw(performance.now())
  }, [themeColor, draw])

  /* 动画循环：需要动的时候才跑 */
  useEffect(() => {
    const cfgLv = MOSAIC[Math.min(level, MOSAIC.length - 1)] ?? MOSAIC[0]
    // 闪烁本身就是动画 —— 只要该档位会闪，就必须持续跑帧
    const animated = cfgLv.flowMs > 0 || cfgLv.twinkle > 0 || active
    let stopped = false
    let last = 0
    let acc = 0

    const tick = (now: number): void => {
      if (stopped) return
      rafRef.current = requestAnimationFrame(tick)
      if (document.hidden) return
      const dt = now - last
      last = now
      if (dt > 0) phaseRef.current += dt
      acc += dt
      if (acc < FRAME_MS) return
      acc = 0
      const reseedEvery = Math.max(200, (cfgLv.flowMs || 1600) * 0.35)
      if (!reducedRef.current && phaseRef.current > reseedEvery) {
        phaseRef.current = 0
        reseed(0.2)
      }
      draw(now)
    }

    if (animated) rafRef.current = requestAnimationFrame(tick)
    else draw(performance.now())
    return () => {
      stopped = true
      cancelAnimationFrame(rafRef.current)
    }
  }, [level, active, reseed, draw])

  /* 填充比例 / 指针变化 → 立即补画一帧 */
  useEffect(() => {
    draw(performance.now())
  }, [fill, pointerX, draw])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{ display: 'block', width: '100%', height: '100%', ...style }}
    />
  )
}
