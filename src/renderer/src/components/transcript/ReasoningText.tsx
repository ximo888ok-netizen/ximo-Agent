import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

/** 折叠后的限高（px）—— 超过这么多才出现「展开」 */
const CLAMP_PX = 320

/**
 * 推理正文渲染 —— 把一段裸文本切成段落，并高亮「正在写的那一段」。
 *
 * 为什么要切段落：
 * 推理输出是模型边想边吐的连续文本，`white-space: pre-wrap` 直接渲染会得到
 * 一整屏没有节奏的灰字 —— 段落边界完全看不出来。切成 <p> 之后：
 *   · 段落之间有了真实间距，读起来有呼吸
 *   · 可以只给**最后一段**加"正在写"的标记，让用户看见流式进展落在哪
 *
 * 段落切分启发式：优先按空行切；若整段没有空行（模型偶尔会一行到底），
 * 退回按单换行切 —— 否则会退化成一整块，失去节奏。
 */
export function splitReasoningParagraphs(text: string): string[] {
  const byBlank = text.split(/\n{2,}/)
  if (byBlank.length > 1) return byBlank.map((s) => s.trim()).filter(Boolean)
  return text.split(/\n/).map((s) => s.trim()).filter(Boolean)
}

export function ReasoningText({ text, running }: { text: string; running?: boolean }): React.ReactElement | null {
  const paragraphs = useMemo(() => splitReasoningParagraphs(text), [text])
  if (paragraphs.length === 0) return null

  return (
    <div className="reasoning-text">
      {paragraphs.map((paragraph, i) => {
        const isTail = Boolean(running) && i === paragraphs.length - 1
        return (
          <p
            key={i}
            className={`reasoning-text__p${isTail ? ' reasoning-text__p--tail' : ''}`}
          >
            {paragraph}
          </p>
        )
      })}
    </div>
  )
}

/**
 * 思考链正文容器 —— **限高 + 可展开**，且**不引入内部滚动条**。
 *
 * 为什么不用 `overflow-y: auto`：
 * 外层会话区本身就在滚动，内部再套一个滚动条会形成嵌套滚动 ——
 * 滚轮该滚哪一层变得不可预期，长思考链读起来很别扭。
 * 这里改成：限高 + `overflow: hidden` + 底部渐隐，
 * 溢出只作为一个"还有内容"的信号，要看全就点展开。
 *
 * 两个细节：
 * · **渐隐用 mask 而不是背景色渐变** —— 会话区底下是玻璃/渐变背景，
 *   用某个具体色值做渐变会在不同主题、不同背景图下露馅；mask 直接把内容淡出，与背景无关。
 * · **流式期间自动跟随底部** —— 限高后新内容会落在可视区之外，
 *   `overflow: hidden` 的元素依然可以程序化设 `scrollTop`，于是能"贴住最新"而不出现滚动条。
 */
export function ReasoningBody({ text, running }: { text: string; running?: boolean }): React.ReactElement | null {
  const clampRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  // 量的是**内层**（不受限高影响）的真实高度，所以展开后按钮不会自己消失。
  //
  // ⚠️ 必须用 ResizeObserver 持续测量，不能只在 text 变化时量一次：
  // 切换会话再切回来时，首次测量可能发生在元素**尚未完成布局**（或被隐藏）的时刻，
  // scrollHeight 会偏小 ⇒ 判定"没溢出"；而 text 之后不再变化 ⇒ 永远不会重新测量
  // ⇒ 「展开全部思考链」按钮就此消失（用户报的就是这个）。
  // 用 RO 后，重新可见 / 窗口变化 / 字体加载 / 流式增长 都会触发重新判定。
  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    const measure = (): void => setOverflowing(el.scrollHeight > CLAMP_PX + 4)
    measure()
    // 下一帧再补一次 —— 覆盖"首次测量时布局尚未稳定"的情况
    const raf = requestAnimationFrame(measure)
    if (typeof ResizeObserver === 'undefined') return () => cancelAnimationFrame(raf)
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  // 流式且未展开时贴住底部，让用户看到最新写出的内容
  useLayoutEffect(() => {
    const el = clampRef.current
    if (!el || expanded) return
    if (running) el.scrollTop = el.scrollHeight
  }, [text, running, expanded])

  if (!text.trim()) return null

  /**
   * 展开按钮的显隐判定 —— 测量为主，文本长度为辅。
   *
   * 纯靠测量有过一次事故（切换会话后按钮消失），因为测量依赖"元素已完成布局"，
   * 而 `content-visibility: auto` 的祖先（.msg）在**离屏时会跳过子树布局**，
   * 此时 scrollHeight 读出来是 contain-intrinsic-size 而不是真实高度。
   * ResizeObserver 已经覆盖了绝大多数情况，这里再用文本长度兜一层：
   * 长到不可能塞进限高时就直接给按钮 —— 宁可多给一次无害的"展开"，
   * 也不要让用户看不到本该有的入口。
   * （阈值取 800 字符：中文约 63 字/行 ⇒ 约 13 行 ≈ 300px，已接近限高。）
   */
  const showToggle = overflowing || text.length > 800

  return (
    <>
      <div className="reasoning-body">
        <div
          ref={clampRef}
          className={`reasoning-clamp${expanded ? ' reasoning-clamp--open' : ''}`}
          data-running={running ? '' : undefined}
        >
          <div ref={innerRef}>
            <ReasoningText text={text} running={running} />
          </div>
        </div>
      </div>
      {showToggle && (
        <button
          type="button"
          className="reasoning-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <ChevronDown size={12} className={`reasoning-toggle__chevron${expanded ? ' reasoning-toggle__chevron--open' : ''}`} />
          {expanded ? '收起思考链' : '展开全部思考链'}
        </button>
      )}
    </>
  )
}

