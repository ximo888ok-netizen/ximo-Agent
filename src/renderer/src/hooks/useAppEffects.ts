import { useEffect, useRef, useCallback, useState } from 'react'
import { useStore } from '@renderer/store/useStore'
import {
  applyAccentTokens,
  clearAccentTokens,
  deriveAccentTokens,
  type AccentTokens,
  type ThemeMode,
} from '@renderer/lib/accent'

/** 应用全局副作用 — 键盘快捷键、主题、窗口状态 */
export function useAppEffects(loaded: boolean): void {
  // ---- 全局键盘快捷键 ----
  // 所有状态在 keydown 时通过 getState() 读取，effect 仅注册一次，避免频繁重绑定
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const ctrl = e.ctrlKey || e.metaKey
      const st = useStore.getState()

      if (ctrl && e.key === 'n' && !e.shiftKey) {
        e.preventDefault()
        if ((st.currentMode === 'coding' || st.currentMode === 'design') && !st.projectPath) {
          void st.openProject()
        } else {
          st.newConversation()
        }
        return
      }
      if (ctrl && (e.key === '1' || e.key === '2' || e.key === '3')) {
        e.preventDefault()
        st.setMode(e.key === '1' ? 'office' : e.key === '2' ? 'coding' : 'design')
        return
      }
      if (ctrl && e.key === ',') {
        e.preventDefault()
        st.setShowSettings(true)
        return
      }
      // Ctrl+B — 收起/展开右侧栏（内嵌浏览器开启时右栏锁定为展开，此时忽略）
      if (ctrl && e.key === 'b') {
        e.preventDefault()
        if (!st.browserOpen) st.toggleRightPanel()
        return
      }
      if (ctrl && e.shiftKey && e.key === 'R') {
        e.preventDefault()
        if (!st.isStreaming) void st.regenerate()
        return
      }
      if (e.key === 'Escape') {
        st.setShowSettings(false)
        st.setShowAgentPanel(false)
        st.setShowMemoryPanel(false)
        st.setShowKnowledgePanel(false)
        st.setShowMcpPanel(false)
        st.setShowSkillPanel(false)
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ---- 窗口最大化状态 ----
  useEffect(() => {
    const applyMaximized = (maximized: boolean): void => {
      document.documentElement.classList.toggle('window-maximized', maximized)
    }
    void window.api.window.isMaximized().then(applyMaximized)
    return window.api.window.onMaximizeChange(applyMaximized)
  }, [])

  // ---- 应用明暗主题 ----
  const settings = useStore((s) => s.settings)

  useEffect(() => {
    const root = document.documentElement
    if (settings?.theme === 'light') {
      root.classList.remove('dark')
    } else {
      root.classList.add('dark')
    }
  }, [settings?.theme])

  // ---- 应用主题色 + 派生强调色令牌（双支派生） ----
  const accentTokensRef = useRef<AccentTokens>({})

  useEffect(() => {
    const root = document.documentElement
    clearAccentTokens(root, accentTokensRef.current)
    accentTokensRef.current = {}

    const themeColor = settings?.themeColor
    if (!themeColor) return

    // 身份色照原样写入（窗口边框、选区、主题包都以它为基准）
    root.style.setProperty('--theme-color', themeColor)

    // 再派生 fill / ink / glow 三支 —— 写在内联样式上，
    // 位置在"主题包变量"与"可视化编辑器变量"之前，保证用户自定义仍可覆盖。
    const mode: ThemeMode = settings?.theme === 'light' ? 'light' : 'dark'
    const tokens = deriveAccentTokens(themeColor, mode)
    applyAccentTokens(root, tokens)
    accentTokensRef.current = tokens
  }, [settings?.themeColor, settings?.theme])

  // ---- 应用自定义主题包 CSS 变量 ----
  const appliedPackVarsRef = useRef<string[]>([])
  useEffect(() => {
    const root = document.documentElement
    for (const name of appliedPackVarsRef.current) {
      root.style.removeProperty(name)
    }
    appliedPackVarsRef.current = []

    const packId = settings?.activeThemePackId
    if (!packId) return

    let cancelled = false
    void window.api.themePack.list().then((packs) => {
      if (cancelled) return
      const pack = packs.find((p) => p.id === packId)
      if (!pack) return
      const mode = settings?.theme === 'light' ? pack.light : pack.dark
      if (!mode) return
      for (const [k, v] of Object.entries(mode)) {
        root.style.setProperty(k, v)
        appliedPackVarsRef.current.push(k)
      }
    })
    return () => { cancelled = true }
  }, [settings?.activeThemePackId, settings?.theme, settings?.themeColor])

  // ---- 应用可视化主题编辑器 CSS 变量 ----
  const appliedEditorVarsRef = useRef<string[]>([])
  useEffect(() => {
    const root = document.documentElement
    // 先清除上一次注入的变量
    for (const name of appliedEditorVarsRef.current) {
      root.style.removeProperty(name)
    }
    appliedEditorVarsRef.current = []

    if (!settings?.customThemeEnabled) return

    const modeVars = settings?.theme === 'light'
      ? settings.customThemeVarsLight
      : settings.customThemeVarsDark
    if (!modeVars) return

    for (const [k, v] of Object.entries(modeVars)) {
      root.style.setProperty(k, v)
      appliedEditorVarsRef.current.push(k)
    }
  }, [
    settings?.customThemeEnabled,
    settings?.customThemeVarsLight,
    settings?.customThemeVarsDark,
    settings?.theme,
  ])

  // ---- 注入自定义 CSS ----
  useEffect(() => {
    const id = 'custom-css-injection'
    const existing = document.getElementById(id)
    if (existing) existing.remove()

    const css = settings?.customCss?.trim()
    if (!css) return

    const style = document.createElement('style')
    style.id = id
    style.textContent = css
    document.head.appendChild(style)

    return () => { style.remove() }
  }, [settings?.customCss])

  // ---- 背景图 ----
  useEffect(() => {
    const id = 'background-layer'
    let layer = document.getElementById(id)
    const bg = settings?.backgroundImage

    if (!bg || bg.type === 'none' || !bg.path) {
      if (layer) layer.remove()
      return
    }

    if (!layer) {
      layer = document.createElement('div')
      layer.id = id
      layer.style.cssText = [
        'position: fixed',
        'inset: 0',
        'z-index: -1',
        'pointer-events: none',
        'overflow: hidden',
      ].join(';')
      document.body.insertBefore(layer, document.body.firstChild)
    }

    const opacity = bg.opacity ?? 0.15
    const blur = bg.blur ?? 0
    const fit = bg.fit ?? 'cover'
    const url = `ximobg://bg/${encodeURIComponent(bg.path)}`

    const fitCss = fit === 'cover' ? 'background-size: cover; background-position: center'
      : fit === 'contain' ? 'background-size: contain; background-position: center'
      : fit === 'center' ? 'background-size: auto; background-position: center'
      : 'background-size: auto; background-repeat: repeat'

    if (bg.type === 'dynamic') {
      // 动态背景 — 用 video 元素
      layer.innerHTML = `<video src="${url}" muted loop autoplay playsinline style="width:100%;height:100%;object-fit:${fit === 'tile' ? 'fill' : fit};opacity:${opacity};filter:blur(${blur}px)"></video>`
    } else {
      // 静态图片 — 用 CSS background-image
      layer.innerHTML = `<div style="width:100%;height:100%;background-image:url('${url}');opacity:${opacity};filter:blur(${blur}px);${fitCss}"></div>`
    }

    return () => { layer?.remove() }
  }, [settings?.backgroundImage])

  // ---- 窗口 ready 信号 ----
  useEffect(() => {
    if (!loaded || !settings) return
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        window.api.window.ready()
      })
    })
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2) }
  }, [loaded, settings])
}

/** 危险操作确认弹窗逻辑 */
export function useConfirmDialog() {
  const [confirmState, setConfirmState] = useState<{ toolName: string; message: string } | null>(null)

  useEffect(() => {
    /*
     * 这里刻意**不再**读 sessionStorage['ximo-yolo']。
     *
     * 那个「本次会话不再提示」的勾选会把后续**所有**确认静默批准，
     * 于是和输入框的自动化等级形成了第二套真相 —— 后果是用户在下来里选「手动审批」，
     * 确认弹窗照样不弹（选项看着生效、实际不生效）。
     *
     * 现在「不再提示」直接切换自动化等级（见 ConfirmDialog 的 onRemember），
     * 全应用只剩等级这一个判据。
     */
    const cleanup = window.api.confirm.onRequest((data) => {
      setConfirmState(data)
    })
    return cleanup
  }, [])

  const handleConfirm = useCallback((): void => {
    window.api.confirm.respond(true)
    setConfirmState(null)
  }, [])

  const handleCancel = useCallback((): void => {
    window.api.confirm.respond(false)
    setConfirmState(null)
  }, [])

  return { confirmState, handleConfirm, handleCancel }
}
