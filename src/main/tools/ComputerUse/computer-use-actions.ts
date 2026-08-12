/**
 * ComputerUse action 处理函数 — barrel re-export
 *
 * 拆分为感知动作和交互动作两个模块，此文件仅做 re-export 以保持导入路径不变。
 */

export { doScreenshot, doObserve, doFindWindow } from './cu-perception-actions'
export {
  doClickElement, doSetText, doReadText,
  doMouseClick, doMouseMove, doMouseDrag, doMouseScroll,
  doKeyPress, doKeyType, doWait
} from './cu-interaction-actions'
