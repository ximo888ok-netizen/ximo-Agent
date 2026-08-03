import { useEffect, useRef, useCallback, useState } from 'react'
import { useStore } from '@renderer/store/useStore'

/** 应用全局副作用 — 键盘快捷键、主题、窗口状态 */
export function useAppEffects(loaded: boolean): void {
  // ---- 全局键盘快捷键 ----
  const newConversation = useStore((s) => s.newConversation)
  const setMode = useStore((s) => s.setMode)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const setShowAgentPanel = useStore((s) => s.setShowAgentPanel)
  const setShowMemoryPanel = useStore((s) => s.setShowMemoryPanel)
  const setShowKnowledgePanel = useStore((s) => s.setShowKnowledgePanel)
  const regenerate = useStore((s) => s.regenerate)
  const isStreaming = useStore((s) => s.isStreaming)
  const openProject = useStore((s) => s.openProject)
  const projectPath = useStore((s) => s.projectPath)

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const ctrl = e.ctrlKey || e.metaKey

      if (ctrl && e.key === 'n' && !e.shiftKey) {
        e.preventDefault()
        const mode = useStore.getState().currentMode
        const path = useStore.getState().projectPath
        if ((mode === 'coding' || mode === 'design') && !path) {
          void openProject()
        } else {
          newConversation()
        }
        return
      }
      if (ctrl && (e.key === '1' || e.key === '2' || e.key === '3')) {
        e.preventDefault()
        setMode(e.key === '1' ? 'office' : e.key === '2' ? 'coding' : 'design')
        return
      }
      if (ctrl && e.key === ',') {
        e.preventDefault()
        setShowSettings(true)
        return
      }
      if (ctrl && e.shiftKey && e.key === 'R') {
        e.preventDefault()
        if (!isStreaming) void regenerate()
        return
      }
      if (e.key === 'Escape') {
        setShowSettings(false)
        setShowAgentPanel(false)
        setShowMemoryPanel(false)
        setShowKnowledgePanel(false)
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [newConversation, setMode, setShowSettings, setShowAgentPanel, setShowMemoryPanel, setShowKnowledgePanel, regenerate, isStreaming, openProject, projectPath])

  // ---- 窗口最大化状态 ----
  useEffect(() => {
    const applyMaximized = (maximized: boolean): void => {
      document.documentElement.classList.toggle('window-maximized', maximized)
    }
    void window.api.window.isMaximized().then(applyMaximized)
    return window.api.window.onMaximizeChange(applyMaximized)
  }, [])

  // ---- 应用主题色 + 明暗主题 ----
  const settings = useStore((s) => s.settings)

  useEffect(() => {
    if (settings?.themeColor) {
      document.documentElement.style.setProperty('--theme-color', settings.themeColor)
    }
  }, [settings?.themeColor])

  useEffect(() => {
    const root = document.documentElement
    if (settings?.theme === 'light') {
      root.classList.remove('dark')
    } else {
      root.classList.add('dark')
    }
  }, [settings?.theme])

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
    const url = `ximobg://${bg.path}`

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
    const cleanup = window.api.confirm.onRequest((data) => {
      if (localStorage.getItem('ximo-yolo') === 'true') {
        window.api.confirm.respond(true)
        return
      }
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
