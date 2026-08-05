// ====== 核心基础类型（无依赖） ======

export type Mode = 'office' | 'coding' | 'design'

/**
 * 模型 ID — 内置 DeepSeek 型号保留字面量提示，`(string & {})` 放开自定义服务商的任意模型名。
 */
export type ModelId = 'deepseek-v4-pro' | 'deepseek-v4-flash' | (string & {})

/** 思考强度：off=关闭, high=高, max=最高, ultra=终极（工程范式+监督Agent） */
export type ReasoningEffort = 'off' | 'high' | 'max' | 'ultra'

export type FontSize = 'sm' | 'md' | 'lg'
