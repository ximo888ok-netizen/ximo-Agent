/** OfficeDocsTool 辅助函数 — 常量、类型、参数转换、快照备份 */

export const SUPPORTED_ACTIONS = [
  'create', 'get', 'query', 'set', 'add', 'remove', 'move',
  'batch', 'merge', 'validate', 'dump', 'view', 'save', 'help'
] as const

export type Action = typeof SUPPORTED_ACTIONS[number]

/** 写操作集合 — 执行前对目标文件做快照备份（可回退） */
export const WRITE_ACTIONS: ReadonlySet<string> = new Set(['create', 'set', 'add', 'remove', 'move', 'batch', 'merge', 'dump', 'save'])

/** 快照备份 — 写操作前调用，返回快照路径或 null */
export async function snapshotIfExists(filePath: string): Promise<string | null> {
  try {
    const { existsSync } = await import('fs')
    const { copyFile, mkdir } = await import('fs/promises')
    const { join, basename } = await import('path')
    const { tmpdir } = await import('os')
    if (!existsSync(filePath)) return null
    const snapDir = join(tmpdir(), 'ximo-agent-snapshots')
    const safeName = basename(filePath).replace(/[^\w.-]/g, '_')
    const bakPath = join(snapDir, `${safeName}.snapshot-${Date.now()}.bak`)
    await mkdir(snapDir, { recursive: true })
    await copyFile(filePath, bakPath)
    return bakPath
  } catch {
    return null
  }
}

/**
 * 将 properties 对象转换为 officecli 的 --prop 键值参数数组（实测语法：必须 --prop 前缀）
 * 过滤保留字：type 由 --type 参数传递，不进入 --prop（实测：--prop type= 不受支持）
 */
export function propsToArgs(props: Record<string, unknown> | undefined): string[] {
  if (!props || typeof props !== 'object') return []
  const args: string[] = []
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue
    if (k === 'type') continue
    const val = typeof v === 'object' ? JSON.stringify(v) : String(v)
    args.push('--prop', `${k}=${val}`)
  }
  return args
}

/**
 * 将 tool 层 operations 转换为 officecli batch 的 command 数组。
 * 支持两种输入格式：
 * 1. 工具层格式：{ action, path, properties, ... } → 转换为 { command, path, props, ... }
 * 2. officecli 原生格式：{ command, path, props, ... } → 原样透传
 */
export function operationsToCommands(ops: unknown[]): unknown[] {
  return ops.map((op) => {
    if (!op || typeof op !== 'object') return op
    const o = op as Record<string, unknown>

    if (o.command) {
      const native: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(o)) {
        if (v !== undefined) native[k] = v
      }
      return native
    }

    const cmd: Record<string, unknown> = {}
    if (o.action) cmd.command = o.action
    if (o.path !== undefined) cmd.path = o.path
    if (o.parent !== undefined) cmd.parent = o.parent
    if (o.selector !== undefined) cmd.selector = o.selector
    if (o.type !== undefined) cmd.type = o.type
    if (o.properties && typeof o.properties === 'object') cmd.props = o.properties
    if (o.to !== undefined) cmd.to = o.to
    if (o.after !== undefined) cmd.after = o.after
    if (o.before !== undefined) cmd.before = o.before
    if (o.path2 !== undefined) cmd.path2 = o.path2
    return cmd
  })
}
