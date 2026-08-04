import { FileText, SearchCode, FolderTree, GitBranch, CheckCircle, FolderSearch, Bug, FlaskConical, Sparkles, Package } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { ContextEntry } from '../RightSidebar'
import { ProjectFileTreePanel } from './ProjectFileTreePanel'

/** 编程模式工具入口列表 */
const CODING_ENTRIES: ContextEntry[] = [
  { id: 'file-read', label: '读取文件', icon: FileText, subtitle: '查看项目文件内容', prompt: '请使用 file_read 工具读取以下文件的内容：[文件路径]' },
  { id: 'file-search', label: '搜索文件', icon: SearchCode, subtitle: '在项目中搜索关键词', prompt: '请使用 file_search 工具搜索项目中包含 [关键词] 的文件。' },
  { id: 'file-list', label: '项目结构', icon: FolderTree, subtitle: '查看项目目录树', prompt: '请使用 file_list 工具列出当前项目的目录结构。' },
  { id: 'git-status', label: 'Git 状态', icon: GitBranch, subtitle: '查看当前分支和变更', prompt: '请使用 git_operations 工具查看当前项目的 Git 状态和最近提交。' },
  { id: 'code-lint', label: '代码检查', icon: CheckCircle, subtitle: '检查代码质量与规范', prompt: '请使用 code_lint 工具检查当前项目的代码质量。' },
  { id: 'code-format', label: '格式化代码', icon: Sparkles, subtitle: 'Prettier + ESLint 自动修复', prompt: '请使用 code_format 工具格式化当前项目的代码（先 prettier 再 eslint --fix）。' },
  { id: 'dep-check', label: '依赖检查', icon: Package, subtitle: '检查缺失依赖并安装', prompt: '请使用 dependency_check 工具检查当前项目的依赖是否完整，并列出缺失的包。' },
  { id: 'bug-fix', label: '修复 Bug', icon: Bug, subtitle: '定位问题并给出修复', prompt: '请帮我检查当前项目中可能存在的 Bug，定位问题并给出修复方案。' },
  { id: 'run-tests', label: '运行测试', icon: FlaskConical, subtitle: '执行单元测试', prompt: '请帮我运行当前项目的单元测试，并报告测试结果。' },
  { id: 'scan-project', label: '扫描项目', icon: FolderSearch, subtitle: '分析项目架构和技术栈', prompt: '请使用 project_context 工具扫描当前项目目录，帮我了解项目架构和技术栈。' }
]

/** 编程模式右侧面板 — 有项目时显示文件树，无项目时显示编码工具入口 */
export function CodingRightPanel({ hasConversation }: { hasConversation: boolean }): React.ReactElement {
  const projectPath = useStore((s) => s.projectPath)

  if (projectPath) {
    return <ProjectFileTreePanel projectPath={projectPath} />
  }
  return <CodingEntriesPanel />
}

/** 无项目时的编码工具入口面板 */
function CodingEntriesPanel(): React.ReactElement {
  const sendMessage = useStore((s) => s.sendMessage)

  return (
    <aside className="flex h-full w-full flex-col border-l border-border-subtle glass">
      <div className="px-4 pt-5 pb-3">
        <h3 className="text-sm font-semibold tracking-tight text-text-primary">编码工具</h3>
        <p className="mt-1 text-xs text-text-muted">快速执行编码操作</p>
      </div>
      <div className="flex-1 px-3 space-y-2 overflow-y-auto pb-3">
        {CODING_ENTRIES.map((entry, idx) => {
          const IconCmp = entry.icon
          return (
            <button
              key={entry.id}
              onClick={() => sendMessage(entry.prompt, { skipNetworkHint: true })}
              className="ios-card group flex w-full items-center gap-3 p-3 text-left animate-slide-up"
              style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'backwards' }}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent transition-all duration-300 group-hover:bg-accent/20 group-hover:shadow-glow group-hover:scale-105">
                <IconCmp size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">{entry.label}</p>
                <p className="text-[11px] text-text-muted">{entry.subtitle}</p>
              </div>
            </button>
          )
        })}
      </div>
      <div className="flex-shrink-0 border-t border-border-subtle px-3 py-2.5">
        <div className="ios-card border-dashed flex items-center gap-2.5 px-3 py-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg text-text-muted">
            <FolderSearch size={13} />
          </span>
          <p className="text-[11px] text-text-muted">打开项目后显示文件树</p>
        </div>
      </div>
    </aside>
  )
}
