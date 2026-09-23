// ====== 核心基础类型（无依赖） ======

export type Mode = 'office' | 'coding' | 'design'

/**
 * 模型 ID — 内置 DeepSeek 型号保留字面量提示，`(string & {})` 放开自定义服务商的任意模型名。
 */
export type ModelId = 'deepseek-v4-pro' | 'deepseek-flash' | (string & {})

/**
 * 思考强度 —— 五档，与面板上的「关闭 / 低 / 中 / 高 / 超高」从左到右一一对应。
 *
 * 取值直接透传给 DeepSeek 的 `reasoning_effort`（官方接受 `low/high/max`），
 * 只有 `off` 是应用层语义（= 不发思考参数、不输出思维链）。
 * `ultra` 是应用层自定义档：API 层等价于 `max`，额外在客户端注入工程范式与监督审查。
 */
export type ReasoningEffort = 'off' | 'low' | 'high' | 'max' | 'ultra'

export type FontSize = 'sm' | 'md' | 'lg'

/**
 * 自动化等级（Auto Mode）—— 全应用单一来源。
 *
 * 三档与输入框下方的下拉选择一一对应：
 *   off  → 手动审批：危险操作逐个弹窗确认
 *   safe → 自动审批：读取与常规操作自动，危险操作仍确认
 *   yolo → 完全访问：全部自动执行，不再询问
 *
 * 注意：`yolo` 是唯一一档会**完全关闭确认链路**（主进程不再下发 confirm:request），
 * 因此它同时驱动 `handlers.yoloMode`（历史遗留的布尔字段，现由本等级派生）。
 */
export type AutoModeLevel = 'off' | 'safe' | 'yolo'
