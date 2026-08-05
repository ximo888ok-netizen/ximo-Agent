import type { CursorTrailStyle, CursorClickStyle } from '@shared/types'

/**
 * 鼠标特效样式配置 — 单一数据源
 *
 * 引擎（CursorEffects.tsx）与 UI（MouseEffectsSection.tsx）共用此表，
 * 保证样式列表、动画名、CSS 类名、生成方式永远一致。
 *
 * kind 决定引擎如何生成元素：
 * - 'trail'  跟随类：每次移动在光标处生成 1~N 个粒子
 * - 'ring'   点击环类：2~3 层同心扩散（错峰延迟）
 * - 'single' 点击单体类：1~2 个独立元素爆发
 * - 'multi'  点击多粒子类：clickCount × intensity 个粒子四散
 */
export type EffectKind = 'trail' | 'ring' | 'single' | 'multi'

export interface CursorStyleDef<T extends string> {
  value: T
  label: string
  desc: string
  kind: EffectKind
  /** CSS 类名（ce- 前缀之后的部分） */
  cls: string
  /** 动画 keyframes 名 */
  anim: string
  /** emoji 字形：有则用文字渲染（表情类特效），无则用 CSS 图形 */
  glyph?: string
  /** 需要随机方向位移（--ce-dx / --ce-dy） */
  direction?: boolean
  /** 使用彩虹随机色（--ce-rainbow-color） */
  rainbow?: boolean
  /** 需要随机旋转角度（--ce-rot） */
  rotate?: boolean
}

// ═══════════ 跟随特效（移动时持续生成） ═══════════
export const TRAIL_STYLES: CursorStyleDef<CursorTrailStyle>[] = [
  // ── 基础粒子 ──
  { value: 'trail', label: '经典尾迹', desc: '渐隐彩色光点', kind: 'trail', cls: 'trail-dot', anim: 'ceTrailFloat' },
  { value: 'sparkle', label: '星光点点', desc: '旋转闪烁星芒', kind: 'trail', cls: 'sparkle', anim: 'ceSparklePop' },
  { value: 'firefly', label: '萤火虫', desc: '柔和光点漂浮', kind: 'trail', cls: 'firefly', anim: 'ceFireflyFloat' },
  { value: 'glow', label: '光晕拖尾', desc: '大号柔光球', kind: 'trail', cls: 'glow', anim: 'ceGlowFade' },
  { value: 'aurora', label: '极光流光', desc: '斜向彩色丝带', kind: 'trail', cls: 'aurora', anim: 'ceAuroraSweep' },
  { value: 'comet', label: '彗星拖尾', desc: '头部亮星飞驰', kind: 'trail', cls: 'comet', anim: 'ceCometFly', direction: true },
  { value: 'rainbow', label: '彩虹粒子', desc: '彩色方块散落', kind: 'trail', cls: 'rainbow', anim: 'ceRainbowScatter', direction: true, rainbow: true },
  // ── 自然元素 ──
  { value: 'snowflake', label: '雪花飘落', desc: '❄️ 六角雪花摇曳', kind: 'trail', cls: 'glyph snowflake', anim: 'ceSnowfall', glyph: '❄️', direction: true, rotate: true },
  { value: 'leaf', label: '落叶飘舞', desc: '🍂 秋叶旋转飘落', kind: 'trail', cls: 'glyph leaf', anim: 'ceLeafFall', glyph: '🍂', direction: true, rotate: true },
  { value: 'butterfly', label: '蝴蝶纷飞', desc: '🦋 蝴蝶振翅飞舞', kind: 'trail', cls: 'glyph butterfly', anim: 'ceButterfly', glyph: '🦋', direction: true },
  { value: 'sakura', label: '樱花雨', desc: '🌸 花瓣随风飘散', kind: 'trail', cls: 'glyph sakura', anim: 'ceSakuraFall', glyph: '🌸', direction: true, rotate: true },
  { value: 'bubble', label: '泡泡上升', desc: '晶莹气泡上浮', kind: 'trail', cls: 'bubble', anim: 'ceBubbleRise', direction: true },
  { value: 'droplet', label: '水滴下落', desc: '💧 水滴坠落', kind: 'trail', cls: 'glyph droplet', anim: 'ceDropletFall', glyph: '💧', direction: true },
  { value: 'ember', label: '火星上浮', desc: '🔥 橙红火星升腾', kind: 'trail', cls: 'ember', anim: 'ceEmberRise' },
  { value: 'clover', label: '四叶草', desc: '🍀 幸运草旋转', kind: 'trail', cls: 'glyph clover', anim: 'ceCloverTwirl', glyph: '🍀', direction: true, rotate: true },
  // ── 符号图形 ──
  { value: 'diamond', label: '菱形闪烁', desc: '◇ 旋转菱形发光', kind: 'trail', cls: 'diamond', anim: 'ceDiamondTwinkle' },
  { value: 'star4', label: '四角星', desc: '✦ 四角星闪烁', kind: 'trail', cls: 'star4', anim: 'ceStar4Pop' },
  { value: 'cross', label: '十字星', desc: '✚ 十字光芒', kind: 'trail', cls: 'cross', anim: 'ceCrossFlash' },
  { value: 'halo', label: '光环波纹', desc: '◎ 圆环扩散', kind: 'trail', cls: 'halo', anim: 'ceHaloPing' },
  { value: 'energy', label: '能量球', desc: '● 发光能量脉冲', kind: 'trail', cls: 'energy', anim: 'ceEnergyPulse' },
  { value: 'ringdots', label: '环绕圆点', desc: '◉ 中心点带光环', kind: 'trail', cls: 'ringdots', anim: 'ceRingDots' },
  { value: 'note', label: '音符跳跃', desc: '🎵 跳动的音符', kind: 'trail', cls: 'glyph note', anim: 'ceNoteJump', glyph: '🎵', direction: true },
  { value: 'moon', label: '月牙', desc: '🌙 月牙轻摇', kind: 'trail', cls: 'glyph moon', anim: 'ceMoonSwing', glyph: '🌙', direction: true },
]

