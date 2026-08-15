import { useStore } from '@renderer/store/useStore'
import { ContextRightPanel } from './office/ContextRightPanel'
import { CodingRightPanel } from './coding/CodingRightPanel'
import { DesignRightPanel } from './design/DesignRightPanel'

/** 右侧面板 — 根据当前模式分发到对应子面板 */
export function RightSidebar(): React.ReactElement {
  const currentMode = useStore((s) => s.currentMode)
  // 仅订阅布尔值 — 避免订阅整个 conversations 数组导致每次会话内容变更都重渲染
  const hasConversation = useStore((s) => s.conversations.some((c) => c.id === s.currentConversationId))

  if (currentMode === 'design') return <DesignRightPanel hasConversation={hasConversation} />
  if (currentMode === 'coding') return <CodingRightPanel />
  return <ContextRightPanel hasConversation={hasConversation} />
}
