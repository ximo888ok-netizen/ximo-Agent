/**
 * DeepSeek-V4 上下文窗口计算 —— 独立 TypeScript 示例
 *
 * 零外部依赖，可在 Node.js (>= 11) 或浏览器中直接运行。
 * 运行方式:
 *   npx tsx examples/context-window.ts
 *   # 或编译后: tsc examples/context-window.ts && node examples/context-window.js
 *
 * 核心概念:
 *   上下文窗口 (context window) 是模型单次请求能处理的最大 token 数。
 *   本示例模拟一个 AI Agent 如何根据上下文窗口大小，对多轮对话进行
 *   分级上下文管理（提醒 → 裁剪 → 压缩 → 强制压缩）。
 */


// ============================================================================
// 1. 类型定义
// ============================================================================

/** 定价信息（每 1M tokens 的价格） */
interface Pricing {
  cacheHit: number;
  input: number;
  output: number;
  currency: string;
}

/** 模型级能力覆盖 */
interface ModelOverride {
  reasoningProtocol?: string;
  supportedEfforts?: string[];
  defaultEffort?: string;
  vision?: boolean;
  /** 覆盖 provider 级别的上下文预算；0 或未设置表示继承 */
  contextWindow?: number;
}

/** Provider 配置项 */
interface ProviderEntry {
  name: string;
  kind: string;
  baseURL: string;
  model: string;
  models: string[];
  defaultModel: string;
  apiKeyEnv: string;
  contextWindow: number;
  price?: Pricing;
  prices?: Record<string, Pricing>;
  modelOverrides?: Record<string, ModelOverride>;
}

/** 上下文压缩比例配置 */
interface CompactionConfig {
  contextWindow: number;
  softCompactRatio: number;       // 仅提醒，不动缓存前缀
  toolResultSnipRatio: number;    // 裁剪过期工具结果
  compactRatio: number;           // 触发摘要压缩
  compactForceRatio: number;      // 强制压缩高水位
}

/** 默认压缩参数 */
const DEFAULT_COMPACTION: Omit<CompactionConfig, "contextWindow"> = {
  softCompactRatio: 0.5,
  toolResultSnipRatio: 0.6,
  compactRatio: 0.8,
  compactForceRatio: 0.9,
};

/** 其它常量 */
const FALLBACK_TOK_PER_CHAR = 0.25;   // 回退比率: ~4 chars/token
const DEFAULT_TAIL_TOKENS = 16384;   // 压缩后保留的近期消息 token 预算
const DEFAULT_COMPACT_TARGET = 0.5;  // 尾部不超过窗口的 50%
const MIN_FOLD_TOKENS = 400;          // 区域低于此 token 数不值得折叠


// ============================================================================
// 2. UTF-8 字节长度计算（零依赖，替代 Node.js Buffer）
// ============================================================================

/**
 * 返回字符串的 UTF-8 编码字节数。
 * 使用 TextEncoder（Node.js >= 11 和所有现代浏览器均内置），
 * 无需依赖 Node.js 的 Buffer。
 */
const _encoder = new TextEncoder();

function utf8ByteLength(s: string): number {
  return _encoder.encode(s).length;
}


// ============================================================================
// 3. DeepSeek-V4 默认配置与定价
// ============================================================================

function deepSeekV4FlashPrice(): Pricing {
  return { cacheHit: 0.02, input: 1, output: 2, currency: "¥" };
}

function deepSeekV4ProPrice(): Pricing {
  return { cacheHit: 0.025, input: 3, output: 6, currency: "¥" };
}

