/**
 * 图标系统 · 统一入口
 *
 * 推荐用法：
 *   import { Icon, SuccessIcon } from '@/components/icons'
 *
 * 项目内更老的 `import { Icon } from '@/components/Icon'` 仍然有效，
 * 那里是一个薄壳，重新导出本模块。
 */
export * from './types'
export {
  ICON_CATALOG,
  ICON_CATALOG_BY_CATEGORY,
  ICON_ALIAS_TO_NAME
} from './catalog'
export { Icon } from './Icon'
export { default } from './Icon'
export {
  SuccessIcon,
  WarningIcon,
  ErrorIcon,
  InfoIcon,
  LoadingIcon,
  ForbiddenIcon,
  PendingIcon,
  SUCCESS,
  WARNING,
  ERROR,
  INFO,
  MUTED
} from './StatusIcon'