// ═══════════ 点击特效（按下时爆发） ═══════════
export const CLICK_STYLES: CursorStyleDef<CursorClickStyle>[] = [
  // ── 波纹环状 ──
  { value: 'ripple', label: '同心涟漪', desc: '多层扩张圆环', kind: 'ring', cls: 'ripple-ring', anim: 'ceRippleExpand' },
  { value: 'ring', label: '扩散圆环', desc: '圆环加内芯', kind: 'ring', cls: 'ring', anim: 'ceRingOut' },
  { value: 'shockwave', label: '冲击波', desc: '快速扩散冲击波', kind: 'ring', cls: 'shockwave', anim: 'ceShockwave' },
  { value: 'orbit', label: '环绕轨道', desc: '粒子沿圆轨道环绕', kind: 'ring', cls: 'orbit', anim: 'ceOrbit' },
  { value: 'wormhole', label: '虫洞旋涡', desc: '螺旋收缩的旋涡', kind: 'ring', cls: 'wormhole', anim: 'ceWormhole' },
  { value: 'water', label: '水波纹', desc: '水面荡开涟漪', kind: 'ring', cls: 'water', anim: 'ceWater' },
  // ── 粒子爆发 ──
  { value: 'burst', label: '放射爆裂', desc: '粒子四散飞射', kind: 'multi', cls: 'burst', anim: 'ceBurstFly', direction: true },
  { value: 'pixel', label: '像素方块', desc: '彩色像素溅射', kind: 'multi', cls: 'pixel', anim: 'cePixelPop', direction: true, rainbow: true },
  { value: 'flower', label: '花瓣绽放', desc: '花瓣旋转散开', kind: 'multi', cls: 'flower', anim: 'ceFlowerBloom', direction: true, rotate: true },
  { value: 'firework', label: '烟花绽放', desc: '🎇 夜空烟花', kind: 'multi', cls: 'glyph firework', anim: 'ceFirework', glyph: '🎇', direction: true },
  { value: 'confetti', label: '彩带喷射', desc: '彩色纸屑飞舞', kind: 'multi', cls: 'confetti', anim: 'ceConfetti', direction: true, rainbow: true, rotate: true },
  { value: 'snow', label: '雪花爆开', desc: '❄️ 雪花四散', kind: 'multi', cls: 'glyph snow', anim: 'ceSnowBurst', glyph: '❄️', direction: true },
  { value: 'gem', label: '宝石迸发', desc: '💎 璀璨宝石', kind: 'multi', cls: 'glyph gem', anim: 'ceGemBurst', glyph: '💎', direction: true },
  { value: 'spark', label: '电光四溅', desc: '⚡ 电光火花', kind: 'multi', cls: 'spark', anim: 'ceSparkFly', direction: true },
  { value: 'cube', label: '魔方爆散', desc: '立体方块旋转', kind: 'multi', cls: 'cube', anim: 'ceCubePop', direction: true, rotate: true },
  { value: 'laser', label: '激光放射', desc: '细长激光线放射', kind: 'multi', cls: 'laser', anim: 'ceLaser', direction: true },
  { value: 'golden', label: '金色雨滴', desc: '✨ 金色粒子洒落', kind: 'multi', cls: 'golden', anim: 'ceGoldenRain', direction: true },
  // ── 单体元素 ──
  { value: 'heart', label: '爱心气泡', desc: '❤️ 爱心上浮', kind: 'single', cls: 'heart', anim: 'ceHeartRise' },
  { value: 'star', label: '星芒', desc: '四角星爆发旋转', kind: 'single', cls: 'star', anim: 'ceStarSpin' },
  { value: 'crown', label: '皇冠升起', desc: '👑 皇冠升起', kind: 'single', cls: 'glyph crown', anim: 'ceCrownRise', glyph: '👑' },
  { value: 'lightning', label: '闪电', desc: '⚡ 闪电炸裂', kind: 'single', cls: 'glyph lightning', anim: 'ceLightning', glyph: '⚡' },
  { value: 'splash', label: '水花四溅', desc: '💦 水滴四溅', kind: 'multi', cls: 'glyph splash', anim: 'ceSplash', glyph: '💦', direction: true },
]

// 工具函数：按 value 查找样式定义
export const findTrailStyle = (v: CursorTrailStyle | undefined): CursorStyleDef<CursorTrailStyle> | undefined =>
  TRAIL_STYLES.find((s) => s.value === v)
export const findClickStyle = (v: CursorClickStyle | undefined): CursorStyleDef<CursorClickStyle> | undefined =>
  CLICK_STYLES.find((s) => s.value === v)