/** 默认 Provider 列表 */
function defaultDeepSeekProviders(): ProviderEntry[] {
  return [
    {
      name: "deepseek-flash",
      kind: "openai",
      baseURL: "https://api.deepseek.com",
      model: "deepseek-flash",
      models: ["deepseek-flash"],
      defaultModel: "deepseek-flash",
      apiKeyEnv: "DEEPSEEK_API_KEY",
      contextWindow: 1_000_000,
      price: deepSeekV4FlashPrice(),
    },
    {
      name: "deepseek-pro",
      kind: "openai",
      baseURL: "https://api.deepseek.com",
      model: "deepseek-v4-pro",
      models: ["deepseek-v4-pro"],
      defaultModel: "deepseek-v4-pro",
      apiKeyEnv: "DEEPSEEK_API_KEY",
      contextWindow: 1_000_000,
      price: deepSeekV4ProPrice(),
    },
  ];
}


// ============================================================================
// 4. 模型解析与覆盖
// ============================================================================

/**
 * 解析模型引用，返回带覆盖已应用的 Provider 副本。
 * 支持三种引用形式:
 *   "provider/model" — 指定 provider 下的特定模型
 *   "provider-name"  — provider 名称，使用其默认模型
 *   "model-name"     — 裸模型名，匹配第一个列出它的 provider
 */
function resolveModel(
  providers: ProviderEntry[],
  ref: string,
): { entry: ProviderEntry; found: true } | { found: false } {
  // "provider/model" 形式
  const slashIdx = ref.indexOf("/");
  if (slashIdx > 0) {
    const provName = ref.slice(0, slashIdx);
    const modelName = ref.slice(slashIdx + 1);
    const entry = providers.find((p) => p.name === provName && p.models.includes(modelName));
    if (entry) return { entry: applyOverride({ ...entry, model: modelName }), found: true };
  }

  // provider 名称 → 默认模型
  const byName = providers.find((p) => p.name === ref);
  if (byName) {
    return { entry: applyOverride({ ...byName, model: byName.defaultModel }), found: true };
  }

  // 裸模型名 → 第一个列出它的 provider
  const byModel = providers.find((p) => p.models.includes(ref));
  if (byModel) return { entry: applyOverride({ ...byModel, model: ref }), found: true };

  return { found: false };
}

/**
 * 应用模型级覆盖。仅当 contextWindow > 0 时才覆盖上下文窗口。
 */
function applyOverride(entry: ProviderEntry): ProviderEntry {
  if (!entry.modelOverrides) return entry;
  const ov =
    entry.modelOverrides[entry.model] ??
    Object.entries(entry.modelOverrides).find(
      ([k]) => k.trim().toLowerCase() === entry.model.trim().toLowerCase(),
    )?.[1];
  if (!ov) return entry;

  if (ov.contextWindow && ov.contextWindow > 0) {
    entry.contextWindow = ov.contextWindow;
  }
  return entry;
}


// ============================================================================
// 5. Token 估算（无本地 tokenizer 的启发式方法）
// ============================================================================

/** 简化的消息类型 */
interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  reasoningContent?: string;
  name?: string;
  toolCallID?: string;
  toolCalls?: { id: string; name: string; arguments: string }[];
}

/**
 * 估算字符串的 token 数量。
 * 启发式策略:
 *   - 英文文本约 4 bytes/token → ceil(bytes / 4)
 *   - CJK 文本约 1 rune/token → 字符数
 *   - 取两者中较大值，保证不低估
 */
function estimateTextTokens(s: string): number {
  if (!s) return 0;
  const bytes = utf8ByteLength(s);
  const runes = [...s].length; // 正确处理多字节字符（码点数）
  const byBytes = Math.ceil(bytes / 4);
  return runes > byBytes ? runes : byBytes;
}

/**
 * 估算消息列表的 token 总数。
 * 包含每条消息 4 token 的框架开销，以及工具调用的额外开销。
 */
function estimateMessagesTokens(msgs: Message[]): number {
  let total = 0;
  for (const m of msgs) {
    total += 4; // chat-message framing overhead
    total += estimateTextTokens(m.content);
    total += estimateTextTokens(m.reasoningContent ?? "");
    total += estimateTextTokens(m.name ?? "");
    total += estimateTextTokens(m.toolCallID ?? "");
    for (const tc of m.toolCalls ?? []) {
      total += 8;
      total += estimateTextTokens(tc.id);
      total += estimateTextTokens(tc.name);
      total += estimateTextTokens(tc.arguments);
    }
  }
  return total;
}


