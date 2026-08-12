import type { ModeConfig } from '@shared/types'
import { OFFICE_CONFIG } from './office-config'
import { CODING_CONFIG } from './coding-config'
import { DESIGN_CONFIG } from './design-config'

/**
 * 三大模式配置：系统提示词 + 快捷操作模板
 * 每个模式针对不同场景优化 DeepSeek-V4 的输出风格
 */
export const MODE_CONFIGS: Record<'office' | 'coding' | 'design', ModeConfig> = {
  office: OFFICE_CONFIG,
  coding: CODING_CONFIG,
  design: DESIGN_CONFIG,
}

export const MODE_LIST = Object.values(MODE_CONFIGS)
