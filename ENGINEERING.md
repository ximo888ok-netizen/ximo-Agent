# ximo-Agent 工程化规范

> 本文档面向接手维护的工程师，描述项目架构约定与代码规范。
> 违反此文档的 PR 应被拒绝，除非有明确的技术理由并在 PR 描述中说明。

---

## 一、项目架构总览

```
src/
├── main/              # Electron 主进程（Node.js 环境）
│   ├── deepseek/      #   AI API 调用 + Agent Loop
│   ├── ipc/           #   IPC 处理器（按域拆分）
│   ├── tools/         #   工具实现（按类别子目录 + index.ts barrel）
│   ├── store.ts       #   主进程设置持久化
│   └── index.ts       #   入口
├── preload/           # Electron preload（桥梁层）
│   ├── index.ts       #   contextBridge API 暴露
│   └── extended-api.ts #   扩展 API
├── renderer/          # 渲染进程（React + Vite）
│   └── src/
│       ├── components/  # UI 组件（按功能域分组）
│       ├── store/       # Zustand 状态管理（已按 slice 拆分）
│       ├── hooks/       # React Hooks
│       ├── lib/         # 渲染层工具函数
│       ├── modes/       # 模式配置（office/coding/design）
│       ├── agents/      # Agent 人设数据
│       └── styles/      # CSS（按功能域分组）
└── shared/            # 主进程与渲染进程共享代码
    ├── types/         #   类型定义（按域拆分 + index.ts barrel）
    ├── utils/         #   纯工具函数
    └── cache/         #   上下文管理/缓存
```

### 关键设计原则

1. **三进程分离**：main（Node.js）、preload（桥梁）、renderer（浏览器）。共享代码放 `shared/`。
2. **路径别名**：
   - 渲染进程：`@renderer/*` → `src/renderer/src/*`，`@shared/*` → `src/shared/*`
   - 主进程：`@main/*` → `src/main/*`，`@shared/*` → `src/shared/*`
   - **同目录导入用相对路径 `./xxx`，跨目录用别名**
3. **Barrel 模式**：每个功能域目录有 `index.ts` 统一导出，外部只 import barrel，不直接 import 内部文件。

---

## 二、文件组织规范

### 2.1 行数上限（不可协商）

| 文件类型 | 上限 | 超限操作 |
|----------|------|----------|
| UI 组件 `.tsx` | 400 行 | 提取子组件到同目录 |
| Store / Slice | 500 行 | 按领域拆 slice |
| 工具 / 服务 | 400 行 | 按职责拆模块 |
| 类型 `types.ts` | 600 行 | 按域拆 `types/` 目录 |
| 其他 `.ts` | 300 行 | 提取辅助函数 |

### 2.2 组件目录结构

`components/` 根目录**禁止散放**功能组件。每个功能域必须有独立子目录：

```
components/
  coding/              # 编程模式
    CodingRightPanel.tsx   # 主面板（编排层）
    CodingChangesPanel.tsx # 子面板
    CodingTasksPanel.tsx
    change-rows.ts         # 工具函数
    constants.ts           # 常量（如有）
  voice/               # 语音功能
    VoiceOrb.tsx
    VoiceOrbPanel.tsx
  settings/            # 设置面板
    SettingsModal.tsx
    tabs/
  ...
```

### 2.3 禁止的坏味道

- ❌ 一个文件中有 2+ 个 `export function` 组件 → 拆到独立文件
- ❌ 组件内嵌弹出面板 > 50 行 → 提取子组件
- ❌ 常量数组 > 30 行 → 提取到 `constants.ts`
- ❌ 跨 3 层以上的相对导入 `../../../` → 改用别名
- ❌ 同一文件混用别名 `@/` 和相对 `./` 导入同一层级模块

---

## 三、类型安全规范

### 3.1 类型定义

- **禁止重复定义**：同一 interface 只能在一个地方定义。跨文件共享的类型放 `shared/types/`。
- **本地类型**：仅本目录使用的类型可放本地 `types.ts`，但须确认共享类型中无等价定义。
- **barrel 导出**：`shared/types/index.ts` 是唯一的类型 barrel，外部只 `import type { X } from '@shared/types'`。