// ============================================================================
// 6. 上下文窗口阈值计算与压缩决策
// ============================================================================

/** Provider 返回的用量信息 */
interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** 压缩动作类型（使用可辨识联合） */
type CompactionAction =
  | { kind: "noop"; reason: string }
  | { kind: "soft-notice"; detail: string }
  | { kind: "snip-tool-results"; detail: string }
  | { kind: "compact"; force: boolean; detail: string };

/** Agent 运行时的压缩状态 */
interface CompactionState {
  softCompactNoticed: boolean;   // 软提醒是否已发过（仅发一次）
  compactStuck: boolean;         // 压缩卡顿锁（连续压缩失败时锁定）
  consecutiveCompacts: number;   // 连续压缩次数
}

/**
 * 根据上下文窗口和当前 prompt token 数，决定压缩动作。
 *
 * 决策流程（5 个阶段，按 token 用量递增）:
 *
 *   用量 < 50% 窗口  → noop（健康，无需操作）
 *   50% ≤ 用量 < 60% → soft-notice（仅提醒一次，保持缓存前缀不动）
 *   60% ≤ 用量 < 80% → snip-tool-results（裁剪过期工具结果，免摘要调用）
 *   80% ≤ 用量 < 90% → compact, force=false（触发摘要压缩）
 *   用量 ≥ 90% 窗口  → compact, force=true（强制压缩，绕过经济性检查）
 */
function decideCompaction(
  config: CompactionConfig,
  usage: Usage | null,
  state: CompactionState,
): CompactionAction {
  // 无窗口或无用量 → 不操作
  if (config.contextWindow <= 0 || !usage || usage.promptTokens === 0) {
    return { kind: "noop", reason: "compaction disabled or no usage" };
  }

  const { contextWindow: W } = config;
  const high = Math.floor(W * config.compactRatio);        // 触发压缩阈值 (80%)
  const snip = Math.floor(W * config.toolResultSnipRatio);  // 裁剪阈值 (60%)
  const soft = Math.floor(W * config.softCompactRatio);     // 软提醒阈值 (50%)
  const pt = usage.promptTokens;

  // 阶段 1: soft ~ snip 之间 → 仅提醒一次
  if (pt >= soft && pt < snip && !state.softCompactNoticed) {
    const pct = (config.softCompactRatio * 100).toFixed(0);
    const triggerPct = (config.compactRatio * 100).toFixed(0);
    return {
      kind: "soft-notice",
      detail: `context reached ${pct}% of window; keeping cache-first prefix until compact threshold ${triggerPct}%`,
    };
  }

  // 阶段 2: snip ~ high 之间 → 裁剪过期工具结果
  if (pt >= snip && pt < high) {
    return {
      kind: "snip-tool-results",
      detail: `prompt at ${pt} tokens (between snip ${snip} and compact ${high}); snipping stale tool results`,
    };
  }

  // 阶段 3: 未到触发阈值 → 正常呼吸空间
  if (pt < high) {
    return { kind: "noop", reason: "prompt under compact trigger; healthy" };
  }

  // 阶段 4: 已卡顿 → 暂停自动压缩
  if (state.compactStuck) {
    return { kind: "noop", reason: "compactStuck latch set; auto-compaction paused" };
  }

  // 阶段 5: 触发压缩，判断是否为强制
  const force = pt >= Math.floor(W * config.compactForceRatio);
  return {
    kind: "compact",
    force,
    detail: force
      ? `prompt at ${pt} tokens >= force ratio ${config.compactForceRatio * 100}% of window ${W}; force compacting`
      : `prompt at ${pt} tokens >= compact ratio ${config.compactRatio * 100}% of window ${W}; compacting`,
  };
}


// ============================================================================
// 7. 尾部预算与折叠经济性
// ============================================================================

