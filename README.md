# Ximo-Agent

> **DeepSeek-V4 驱动的全能 AI Agent 桌面工作台**  
> 办公 / 编程 / 设计 三模式 · 内嵌完整工具系统 · 技能录制与回放 · MCP 协议扩展 · 254 位 AI 专家  
> 基于 Electron 33 + React 18 + TypeScript

---

## 目录

- [安装](#安装)
- [快速开始](#快速开始)
- [三模式工作台](#三模式工作台)
- [核心功能](#核心功能)
- [工具系统详解](#工具系统详解)
- [AI 引擎与上下文管理](#ai-引擎与上下文管理)
- [技能系统](#技能系统)
- [AI 专家库](#ai-专家库)
- [知识库与记忆](#知识库与记忆)
- [设计系统](#设计系统)
- [个性化定制](#个性化定制)
- [MCP 协议支持](#mcp-协议支持)
- [Checkpoint 系统](#checkpoint-系统)
- [权限与安全](#权限与安全)
- [GPU 硬件加速](#gpu-硬件加速)
- [更新机制](#更新机制)
- [技术栈](#技术栈)
- [目录结构](#目录结构)
- [开发命令](#开发命令)
- [扩展点](#扩展点)
- [配置与约定](#配置与约定)

---

## 安装

预构建安装包可从以下渠道下载，双击运行后按向导完成安装：

- [GitHub Releases](https://github.com/ximo888ok-netizen/ximo-Agent/releases)
- [Gitee Releases](https://gitee.com/ximo666ge/ximo-Agent/releases)

**系统要求：** Windows x64（macOS / Linux 支持有限）

---

## 快速开始

1. 启动应用后，进入**设置**（`Ctrl+,`）配置 API Key
2. 默认连接 DeepSeek API，支持 `deepseek-v4-pro` 和 `deepseek-v4-flash` 两种模型
3. 使用 `Ctrl+1`（办公）、`Ctrl+2`（编程）、`Ctrl+3`（设计）切换模式
4. 在底部输入框输入需求，Agent 自动调用工具完成任务

---

## 三模式工作台

### 办公模式（Office）
面向文档处理、信息搜集、会议纪要等场景。
- **联网搜索**：多引擎搜索（Bing/Baidu/DuckDuckGo）+ 网页抓取 + 缓存
- **浏览器自动化**：Playwright 驱动的完整浏览器操控
- **桌面操控**：pi-computer-use 桥接，可操控电脑 UI
- **Office 文档**：OfficeCLI 驱动的 Word/Excel/PowerPoint 读改（`office_docs`）
- **技能录制**：rrweb 录制操作序列，沉淀为可复用技能
- **AI 专家库**：254 位专家按需激活
- **网络抓包**：API 抽取、JS Hook、Storage 检查

### 编程模式（Coding）
面向代码开发、调试、重构等任务。
- **文件系统**：完整的文件 CRUD + 搜索 + 批量编辑
- **代码质量**：代码执行、Lint、格式化、依赖检查、项目索引
- **AI 代码审查**：阿里 OCR (Open Code Review) 集成，确定性工程 + LLM 混合审查
- **终端**：命令执行，支持指定工作目录和超时
- **Git 操作**：状态查看、差异对比、提交、分支管理
- **Checkpoint 系统**：文件修改自动创建快照，支持按轮次回滚
- **Plan/Spec 工作流**：`/plan` 提问规划，`/spec` 需求规范审核
- **语义索引**：扫描源码导出符号，支持按符号名搜索定位

### 设计模式（Design）
面向 UI 设计、原型生成、设计审查等场景。
- **UI 生成**：AI 驱动的 React + Tailwind CSS 组件生成
- **实时预览**：独立 Electron 窗口预览 HTML/React 组件
- **130+ 设计系统**：Apple、Stripe、Notion、OpenAI 等品牌设计 token
- **4 套设计模板**：网页原型、仪表盘、移动端 App、SaaS 着陆页
- **139 个 UI 动效组件**：交互组件、动画效果、背景特效、文字动画
- **主题设计**：`theme_design` 一键应用品牌主题到应用外观
- **设计审查**：UX 质量审查、可量化审计、无障碍（WCAG 2.1 AA）专项
- **颜色系统分析**：色阶、对比度、语义色映射、暗色适配
- **自由画布**：拖拽式组件布局

---

## 核心功能

### Agent Loop（工具调用循环）
自实现的 Agent 工具调用循环，参考 Reasonix 设计：
- **思考 → 工具调用 → 观察 → 思考 → ... → 最终回答**
- 支持最多 30 轮连续工具调用（可配置）
- 每轮可并行调用多个工具
- 支持 `off` / `high` / `max` / `ultra` 四级思考强度
- `ultra` 模式下启用独立监督 Agent 审查输出质量
- **规划阶段**：复杂任务先跑一次规划（`planning-phase.ts` 分析需求、筛选工具），再进入主循环

### 上下文管理
- **A1 字节稳定前缀**：消息列表只追加不重排，保证 DeepSeek prompt 缓存命中
- **A2 reasoning_content 空 key**：thinking 模式下 tool_calls turn 保持缓存兼容
- **A4 工具 schema 字典序归一化**：保持 tools JSON 字节稳定
- **B1/B2 四档压缩**：50% soft → 60% snip → 80% compact → 90% force
- **Stuck 保护**：连续 2 次压缩后暂停，让前缀增长恢复命中率
- **D1 会话聚合计数器**：压缩不重置累计 token 统计
- **D2 PrefixShape 哈希诊断**：缓存命中检测

### 模式记忆
跨会话学习能力，独立于每个模式：
- 记录用户习惯、踩过的坑、工具语法要点
- 从 system prompt 拆出为独立消息层，避免记忆更新破坏缓存前缀
- 支持定期精简（合并重复、删除过时），保持 30 行以内

### 知识库
基于 Orama（BM25 全文检索）的持久化知识库，按模式隔离：
- 添加 / 搜索 / 分页浏览 / 更新 / 删除知识条目
- 支持标签（tags）分类与来源标记
- 存储于 `userData/ximo-agent/knowledge/<mode>/entries.json`

### Checkpoint 系统
会话级文件编辑检查点：
- 每次用户发消息时开启新轮次（turn）
- 写工具（file_edit/file_write/multi_edit/move_file）修改前自动快照
- 支持回滚到指定轮次的所有文件状态
- 快照存储在系统临时目录，不污染用户项目

### 流式聊天
- 实时流式输出思考和回复内容
- 多轮工作步骤分段展示（thinking → calling → done）
- **专家工作卡片**：专家团编排时，每位子 Agent 的工作过程（工具调用 → 结果 → 最终产出）以卡片形式实时可视化，可展开查看细节
- Token 用量实时统计（total / prompt / cache_hit / cache_miss / context）
- API 连接断开自动重试（最多 3 次）

### 快捷键
| 快捷键 | 功能 |
|--------|------|
| `Ctrl+N` | 新建对话 |
| `Ctrl+1` | 办公模式 |
| `Ctrl+2` | 编程模式 |
| `Ctrl+3` | 设计模式 |
| `Ctrl+,` | 打开设置 |
| `Ctrl+Shift+R` | 重新生成回复 |
| `Escape` | 关闭弹窗 |

---

## 工具系统详解

工具系统采用 **单例注册表**（`ToolRegistry`）统一管理，按模式懒加载。启动时零工具加载，按需动态 import。

### 工具域列表

| 工具域 | 工具列表 | 模式 |
|--------|----------|------|
| **WebIntelligence** | `web_search`、`web_fetch`、`web_cache`、`web_research` | 办公/编程/设计 |
| **Browser** | `browser_navigate`、`browser_click`、`browser_type`、`browser_screenshot`、`browser_get_content`、`browser_execute_js`、`browser_network_monitor` | 办公 |
| **ComputerUse** | `computer_use`、`find_roots`、`observe_ui`、`search_ui`、`act_ui`、`read_text`、`wait_for` | 办公 |
| **FileSystem** | `file_read`、`file_write`、`file_list`、`file_search`、`file_edit`、`file_delete`、`multi_edit`、`move_file`、`todo_write` | 全部 |
| **CodeQuality** | `code_execute`、`code_lint`、`code_format`、`dependency_check`、`project_context`、`project_index` | 办公/编程 |
| **CodeReview** | `code_review`（阿里 OCR 混合审查） | 全部 |
| **Terminal** | `terminal_exec` | 办公/编程 |
| **Git** | `git_operations` | 办公/编程 |
| **Design** | `design_critique`、`design_audit`、`design_a11y`、`design_color`、`design_preview`、`design_template`、`design_style`、`design_component`、`theme_design` | 设计 |
| **UIGenerate** | `ui_generate` | 设计 |
| **Skill** | `skill_record`、`skill_invoke`、`agent_expert` | 全部 |
| **DynamicTool** | `create_tool`（运行时创建自定义工具） | 全部 |
| **Office** | `office_docs`（OfficeCLI 驱动 Word/Excel/PowerPoint） | 办公 |
| **Vision** | `vision_analyze`（Agnes 2.5 Flash 视觉模型） | 全部 |
| **Memory** | `memory_update`（模式记忆） | 全部 |
| **Knowledge** | `knowledge`（知识库） | 全部 |
| **PlanSpec** | `plan_ask`、`spec_review` | 编程 |
| **Network** | `network_capture`、`network_replay`、`storage_inspect`、`js_hook`、`api_extract` | 办公 |
| **MCP** | 动态注册（外部 MCP 服务器桥接） | 办公 |

### 工具接口

每个工具实现 `Tool` 接口：

```typescript
interface Tool {
  readonly definition: ToolDefinition  // 名称、描述、参数 schema
  execute(toolCall, onChunk?, signal?, context?): Promise<ToolResult>
}
```

### 权限系统

基于规则的 allow/ask/deny 引擎：
- **YOLO 模式**：所有操作自动允许
- **Safe 模式**：只读操作自动允许，写操作需确认
- **Off 模式**：所有操作逐条确认
- 支持按工具名 + 参数动态匹配规则

---

## AI 引擎与上下文管理

### 多服务商支持
内置 DeepSeek 服务商（能力全开），同时支持**自定义 OpenAI 兼容服务商**：
- 每个服务商独立配置 `baseUrl` / `apiKey` / `models` / `contextWindow` / `maxOutputTokens`
- 能力开关门控：`sendReasoningParams`（thinking 参数）、`sendStreamUsage`（用量统计）
- 自动拉取模型列表（OpenAI 兼容 `GET /models`）
- 上下文窗口感知：根据服务商能力动态调整压缩阈值
- 自定义服务商缺失时自动回退内置 DeepSeek，链路不中断

### DeepSeek 客户端

自实现 DeepSeek API 客户端，位于 `src/main/deepseek/`：

- **流式调用**：支持 tool_calls 的多轮对话
- **本地 BPE 分词器**：精确计 token，不依赖 API 返回
- **连接重试**：最多 3 次自动重连
- **内容净化**：移除不可见字符防止 API JSON 解析失败

### 缓存优化架构

```
消息列表按稳定性递减排列：
[0] system — 稳定系统提示词（模式提示词+自定义指令+专家人格，~25KB+）
[1] system — 运行环境信息（日期级，同一天内不变）
[2] system — 运行时工具状态（浏览器/操控电脑开关，偶尔变化）
[3] system — 模式记忆（Agent 调用 memory_update 时变化）
[4+] 对话历史（每轮追加，天然扩展）
```

关键设计：记忆从 system prompt 中拆出为独立消息层，避免记忆更新导致整个 25KB+ 系统提示词缓存全部失效。

### 监督审查（Ultra 模式）

`ultra` 思考强度下启用独立监督 Agent：
- 审查：偷懒（跳过验证）、跑偏（偏离目标）、违规（违反五锁协议）
- 审查结果通过 `StreamChunk.supervision` 推送前端
- 发现问题时通过纠正消息注入主 Agent 上下文

---

## 技能系统

### 录制技能
通过 rrweb 录制用户操作序列，保存为可复用技能：
- 录制浏览器操作（点击、导航、输入等）
- 录制 API 端点调用
- 录制完成后自动生成技能描述
- 下次相似任务可一键调用

### 导入技能
支持导入 SKILL.md 格式技能文件：
- 兼容 Claude / CatPaw / Open Design 等格式
- 解析 YAML frontmatter + Markdown 正文
- 支持按触发词匹配自动调用

### 动态工具
`create_tool` 工具可在运行时创建自定义工具（JavaScript 沙箱执行），即时注册到工具系统供后续调用。

### 专家技能
AI 专家激活后自动保存为技能：
- 名称格式：`专家：XXX`
- 后续可直接 `skill_invoke(skill_name="专家：XXX", task="任务")` 调用
- 主 Agent 自主召唤专家时也会自动沉淀技能，重复任务可零成本复用

---

## AI 专家库

基于 [agency-agents](https://github.com/msitarzewski/agency-agents) 的 254 位 AI 专家，分属 17 个部门：

| 部门 | 涵盖 |
|------|------|
| 工程部 | 前端开发、后端开发、架构师、DevOps 等 |
| 设计部 | UI/UX 设计师、品牌设计师、动效设计师等 |
| 市场部 | 内容营销、SEO、社交媒体等 |
| 产品部 | 产品经理、数据分析师等 |
| 安全部 | 安全工程师、渗透测试等 |
| 测试部 | QA 工程师、自动化测试等 |
| 财务/销售/学术/医疗... | 各领域专家 |

### 三种使用模式

**① 人格扮演（勾选 1 位专家）**
输入框点击「专家」按钮勾选 1 位专家后发送：
- 该专家的角色描述（人格、能力、工作风格）注入系统提示词
- 主 Agent 以该专家的视角和风格直接回答，无子 Agent 调度

**② 专家团编排（勾选 2+ 位专家）**
多选专家后进入**两阶段编排协议**：
- **阶段一（方案设计）**：禁止调用工具，主 Agent 深度理解需求 → 拆解子任务 → 明确专家分工 → 输出详细实施方案
- **阶段二（有序实施）**：严格按方案**逐一**调用 `agent_expert(action="activate", expert_id=..., task=...)` 调度专家，一个完成后再调下一个，最后综合交付

**③ 自主召唤（未勾选专家）**
主 Agent 默认具备**自主专家调度授权**：
- 任务涉及知识范围外的专业领域、复杂度高需多角色协作、或需要第二意见时，主 Agent 主动 `search` 定位专家 → `activate + task` 派活
- 简单任务不召唤（专家是增强手段，不是必经流程）

### 子 Agent 工作可视化

专家被调度后，其**工作全过程实时可视化**（`ExpertWorkCard` 卡片）：

- 每个阶段事件（开始 / 工具调用 / 工具结果 / 中间思考 / 完成）以结构化 `subAgentEvent` 流式推送
- 卡片头部显示专家名 + 任务摘要 + 状态（工作中/已完成），可展开查看工具调用轨迹与最终产出
- 事件随消息持久化（`StreamingSegment.expertEvents` / `ToolResult.metadata.expertEvents`），会话刷新后仍可回看

### 自定义专家
用户可通过 `experts.json`（`userData/ximo-agent/`）添加自定义专家，与内置 254 位专家合并后供工具读取。

### 工作流程
1. `agent_expert(action="search")` 搜索匹配专家
2. `agent_expert(action="activate")` 激活专家 → 自动分析提示词、配置工具、生成工作流、保存为技能
3. 审阅后带 task 再次 activate 让专家独立处理
4. 后续直接 `skill_invoke` 调用已保存的专家技能

---

## 知识库与记忆

| 能力 | 说明 |
|------|------|
| **模式记忆** | 跨会话学习（`memory_update`），记录用户习惯/踩过的坑/工具语法，按模式隔离，自动注入提示词 |
| **知识库** | Orama BM25 全文检索（`knowledge`），按模式隔离，支持标签分类与分页浏览 |
| **两者关系** | 记忆偏"行为习惯"（自动注入），知识库偏"经验沉淀"（按需搜索） |

---

## 设计系统

### 130+ 品牌设计系统
每个设计系统包含：
- `DESIGN.md` — 设计指南（颜色用法、排版层级、组件规范）
- `manifest.json` — 元数据
- `tokens.css` — CSS 变量（`--accent`、`--bg`、`--fg` 等）

**分类（22 类）：**
- AI & LLM：OpenAI、Claude、Cohere、Perplexity 等
- 品牌风格：Apple、GitHub、Stripe、Spotify、Figma、Vercel 等
- 材质效果：Glassmorphism、Neumorphism、Claymorphism、Neon 等
- 汽车：Ferrari、BMW、Lamborghini、Bugatti、Tesla 等
- 更多：现代极简、大胆表现、复古、企业、游戏等

### 4 套设计模板
- **web-prototype**：通用网页原型（着陆页、营销页、文档页）
- **dashboard**：仪表盘
- **mobile-app**：移动端 App
- **saas-landing**：SaaS 着陆页

每个模板包含种子文件、布局库和自检清单。

### 139 个 UI 动效组件
移植自 [react-bits](https://github.com/DavidHDev/react-bits)：

| 分类 | 数量 | 示例 |
|------|------|------|
| 交互组件 | 40 | Dock、Carousel、MagicBento、SpotlightCard、TiltedCard |
| 动画效果 | 31 | StarBorder、Magnet、Ribbons、MetaBalls、GlareHover |
| 背景特效 | 45 | Aurora、Particles、Iridescence、Waves、Hyperspeed |
| 文字动画 | 23 | GradientText、BlurText、CountUp、DecryptedText |

预览画布自动检测并加载 motion/gsap/ogl/three.js 等 CDN 依赖。

### 自定义设计资产
用户可在 `userData/ximo-agent/` 下管理三类自定义资产（`CustomDesignStore`）：
- `design-styles/<id>/` — 自定义设计风格（manifest.json + DESIGN.md + tokens.css）
- `ui-components/<cat>/<id>/` — 自定义 UI 组件（*.jsx + *.css）+ 目录清单
- `experts.json` — 自定义 AI 专家

内置数据只读，用户数据可增删改，两者合并后提供给工具读取。

---

## 个性化定制

### 可视化主题编辑器
- 自定义主题变量（浅色/深色模式独立），如 `--theme-color`、`--bg-base` 等
- 自定义 CSS 注入（追加到全局样式末尾，最高优先级）
- 变量实时生效，无需重启

### 主题包（ThemePack）
- 用户可通过 JSON 文件导入完整主题包（`themes/` 目录）
- 每个包定义浅色/深色 CSS 变量覆盖
- 支持启用/停用/删除，与内置主题一键切换

### 背景图
支持静态图片与动态视频/GIF 背景：
- 导入后复制到 `userData/ximo-agent/backgrounds/`（不依赖原文件路径）
- 可调不透明度、模糊半径、缩放模式（cover/contain/center/tile）
- 动态背景支持 mp4/webm/gif/mov/avi/mkv

### 开屏动画
- 可配置文字内容、字号、字体、描边时长
- **爆发转场**：rose(玫瑰花瓣) / fireworks(烟花) / confetti(彩纸) / fade(淡入) / aura(光环) / lightfall(光瀑) / custom(自定义 JSON 动画)
- 粒子数量、转场时长、配色主题（rose/ocean/gold/aurora）均可调

### 鼠标特效
- **跟随特效**：trail、sparkle、firefly、glow、aurora、comet、rainbow、snowflake、leaf、butterfly、sakura、bubble、droplet、ember、clover、diamond、star4、cross、halo、energy、ringdots、note、moon
- **点击特效**：ripple、ring、shockwave、orbit、wormhole、burst、pixel、flower、firework、confetti、snow、gem、spark、cube、laser、golden、heart、star、crown、lightning、splash、water
- 颜色、尺寸、强度、粒子数、生存时长均可调

### 视觉模型
Agnes 2.5 Flash 视觉模型（Agent 的"眼睛"）：
- 独立配置 API Key / Base URL / 模型名
- 支持截图分析、设计稿对比、UI 审查、图片内容理解

---

## MCP 协议支持

支持挂载外部 MCP 服务器扩展工具能力：
- **传输方式**：stdio（本地进程）、SSE（Server-Sent Events）、HTTP
- **配置格式兼容**：Cursor / Claude Code / Cline / Windsurf 等主流客户端
- **配置持久化**：存储于 `%APPDATA%/ximo-agent/mcp-config.json`
- **按需加载**：MCP 工具动态注册到 toolRegistry

---

## GPU 硬件加速

Windows 上强制启用 GPU 硬件加速（可在设置中关闭）：
- `ignore-gpu-blocklist`：忽略 GPU 黑名单
- `enable-gpu-rasterization`：GPU 光栅化
- `enable-zero-copy`：零拷贝内存
- `disable-software-rasterizer`：禁用软件回退
- `use-angle=d3d11`：Direct3D 11 后端
- `force_high_performance_gpu`：优先使用独显

---

## Checkpoint 系统

会话级文件编辑检查点（`CheckpointStore.ts`）：

- **轮次机制**：每次用户发消息开启新 turn，同轮内多次文件编辑共享一个快照
- **自动快照**：写工具（file_edit / file_write / multi_edit / move_file）修改前自动对目标文件建快照
- **回滚**：可回滚到指定轮次的所有文件状态，支持浏览历史快照（`SnapshotBrowser`）
- **存储**：快照存于系统临时目录，不污染用户项目；`checkpointEnabled` 可整体开关
- **文件删除保护**：file_delete 删除前同样建快照，误删可恢复

---

## 权限与安全

### 权限引擎（Permission.ts）
基于规则的 allow/ask/deny 决策引擎，支持按工具名 + 参数动态匹配：
- **YOLO 模式**：所有操作自动允许（免确认）
- **Safe 模式**：只读操作自动允许，写操作需确认
- **Off 模式**：所有操作逐条确认
- 请求确认时通过弹窗（`ConfirmDialog`）实时询问用户，窗口关闭自动拒绝

### 安全基线
- `contextIsolation: true` + `nodeIntegration: false` + `sandbox: false`（webview 需要）
- 外部链接仅允许 http/https 协议，交由系统浏览器打开
- 渲染进程崩溃自动 reload 恢复
- 全局 `uncaughtException` / `unhandledRejection` 捕获，防止静默崩溃
- 背景图/主题包等用户文件校验路径安全（只允许操作 userData 内文件）
- 粘贴图片、录制技能等敏感操作均有权限边界

---

## 窗口与外观

- **透明圆角窗口**：无边框 + 透明 + CSS 圆角（20px），最大化时自动移除圆角
- **背景图层圆角对齐**：背景图与窗口圆角完美贴合，不溢出
- **内阴影立体感**：圆角边缘内阴影，视觉更立体
- **拖拽增强**：标题栏抓手光标、防误选文本
- **开屏动画**：粒子汇聚 + 文字描边 + 爆发转场

---

## 更新机制

双源更新检测（GitHub + Gitee）：
- 启动时并行查询两源的最新 release
- 下载失败自动切换源
- 支持下载进度回调
- 下载完成后调用系统安装

---

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Electron 33 · electron-vite |
| 主进程 | TypeScript (Node.js) |
| 渲染层 | React 18 · Zustand · Tailwind CSS 3 |
| AI | 自实现 DeepSeek 客户端 + 本地 BPE tokenizer · 多服务商支持 |
| 检索 | @orama/orama（知识库 BM25 全文检索） |
| 浏览器自动化 | Playwright |
| 录屏回放 | rrweb · rrweb-player |
| Git | simple-git |
| 图表 | mermaid · react-markdown · react-syntax-highlighter |
| 图标 | lucide-react |
| 构建 | Vite 5 · electron-builder (NSIS) |
| 测试 | Vitest 4 · @vitest/coverage-v8 |

---

## 目录结构

```
ximo-agent/
├── build/                         # 构建资源（图标等）
├── docs/                          # 设计文档
│   ├── CONVERSATION_TYPES_AND_FLOW.md
│   ├── officecli-e2e-notes.md
│   └── custom-animations/
├── examples/                      # 使用示例（上下文窗口计算等）
├── prebuilt/win-x64/              # 预构建二进制（windows-bridge.exe / pi-helper）
├── scripts/                       # 辅助脚本
│   ├── fix-particles.js           # 粒子库修复
│   ├── gen-component-catalog.cjs  # UI 组件目录生成
│   ├── gen-previews.mjs           # 预览图生成
│   ├── make-icon.mjs              # 图标生成
│   ├── parse-agents.cjs           # 专家数据解析
│   ├── precompile-components.mjs  # 组件预编译
│   ├── screenshot-components.mjs  # 组件截图
│   ├── setup-pi-helper.mjs        # pi-helper 安装
│   ├── translate-agents.cjs       # 专家数据翻译
│   ├── audit-verify.cjs           # 资产审计校验
│   └── verify-refs.cjs            # 引用校验
├── src/
│   ├── main/                      主进程
│   │   ├── deepseek/             DeepSeek API 客户端 + Agent 循环
│   │   │   ├── agent-loop.ts     Agent 工具调用循环
│   │   │   ├── api.ts            流式 API 调用
│   │   │   ├── context.ts        配置与工具函数
│   │   │   ├── planning-phase.ts 规划阶段
│   │   │   ├── provider.ts       多服务商解析层
│   │   │   ├── supervisor.ts     监督审查 Agent
│   │   │   ├── tool-execution.ts 工具执行（权限/并行/超时）
│   │   │   ├── tokenizer.ts      BPE 分词器
│   │   │   └── types.ts          类型定义
│   │   ├── tools/                工具系统
│   │   │   ├── Browser/          浏览器自动化
│   │   │   ├── CodeQuality/      代码质量（含 OCR 代码审查）
│   │   │   ├── ComputerUse/      电脑操控
│   │   │   ├── Design/           设计系统（130+ 品牌 + 4 模板 + 139 组件 + 主题）
│   │   │   ├── FileSystem/       文件系统
│   │   │   ├── Git/              Git
│   │   │   ├── Mcp/              MCP 客户端
│   │   │   ├── Network/          网络抓包
│   │   │   ├── Office/           Office 文档（OfficeCLI）
│   │   │   ├── Skill/            技能系统 + AI 专家（AgentExpertTool / sub-agent / expert-config）
│   │   │   ├── Terminal/         终端
│   │   │   ├── Vision/           视觉模型
│   │   │   ├── WebIntelligence/  联网搜索
│   │   │   ├── Tool.ts           工具抽象基类
│   │   │   ├── ToolRegistry.ts   工具注册表
│   │   │   ├── lazy-registry.ts  懒加载注册表（模式→模块组）
│   │   │   ├── CodeExecuteTool.ts
│   │   │   ├── DynamicTool.ts    运行时动态工具
│   │   │   ├── KnowledgeTool.ts  知识库工具
│   │   │   ├── MemoryTool.ts     模式记忆工具
│   │   │   ├── PlanSpecTool.ts   Plan/Spec 工作流
│   │   │   ├── UIGenerateTool.ts UI 生成
│   │   │   └── WebSearchTool.ts  联网搜索
│   │   ├── ipc/                  IPC 处理器（chat/computer-use/data/fs/misc/network/skill/system/update/window）
│   │   ├── cache/                缓存模块
│   │   │   └── prefix-shape.ts   PrefixShape 哈希诊断
│   │   ├── BackgroundStore.ts    背景图管理
│   │   ├── CheckpointStore.ts    检查点系统
│   │   ├── CustomDesignStore.ts  自定义设计资产（风格/组件/专家）
│   │   ├── KnowledgeStore.ts     知识库（Orama）
│   │   ├── McpStore.ts           MCP 配置持久化
│   │   ├── Permission.ts         权限系统
│   │   ├── SkillStore.ts         技能持久化 + 录制管理
│   │   ├── ThemePackStore.ts     主题包管理
│   │   ├── store.ts              数据持久化（设置/会话/记忆）
│   │   ├── chat-bridge.ts        聊天 IPC 桥接
│   │   ├── gpu-config.ts         GPU 加速配置
│   │   ├── paths.ts              统一路径管理
│   │   ├── window-manager.ts     窗口管理（透明圆角）
│   │   └── index.ts              主进程入口（IPC 注册）
│   ├── preload/
│   │   └── index.ts              contextBridge 安全 API
│   ├── renderer/                 渲染进程
│   │   ├── public/ui-previews/   100+ UI 动效预览（HTML + GIF）
│   │   └── src/
│   │       ├── agents/           AI 专家库（254 位，懒加载）
│   │       ├── components/       UI 组件
│   │       │   ├── chat-input/   输入框组件（专家/风格/技能/模型选择器）
│   │       │   ├── coding/       编程模式组件
│   │       │   ├── design/       设计模式组件（自由画布/组件预览）
│   │       │   ├── layouts/      布局组件（三模式）
│   │       │   ├── message/      消息渲染（ExpertWorkCard 等）
│   │       │   ├── office/       办公模式组件（内嵌浏览器/MCP/技能面板）
│   │       │   ├── settings/     设置面板（6 个 Tab + 主题编辑器）
│   │       │   ├── shared/       共享组件
│   │       │   ├── sidebar/      侧边栏组件
│   │       │   ├── transcript/   对话流组件
│   │       │   └── ...           全局组件
│   │       ├── hooks/            自定义 Hooks（useAppEffects 等）
│   │       ├── lib/              工具库
│   │       ├── modes/            模式定义 + 提示词
│   │       ├── store/            Zustand 状态管理（含 buildApiMessages 专家提示词注入 / runStream 流式处理）
│   │       │   └── slices/       状态切片（agent/browser/conversation/design/project/skills/stream）
│   │       ├── App.tsx           渲染入口
│   │       └── main.tsx          React 入口
│   └── shared/                   主进程与渲染进程共享
│       ├── types/                类型定义（core/settings/messaging/tools/skills/experts/network/ui/mcp/transition）
│       ├── cache/                缓存模块（context-manager/normalize-usage/tool-normalize）
│       ├── utils/                工具函数
│       ├── agents-raw.json       254 位 AI 专家原始数据（156KB）
│       ├── defaults.ts           默认设置
│       ├── glm-paradigm.ts       工程范式提示词
│       └── context-compress.ts   三级压缩算法
├── tests/                        测试（main/renderer/shared 三层）
│   ├── main/                     agent-loop/api-body/checkpoint-store/deepseek/permission/prefix-shape/provider/store/tool-registry
│   ├── renderer/                 buildApiMessages-pair/skillCommands
│   └── shared/                   context-compress/context-manager/defaults/normalize-usage/tool-normalize
├── electron.vite.config.ts       构建配置（含静态资源复制插件）
├── tailwind.config.js            Tailwind 配置
├── postcss.config.js             PostCSS 配置
├── tsconfig.json                 类型配置
├── AGENTS.md                     工程行为规范
└── package.json
```

---

## 开发命令

```bash
npm run dev                # 启动开发模式（electron-vite dev）
npm run build              # 构建产物到 out/
npm run start              # 预览构建产物
npm run build:win          # 打包 Windows NSIS 安装包
npm run typecheck          # 类型检查（node + web）
npm run typecheck:node     # 主进程类型检查
npm run typecheck:web      # 渲染进程类型检查
npm run test               # 运行测试
npm run test:watch         # 测试监听模式
npm run test:coverage      # 测试覆盖率报告
npm run make-icon          # 重新生成图标
npm run gen-previews       # 重新生成 UI 组件预览
```

---

## 扩展点

### 新增工具
1. 在 `src/main/tools/<域>/` 下新建 `XxxTool.ts`，实现 `Tool` 接口
2. 在该域的 `index.ts` 中导出
3. 在 `lazy-registry.ts` 的 `moduleFactories` 中添加模块组工厂函数
4. 在对应模式的 `modeModules` 和 `modeToolNames` 中添加工具名

### 新增模式
1. 在 `src/shared/types/core.ts` 的 `Mode` 联合类型中追加
2. 在 `src/main/store.ts` 的 memory 逻辑中加入新模式
3. 在 `src/renderer/src/modes/prompts.ts` 中定义模式系统提示词
4. 在 `src/renderer/src/modes/index.ts` 添加模式配置
5. 在 `src/renderer/src/components/layouts/` 下添加布局组件
6. 在 `lazy-registry.ts` 的 `modeModules` 中配置工具组合

### 新增设计系统
在 `src/main/tools/Design/design-systems/` 下新建目录，包含：
- `DESIGN.md` — 设计指南
- `manifest.json` — 元数据
- `tokens.css` — CSS 变量

### 新增自定义服务商
1. 设置面板 → 模型 → 服务商 → 添加
2. 配置 baseUrl / apiKey / 模型列表 / 上下文窗口 / 能力开关
3. `resolveActiveProvider` 自动解析，无需改代码

### 接入 MCP 服务器
通过设置面板的 MCP 配置区添加 `McpServerConfig`，由 `McpClient.ts` 桥接为工具暴露给 LLM。

---

## 配置与约定

- 行为规范：见 [AGENTS.md](AGENTS.md)（编码前必读）
- 数据存储：`%APPDATA%/ximo-agent/`（Windows）
  - `settings.json` — 应用设置
  - `conversations.json` — 会话数据（500ms 防抖写入）
  - `memory/` — 各模式记忆文件
  - `knowledge/` — 各模式知识库（Orama 索引 + entries.json）
  - `backgrounds/` — 用户导入的背景图/视频
  - `themes/` — 主题包
  - `design-styles/`、`ui-components/` — 自定义设计资产
  - `skills.json` — 录制的技能
  - `imported-skills.json` — 导入的技能
  - `mcp-config.json` — MCP 服务器配置
  - `experts.json` — 自定义 AI 专家
  - `pasted-images/` — 粘贴的截图
- 路径别名：渲染层 `@renderer` → `src/renderer/src`，主进程 `@main` → `src/main`，共享 `@shared` → `src/shared`
- 构建：`electron.vite.config.ts` 中 `copyStaticAssets` 负责复制非 JS 资源（Design 资产 + tokenizer 词表）
- 安全：`contextIsolation: true` + `nodeIntegration: false` + 外部链接白名单
- 系统保险：`uncaughtException` / `unhandledRejection` 全局捕获，渲染进程崩溃自动 reload

---

## 致谢

本项目在开发过程中参考或使用了以下开源项目：

- [react-bits](https://github.com/DavidHDev/react-bits) — UI 动效组件库
- [open-design](https://github.com/nicedoc/open-design) — 开放设计系统
- [pi-computer-use](https://github.com/nicedoc/pi-computer-use) — 电脑操控桥接
- [Reasonix](https://github.com/nicedoc/Reasonix) — Agent 编程能力与工具合约
- [agency-agents](https://github.com/msitarzewski/agency-agents) — AI 专家库
- [@orama/orama](https://github.com/oramasearch/orama) — 全文检索引擎
- [阿里 OCR](https://github.com/alibaba/open-code-review) — AI 代码审查
