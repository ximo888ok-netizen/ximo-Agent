import { useStore } from '@renderer/store/useStore'
import { ContextRightPanel } from './office/ContextRightPanel'
import { CodingRightPanel } from './coding/CodingRightPanel'
import { DesignRightPanel } from './design/DesignRightPanel'

/** 右侧面板 — 根据当前模式分发到对应子面板 */
export function RightSidebar(): React.ReactElement {
  const currentMode = useStore((s) => s.currentMode)
  const conversations = useStore((s) => s.conversations)
  const currentConversationId = useStore((s) => s.currentConversationId)
  const hasConversation = !!conversations.find((c) => c.id === currentConversationId)

  if (currentMode === 'design') return <DesignRightPanel hasConversation={hasConversation} />
  if (currentMode === 'coding') return <CodingRightPanel hasConversation={hasConversation} />
  return <ContextRightPanel hasConversation={hasConversation} />
}
