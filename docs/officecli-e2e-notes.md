# OfficeCLI 端到端实测记录（2026-08-04，v1.0.143）

## 二进制部署
- 路径：`resources/officecli/officecli.exe`（33,472,424 字节）
- 下载源：GitHub API 资产通道（`api.github.com` 可达，`github.com` 直连不通）
  - 资产 ID 从 `releases/latest` 解析：`officecli-win-x64.exe` → 492731378
  - `curl.exe -L -C -` 断点续传（HTTP 206），完成时返回 416
- SHA256：`07d919675f45b9ff1880644dea2f7d29be4c57a0aa53cc19260a67ece81cb5f2`

## 实测验证的命令链（全部成功）

### 创建演示文稿
```bash
officecli create demo.pptx
# Created: demo.pptx (kept open in background for faster subsequent commands)
# totalSlides: 0, slideWidth: 960pt, slideHeight: 540pt
```

### 新增幻灯片（注意：挂根目录 `/`，不是 /slides）
```bash
officecli add demo.pptx / --type slide
# Added slide at /slide[1]
```

### 新增文本框（注意：type 属性不受支持，默认 textbox）
```bash
officecli add demo.pptx /slide[1] --type shape --prop text=标题
# Added shape at /slide[1]/shape[@id=100000]
# err: UNSUPPORTED props: type (did you mean: style?)
```

### 设置属性（注意：必须 --prop 前缀！）
```bash
officecli set demo.pptx /slide[1]/shape[1] --prop text=xxx
# 裸 key=value 会报：missing_prop_flag + suggestion: --prop text=xxx
```

### 读取（--json 结构化输出）
```bash
officecli get demo.pptx / --json --depth 2
# 返回 presentation → slides → shapes 完整树，含 text/format/theme
```

### 截图预览（不需要 Office！）
```bash
officecli view demo.pptx screenshot -o demo-preview.png --json
# 成功生成 PNG，视觉验证文字渲染正常
```

### 保存（resident 模式需显式 flush）
```bash
officecli save demo.pptx
# Saved demo.pptx
```

### 帮助系统（属性名纠错入口）
```bash
officecli help add    # Usage / Options / --prop 说明
officecli help set
officecli help <ext> <element>   # 格式级属性名
```

## 关键语法结论（已固化进 OfficeDocsTool.ts description）
1. 属性设置必须 `--prop key=value` 前缀
2. slide 挂根目录 `/`
3. `--shape-type` 不存在；`type` 属性不受支持（默认 textbox）
4. resident 模式需 `save` 持久化
5. 错误带 `code` + `suggestion`，天然支持 Agent 自愈循环
6. `view screenshot` 支持无 Office 预览（P2 的基础已验证）

## 网络经验（本机）
- `api.github.com` 可达；`github.com` 直连超时；release 资产 302 到 CDN 可用
- 大文件下载用 curl `-C -` 断点续传最稳（python urllib 读流在 CDN 上不稳）
- npm registry 可达（`@officecli/officecli@1.0.143` 是安装器，二进制仍需 GitHub）

## 集成链路（2026-08-04 验证）
```
chat:start (chat-handler.ts)
  → ensureModeToolsLoaded(mode)  (lazy-registry.ts)
    → moduleFactories['office']  (lazy-registry.ts L127-131)
      → import('./Office') → new OfficeDocsTool()
      → toolRegistry.register(office_docs)
  → modeToolNames.office 含 'office_docs'（lazy-registry.ts L156-178）
  → toolRegistry.getByNames(toolNames) → normalizeToolSchemas → 注入 LLM 工具 schema
执行时：
  Agent 调 office_docs → tool-execution.ts: toolRegistry.get('office_docs')
  → OfficeDocsTool.execute() → dispatch() → runCli() → spawn officecli.exe
```
二进制定位（OfficeCliManager.candidatePaths 四级）：
1. 环境变量 `OFFICECLI_PATH`（测试/部署可显式指定）
2. 开发模式 `app.getAppPath()/resources/officecli/officecli.exe`
3. 打包模式 `process.resourcesPath/officecli/officecli.exe`
4. PATH 中的 `officecli`

## 打包配置（package.json build.extraResources）
- `from: resources/officecli → to: officecli`（filter 仅 officecli.exe/officecli）
- 打包后二进制落在 `resources/officecli/officecli.exe`，与 Runner 第 3 级定位匹配
- ⚠️ `.gitignore` 忽略 `*.exe` — 二进制不入库，部署机需先运行下载脚本

## 真实链路测试（tests/main/tools/office-docs-e2e.test.ts）
- 非 mock：真实 spawn `officecli.exe`，覆盖 create→add→set→get→view→save→validate
- 二进制缺失时自动 skip（CI 无二进制环境不破坏）
- vitest 无 electron app 上下文 → 测试内显式 `process.env.OFFICECLI_PATH = resources/officecli`
- 运行：`npx vitest run tests/main/tools/office-docs-e2e.test.ts`
- 2026-08-04 实测：10/10 通过（全量 344/344）

## 2026-08-04 集成修复
- `SUPPORTED_ACTIONS` 增加 `view`、`save`（此前未暴露，实测核心能力）
- `propsToArgs` 过滤保留字 `type`（实测 `--prop type=` 报 UNSUPPORTED）
- `view` 分支：`view <file> <mode> [-o output] --json`（screenshot 无需 Office）
- `save` 分支：`save <file>`（resident 持久化）
- `mode` 参数加入 tool definition（view 用，默认 screenshot）
