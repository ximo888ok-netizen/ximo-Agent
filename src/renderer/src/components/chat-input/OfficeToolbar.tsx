import { ModeToolPanel } from './ModeToolPanel'
import { SkillPicker } from './SkillPicker'

/**
 * Office 模式底部工具栏
 *
 * 后台工具（浏览器 / 录制 / 操控电脑）已收敛进 ModeToolPanel 的单一入口，
 * 项目目录入口归并到左侧栏主按钮，此处只保留两个触发器。
 */
export function OfficeToolbar(): React.ReactElement {
  return (
    <div className="flex items-center gap-1">
      <ModeToolPanel />
      <SkillPicker />
    </div>
  )
}