/**
 * 计算压缩后保留的尾部 token 预算。
 * 取固定值 (16384) 与窗口的 50% 中的较小值，
 * 确保大窗口不会保留过多尾部，小窗口也不会超出触发线。
 */
function tailTokenBudget(contextWindow: number): number {
  const maxByWin = Math.floor(contextWindow * DEFAULT_COMPACT_TARGET);
  return maxByWin < DEFAULT_TAIL_TOKENS ? maxByWin : DEFAULT_TAIL_TOKENS;
}

/**
 * 判断一个消息区域是否值得折叠（token 足够多）。
 * 太小的区域不值得发起一次摘要 API 调用。
 */
function foldEconomics(regionTokens: number): boolean {
  return regionTokens >= MIN_FOLD_TOKENS;
}


// ============================================================================
// 8. tokPerChar 动态校准
// ============================================================================

/**
 * 从上一轮的真实 usage 反推 tokens/char 比率。
 * 在拿到 provider 返回的实际 prompt_tokens 之前，用回退值 0.25 (~4 chars/token)。
 * 拿到后用 实际token数 / 字符数 计算，但忽略不合理比率 (≤0.05 或 ≥2)。
 */
function tokPerChar(lastUsage: Usage | null, totalChars: number): number {
  if (lastUsage && lastUsage.promptTokens > 0 && totalChars > 0) {
    const r = lastUsage.promptTokens / totalChars;
    if (r > 0.05 && r < 2) return r;
  }
  return FALLBACK_TOK_PER_CHAR;
}


// ============================================================================
// 9. 演示主函数
// ============================================================================