### 3.2 类型逃逸

- `as any` 是最后手段。优先定义正确 interface。
- 第三方 API 返回值不确定时用 `Record<string, unknown>` + 可选链。
- 渲染进程 Store 类型在 `store/types.ts` 定义，主进程不需要引用渲染进程类型。

---

## 四、IPC 通信规范

### 4.1 通道命名

- 格式：`domain:action`（如 `chat:start`、`settings:load`、`conversations:save`）
- 主进程在 `ipc/` 目录按域注册，每个域一个 `xxx-handlers.ts` 文件。
- preload 在 `index.ts` 中按域分组暴露 `window.api.domain.method()`。

### 4.2 类型安全

- IPC 请求/响应类型在 `shared/types/` 中定义。
- preload 暴露的 API 接口须有类型标注，不依赖 `any`。

---

## 五、状态管理规范

### 5.1 Slice 拆分

Store 已按业务域拆分为 7 个 slice，位于 `store/slices/`：
- `conversationSlice` — 会话 CRUD
- `projectSlice` — 项目路径管理
- `chatSlice` — 发送消息 / 流式
- `designSlice` — 设计模式画布
- `browserSlice` — 内嵌浏览器
- `skillsSlice` — 技能录制
- `agentSlice` — Agent 专家 / Todo

### 5.2 规则

- 新 slice 须导出 `interface XxxSlice` + `createXxxSlice` 工厂函数。
- 主入口 `useStore.ts` 通过展开合并。
- **Slice 之间禁止互相 import**。需要跨 slice 调用时通过 `get()` 访问。
- 流式处理逻辑在 `runStream.ts` / `stream-*.ts`，不混入 slice。

---

## 六、样式规范

### 6.1 CSS 组织

`styles/` 目录按功能域拆分：
- `base.css` — CSS 变量、全局重置
- `buttons.css` — 按钮样式
- `glass.css` — 玻璃态效果
- `transcript/` — 会话流相关样式
- `voice-orb.css` — 语音球样式

### 6.2 规则

- **禁止内联硬编码颜色** `style={{ color: '#xxx' }}`。用 CSS 变量 `var(--text-primary)`。
- **禁止在 `.tsx` 中写 `<style>` 标签**。样式放 CSS 文件。
- Tailwind 类名可用，但语义化类名（如 `ios-card`、`icon-btn`）须在 `buttons.css` 中定义。

---

## 七、工具实现规范（主进程）

### 7.1 工具接口

每个工具实现 `Tool` 接口（`src/main/tools/Tool.ts`）：
- `definition: ToolDefinition` — 元数据
- `execute()` — 执行逻辑

### 7.2 目录结构

```
tools/
  FileSystem/
    FileReadTool.ts
    FileWriteTool.ts
    index.ts           # barrel：导出所有工具实例
  Browser/
    BrowserNavigateTool.ts
    BrowserManager.ts   # 管理器（非工具）
    index.ts
```

- 每个工具一个文件，文件名 = 工具名。
- `index.ts` 导出工具实例数组，供 `lazy-registry.ts` 按需加载。
- 工具辅助函数放同目录 `xxx-helpers.ts`。

---

## 八、测试规范

- 测试文件与源文件同结构，放 `tests/` 目录。
- 命名：`xxx.test.ts`。
- Vitest 配置在 `vitest.config.ts`。
- PR 须通过 `npm run typecheck && npm test`。

---

## 九、构建与开发

```bash
npm run dev          # 开发模式（electron-vite dev）
npm run build        # 构建
npm run typecheck    # 类型检查（node + web）
npm test             # 运行测试
npm run build:win    # 构建 Windows 安装包
```

---

## 十、审计工具

项目提供审计脚本（`scripts/audit-*.cjs`），PR 前运行：

```bash
node scripts/audit-sizes.cjs       # 文件行数统计
node scripts/audit-structure.cjs   # 结构检查（多导出、barrel、重复类型）
node scripts/audit-quality.cjs     # 代码质量检查
node scripts/audit-flat.cjs        # 散落文件检查
```
