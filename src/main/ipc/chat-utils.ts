// ── 弹窗等待超时 ──
// requestConfirmation / requestUserInput 若渲染层无人响应（弹窗被遮挡、组件未挂载、渲染进程异常等），
// 无超时会导致 Agent Loop 永久挂起。以下超时兜底保证循环必然恢复。
export const CONFIRM_TIMEOUT_MS = 60_000
export const USER_INPUT_TIMEOUT_MS = 120_000

/** Promise.race 超时包装 — 超时返回 defaultValue，避免 Promise 永不 resolve */
export function withTimeout<T>(promise: Promise<T>, ms: number, defaultValue: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(defaultValue), ms)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}
