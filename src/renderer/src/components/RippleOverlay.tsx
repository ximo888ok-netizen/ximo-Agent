import { useEffect, useRef } from 'react'

/**
 * 鼠标跟随水中波纹覆盖层。
 * 监听全局 mousemove，按距离/时间节流生成扩散波纹，
 * 波纹用 CSS 动画扩散淡出，结束后从 DOM 移除。
 * 全程 pointer-events:none，不阻断任何交互。
 */
export function RippleOverlay(): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    // 尊重用户的无障碍动效偏好
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let lastX = -999
    let lastY = -999
    let lastTime = 0
    let rafId = 0
    let pendingX = 0
    let pendingY = 0

    const spawn = (x: number, y: number): void => {
      const ripple = document.createElement('div')
      ripple.className = 'ripple-wave'
      ripple.style.left = `${x}px`
      ripple.style.top = `${y}px`
      container.appendChild(ripple)
      ripple.addEventListener('animationend', () => ripple.remove(), { once: true })
    }

    const onMove = (e: MouseEvent): void => {
      pendingX = e.clientX
      pendingY = e.clientY
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        const now = performance.now()
        const dist = Math.hypot(pendingX - lastX, pendingY - lastY)
        // 移动超过 38px 或静止超过 90ms 才生成波纹，避免堆积
        if (dist > 38 || now - lastTime > 90) {
          spawn(pendingX, pendingY)
          lastX = pendingX
          lastY = pendingY
          lastTime = now
        }
      })
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  return <div ref={containerRef} className="ripple-overlay" aria-hidden="true" />
}