function main() {
  console.log("=".repeat(70));
  console.log("DeepSeek-V4 上下文窗口计算 —— 独立 TypeScript 示例");
  console.log("=".repeat(70));

  // --- Step 1: 加载默认配置 ---
  const providers = defaultDeepSeekProviders();
  console.log("\n[1] 默认 Provider 配置:");
  for (const p of providers) {
    console.log(
      `  ${p.name}: model=${p.model}, contextWindow=${p.contextWindow.toLocaleString()}, ` +
        `price=${p.price?.input}${p.price?.currency}/1M input`,
    );
  }

  // --- Step 2: 模型解析 ---
  console.log("\n[2] 模型解析 (resolveModel):");
  const resolved = resolveModel(providers, "deepseek-pro");
  if (resolved.found) {
    const e = resolved.entry;
    console.log(
      `  "deepseek-pro" → model=${e.model}, contextWindow=${e.contextWindow.toLocaleString()}`,
    );
  }

  // --- Step 3: 模型级覆盖 ---
  console.log("\n[3] 模型级覆盖 (model_overrides):");
  const providersWithOverride: ProviderEntry[] = [
    {
      ...providers[0],
      modelOverrides: {
        "deepseek-flash": { contextWindow: 500_000 }, // 缩小窗口
      },
    },
  ];
  const overridden = resolveModel(providersWithOverride, "deepseek-flash");
  if (overridden.found) {
    console.log(
      `  覆盖前: ${providers[0].contextWindow.toLocaleString()} → 覆盖后: ${overridden.entry.contextWindow.toLocaleString()}`,
    );
  }

  // --- Step 4: 阈值计算 ---
  const config: CompactionConfig = {
    contextWindow: 1_000_000,
    ...DEFAULT_COMPACTION,
  };
  console.log("\n[4] 上下文窗口阈值 (contextWindow=1,000,000):");
  console.log(`  soft   (50%): ${Math.floor(config.contextWindow * 0.5).toLocaleString()} tokens — 仅提醒`);
  console.log(`  snip   (60%): ${Math.floor(config.contextWindow * 0.6).toLocaleString()} tokens — 裁剪工具结果`);
  console.log(`  compact(80%): ${Math.floor(config.contextWindow * 0.8).toLocaleString()} tokens — 触发摘要压缩`);
  console.log(`  force  (90%): ${Math.floor(config.contextWindow * 0.9).toLocaleString()} tokens — 强制压缩`);

  // --- Step 5: 模拟多轮对话的压缩决策 ---
  console.log("\n[5] 模拟多轮对话压缩决策:");
  const state: CompactionState = {
    softCompactNoticed: false,
    compactStuck: false,
    consecutiveCompacts: 0,
  };
  const scenarios: { label: string; usage: Usage }[] = [
    { label: "对话初期", usage: { promptTokens: 120_000, completionTokens: 0, totalTokens: 120_000 } },
    { label: "接近 soft", usage: { promptTokens: 510_000, completionTokens: 0, totalTokens: 510_000 } },
    { label: "进入 snip 区", usage: { promptTokens: 650_000, completionTokens: 0, totalTokens: 650_000 } },
    { label: "触发 compact", usage: { promptTokens: 820_000, completionTokens: 0, totalTokens: 820_000 } },
    { label: "触发 force", usage: { promptTokens: 950_000, completionTokens: 0, totalTokens: 950_000 } },
  ];

  for (const s of scenarios) {
    const action = decideCompaction(config, s.usage, state);
    if (action.kind === "soft-notice") state.softCompactNoticed = true;
    const detail = "detail" in action ? action.detail : action.reason;
    console.log(`  [${s.label}] prompt=${s.usage.promptTokens.toLocaleString()} → ${action.kind}`);
    console.log(`    ${detail}`);
  }

  // --- Step 6: Token 估算 ---
  console.log("\n[6] Token 估算 (启发式，无本地 tokenizer):");
  const samples = [
    "Hello, world!",
    "你好，世界！这是一段中文文本用来测试 token 估算。",
    "a".repeat(1000),
  ];
  for (const s of samples) {
    const est = estimateTextTokens(s);
    console.log(
      `  "${s.slice(0, 30)}${s.length > 30 ? "..." : ""}" (${s.length} chars, ${utf8ByteLength(s)} bytes) ≈ ${est} tokens`,
    );
  }

  // --- Step 7: tokPerChar 动态校准 ---
  console.log("\n[7] tokPerChar 动态校准:");
  const charCount = 200_000;
  const usages: Usage[] = [
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    { promptTokens: 50_000, completionTokens: 0, totalTokens: 50_000 },
    { promptTokens: 180_000, completionTokens: 0, totalTokens: 180_000 },
  ];
  for (const u of usages) {
    const ratio = tokPerChar(u, charCount);
    console.log(
      `  usage.promptTokens=${u.promptTokens.toLocaleString()}, chars=${charCount} → tokPerChar=${ratio.toFixed(4)}`,
    );
  }

  // --- Step 8: 尾部预算 ---
  console.log("\n[8] 压缩后尾部 token 预算:");
  for (const w of [128_000, 262_144, 1_000_000]) {
    const budget = tailTokenBudget(w);
    console.log(`  window=${w.toLocaleString()} → tail budget=${budget.toLocaleString()} tokens`);
  }

  // --- Step 9: 消息列表 token 估算 ---
  console.log("\n[9] 消息列表 token 估算:");
  const sampleMessages: Message[] = [
    { role: "system", content: "You are a helpful coding assistant." },
    { role: "user", content: "请帮我写一个快速排序的实现。" },
    {
      role: "assistant",
      content: "好的，这是快速排序的 TypeScript 实现：",
      toolCalls: [
        {
          id: "call_001",
          name: "write_file",
          arguments: JSON.stringify({ path: "quicksort.ts", content: "function qs(a:number[]):number[]{...}" }),
        },
      ],
    },
    { role: "tool", content: "File written successfully.", name: "write_file", toolCallID: "call_001" },
  ];
  const msgTokens = estimateMessagesTokens(sampleMessages);
  console.log(`  ${sampleMessages.length} 条消息 → 估算 ${msgTokens} tokens`);

  console.log("\n" + "=".repeat(70));
  console.log("示例完成");
  console.log("=".repeat(70));
}

main();
