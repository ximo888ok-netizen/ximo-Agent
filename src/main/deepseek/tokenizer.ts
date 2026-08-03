/**
 * DeepSeek V4 Tokenizer — 纯 TypeScript BPE 分词器
 *
 * 等价于 Python 版的 transformers.AutoTokenizer，
 * 读取 HuggingFace 格式的 tokenizer.json，
 * 实现 byte-level 编码 + BPE 合并 + 预分词正则。
 *
 * 无外部依赖，首次调用时懒加载 tokenizer.json（约 5MB，解析后缓存在内存中）。
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// ====== 类型 ======

interface TokenizerData {
  /** token → id 映射表 */
  vocab: Map<string, number>
  /** "tokenA tokenB" → 合并优先级（越小越先合并） */
  mergeRanks: Map<string, number>
}

// ====== 懒加载单例 ======

let tokenizerData: TokenizerData | null = null
let byteEncoder: Map<number, string> | null = null
/** BPE 结果缓存：同一 pre-token 无需重复计算 */
const bpeCache = new Map<string, string[]>()

// ====== Byte-to-Unicode 映射（GPT-2 ByteLevel 编码） ======

/**
 * 将 0-255 的字节值映射为可打印 Unicode 字符。
 * 可打印 ASCII（33-126）和部分 Latin-1（161-172, 174-255）映射到自身，
 * 其余字节（控制字符等）映射到 U+0100 起始的字符，确保所有字节都能用可打印字符表示。
 */
function initByteEncoder(): Map<number, string> {
  const printable: number[] = []
  for (let i = 33; i <= 126; i++) printable.push(i)
  for (let i = 161; i <= 172; i++) printable.push(i)
  for (let i = 174; i <= 255; i++) printable.push(i)

  const allBytes: number[] = [...printable]
  const mappedChars: number[] = [...printable]
  let n = 0
  for (let b = 0; b < 256; b++) {
    if (!printable.includes(b)) {
      allBytes.push(b)
      mappedChars.push(256 + n)
      n++
    }
  }

  const map = new Map<number, string>()
  for (let i = 0; i < allBytes.length; i++) {
    map.set(allBytes[i], String.fromCharCode(mappedChars[i]))
  }
  return map
}

// ====== 预分词正则 ======

/**
 * 从 tokenizer.json 的 pre_tokenizer 配置中提取的组合正则。
 * 三个 Split 模式互补（数字、CJK、通用文本），合并为 alternation 等价。
 * 最后一步 ByteLevel(use_regex=false) 仅做字节编码，不额外分割。
 */
const PRETOKENIZER_REGEX = new RegExp(
  [
    '\\p{N}{1,3}',                                                          // 1-3 位数字
    '[一-龥぀-ゟ゠-ヿ]+',                                                      // 中日韩字符
    '[!"#$%&\'()*+,\\-./:;<=>?@\\[\\\\\\]^_`{|}~][A-Za-z]+',               // 标点+字母
    '[^\\r\\n\\p{L}\\p{P}\\p{S}]?[\\p{L}\\p{M}]+',                           // 可选前缀+字母/标记
    ' ?[\\p{P}\\p{S}]+[\\r\\n]*',                                            // 可选空格+标点/符号
    '\\s*[\\r\\n]+',                                                         // 空白+换行
    '\\s+(?!\\S)',                                                           // 行尾空白
    '\\s+'                                                                   // 任意空白
  ].join('|'),
  'gu'
)

// ====== 加载 tokenizer.json ======

function resolveTokenizerPath(): string {
  const candidates = [
    join(__dirname, 'tokenizer', 'tokenizer.json'),
    join(process.cwd(), 'src', 'main', 'deepseek', 'tokenizer', 'tokenizer.json')
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  throw new Error('[Tokenizer] tokenizer.json 未找到')
}

function loadTokenizer(): TokenizerData {
  if (tokenizerData) return tokenizerData

  const filePath = resolveTokenizerPath()
  const raw = readFileSync(filePath, 'utf-8')
  const data = JSON.parse(raw) as {
    model: { vocab: Record<string, number>; merges: string[] }
  }

  const vocab = new Map<string, number>()
  for (const [token, id] of Object.entries(data.model.vocab)) {
    vocab.set(token, id)
  }

  const mergeRanks = new Map<string, number>()
  for (let i = 0; i < data.model.merges.length; i++) {
    mergeRanks.set(data.model.merges[i], i)
  }

  tokenizerData = { vocab, mergeRanks }
  byteEncoder = initByteEncoder()

  return tokenizerData
}

// ====== BPE 合并算法 ======

/**
 * 对单个 byte-level 编码后的 pre-token 执行 BPE 合并。
 * 反复找到优先级最高（rank 最小）的相邻 token 对进行合并，直到无法继续。
 */
function bpe(token: string, mergeRanks: Map<string, number>): string[] {
  const cached = bpeCache.get(token)
  if (cached) return cached

  let word: string[] = Array.from(token)
  if (word.length < 2) {
    bpeCache.set(token, word)
    return word
  }

  while (true) {
    let bestPair: string | null = null
    let bestRank = Infinity

    for (let i = 0; i < word.length - 1; i++) {
      const pair = word[i] + ' ' + word[i + 1]
      const rank = mergeRanks.get(pair)
      if (rank !== undefined && rank < bestRank) {
        bestRank = rank
        bestPair = pair
      }
    }

    if (bestPair === null) break

    // 分割 pair：第一个空格为分隔符（byte-level 编码后 token 内不含空格）
    const sepIdx = bestPair.indexOf(' ')
    const first = bestPair.substring(0, sepIdx)
    const second = bestPair.substring(sepIdx + 1)
    const merged = first + second

    const newWord: string[] = []
    let i = 0
    while (i < word.length) {
      if (i < word.length - 1 && word[i] === first && word[i + 1] === second) {
        newWord.push(merged)
        i += 2
      } else {
        newWord.push(word[i])
        i++
      }
    }
    word = newWord

    if (word.length < 2) break
  }

  bpeCache.set(token, word)
  return word
}

// ====== 公开 API ======

/**
 * 计算文本的 token 数量（与 DeepSeek V4 分词器一致）。
 * 首次调用时懒加载 tokenizer.json（约 100-300ms），后续调用走缓存。
 */
export function countTokens(text: string): number {
  if (!text) return 0

  const { mergeRanks } = loadTokenizer()
  if (!byteEncoder) byteEncoder = initByteEncoder()

  const preTokens = text.match(PRETOKENIZER_REGEX) ?? []

  let count = 0
  for (const preToken of preTokens) {
    // byte-level 编码：UTF-8 字节 → 可打印 Unicode 字符
    const bytes = new TextEncoder().encode(preToken)
    const byteEncoded = Array.from(bytes, (b) => byteEncoder!.get(b)!).join('')

    // BPE 合并
    const tokens = bpe(byteEncoded, mergeRanks)
    count += tokens.length
  }

  return count
}

/**
 * 计算多条消息的总 token 数（包含 role 标签开销）。
 */
export function countMessageTokens(
  messages: { role: string; content: string }[]
): number {
  let total = 0
  for (const msg of messages) {
    total += countTokens(msg.content)
    total += countTokens(msg.role)
  }
  return total
}

/** tokenizer 是否已加载完毕 */
export function isTokenizerReady(): boolean {
  return tokenizerData !== null
}
