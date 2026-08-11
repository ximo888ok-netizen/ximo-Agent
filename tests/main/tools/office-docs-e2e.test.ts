/**
 * OfficeDocsTool 真实冒烟测试（集成层，非 mock）
 *
 * 依赖：resources/officecli/officecli.exe 已部署（33,472,424 B, v1.0.143）
 * 运行：npx vitest run tests/main/tools/office-docs-e2e.test.ts
 *
 * 覆盖全链路：create → add → set → get → view → save → validate
 * 全部真实 spawn 二进制，验证工具层参数构造 + Runner 进程封装 + 二进制真实行为。
 *
 * 说明：
 * - 本测试在 officecli 二进制缺失时自动 skip（不破坏 CI 无二进制环境）
 * - 使用独立临时目录，不污染项目 resources/officecli
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { OfficeDocsTool } from "../../../src/main/tools/Office/OfficeDocsTool";
import { locateOfficeCli } from "../../../src/main/tools/Office/OfficeCliManager";
import { getOfficeCliVersion } from "../../../src/main/tools/Office/OfficeCliRunner";

// vitest 无 electron app 上下文，显式注入 OFFICECLI_PATH（candidatePaths 第一优先级），
// 使 locateOfficeCli 能命中 resources/officecli/officecli.exe
const binDir = join(process.cwd(), "resources", "officecli");
process.env.OFFICECLI_PATH = binDir;
const bin = locateOfficeCli();
const hasBinary = bin !== null && existsSync(bin);

const tmpDir = mkdtempSync(join(tmpdir(), "ximo-office-e2e-"));
const pptx = join(tmpDir, "smoke.pptx");
const pngOut = join(tmpDir, "smoke-preview.png");

const tool = new OfficeDocsTool();

const call = (args: Record<string, unknown>) =>
  tool.execute({ id: "e2e", name: "office_docs", arguments: args });

let version: string | null = null;

beforeAll(async () => {
  version = await getOfficeCliVersion();
  console.log(`[office-e2e] binary=${bin} version=${version}`);
});

afterAll(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

describe.skipIf(!hasBinary)(
  "OfficeDocsTool 真实链路 (officecli v1.0.143)",
  () => {
    it("二进制可用", () => {
      expect(hasBinary).toBe(true);
      expect(version).toBeTruthy();
    });

    it("create 创建 pptx", async () => {
      const res = await call({ action: "create", filePath: pptx });
      expect(res.success).toBe(true);
      expect(existsSync(pptx)).toBe(true);
    });

    it("add slide 挂根目录", async () => {
      const res = await call({
        action: "add",
        filePath: pptx,
        path: "/",
        type: "slide",
      });
      expect(res.success).toBe(true);
      expect(res.content).toContain("/slide[1]");
    });

    it("add shape 带文本", async () => {
      const res = await call({
        action: "add",
        filePath: pptx,
        path: "/slide[1]",
        type: "shape",
        properties: { text: "冒烟测试标题" },
      });
      expect(res.success).toBe(true);
    });

    it("set 属性（--prop 前缀）", async () => {
      const res = await call({
        action: "set",
        filePath: pptx,
        path: "/slide[1]/shape[1]",
        properties: { text: "修改后的标题", bold: "true" },
      });
      expect(res.success).toBe(true);
    });

    it("get 读取结构", async () => {
      const res = await call({
        action: "get",
        filePath: pptx,
        path: "/",
        depth: 2,
      });
      expect(res.success).toBe(true);
      expect(res.metadata?.isJsonOutput).toBe(true);
    });

    it("view screenshot 无 Office 预览", async () => {
      const res = await call({
        action: "view",
        filePath: pptx,
        mode: "screenshot",
        outputPath: pngOut,
      });
      expect(res.success).toBe(true);
      expect(existsSync(pngOut)).toBe(true);
      expect(statSync(pngOut).size).toBeGreaterThan(1000);
    });

    it("save 持久化", async () => {
      const res = await call({ action: "save", filePath: pptx });
      expect(res.success).toBe(true);
    });

    it("validate 校验 OpenXML 合法性", async () => {
      const res = await call({ action: "validate", filePath: pptx });
      expect(res.success).toBe(true);
    });

    it("type 属性不再透传为 --prop type=（add 分支回归）", async () => {
      // 通过 properties 传 type 应被过滤，不产生 UNSUPPORTED props: type 错误
      const res = await call({
        action: "add",
        filePath: pptx,
        path: "/slide[1]",
        type: "shape",
        properties: { type: "shape", text: "带type的shape" },
      });
      expect(res.success).toBe(true);
    });

    it("properties.type 提升为 --type 参数（add 分支）", async () => {
      // 只通过 properties 传 type: 'slide'，应自动提升为 --type slide（不被过滤后丢失）
      const res = await call({
        action: "add",
        filePath: pptx,
        path: "/",
        properties: { type: "slide", text: "仅properties.type的slide" },
      });
      expect(res.success).toBe(true);
      expect(res.content).toContain("/slide[");
    });

    it("batch 批量操作真实可用（action/properties → command/props 转换）", async () => {
      // 工具层 operations 用 { action, properties }，必须转换为 officecli 期望的 { command, props }
      const res = await call({
        action: "batch",
        filePath: pptx,
        operations: [
          { action: "add", parent: "/slide[1]", type: "shape", properties: { text: "批量添加" } },
          { action: "set", path: "/slide[1]/shape[1]", properties: { bold: "true" } },
        ],
      });
      expect(res.success).toBe(true);
    });

    it("batch 原生 command 键格式也可用（错误回归：'a' is an invalid start）", async () => {
      // 直接传 officecli 原生格式（command/props）也应可用
      const res = await call({
        action: "batch",
        filePath: pptx,
        operations: [
          { command: "set", path: "/slide[1]/shape[1]", props: { text: "原生格式" } },
        ],
      });
      expect(res.success).toBe(true);
    });
  },
);
