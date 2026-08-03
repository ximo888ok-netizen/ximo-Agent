import { useState } from 'react'
import { Box, Palette } from 'lucide-react'
import { CompactTab, type PanelTab } from './template-shared'
import { ComponentsTab } from './ComponentsTab'
import { StylesTab } from './StylesTab'
import designSystemsCatalog from './design-systems-catalog.json'
import uiComponentsCatalog from './ui-components-catalog.json'

const STYLES = designSystemsCatalog as unknown[]
const COMPONENTS = (uiComponentsCatalog as { components: unknown[] }).components

// ─── 主组件 ────────────────────────────────────────────

export function DesignTemplatePanel(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<PanelTab>('components')

  return (
    <div className="glass flex h-full flex-col">
      {/* 顶部 Tab */}
      <div className="flex items-center gap-0.5 border-b border-border-subtle px-1.5 py-1.5 shrink-0">
        <CompactTab active={activeTab === 'components'} onClick={() => setActiveTab('components')} icon={Box} label="UI库" count={COMPONENTS.length} />
        <CompactTab active={activeTab === 'styles'} onClick={() => setActiveTab('styles')} icon={Palette} label="风格" count={STYLES.length} />
      </div>
      {activeTab === 'components' ? <ComponentsTab /> : <StylesTab />}
    </div>
  )
}
