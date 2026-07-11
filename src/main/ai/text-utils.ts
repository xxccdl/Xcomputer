/**
 * 共享文本处理工具：分词、停用词、短文本等价判断、本地实体提取。
 * 从 store/memory.ts 抽取，供 memory-vectorizer / memory-graph / memory 复用，避免循环依赖。
 */

/** 中文停用词表（高频无意义词） */
export const STOP_WORDS = new Set([
  '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
  '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
  '这', '那', '它', '他', '她', '们', '把', '被', '让', '使', '给', '对', '为',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'to', 'of', 'in',
  'on', 'at', 'for', 'with', 'and', 'or', 'not', 'no', 'yes', 'do', 'does', 'did'
])

/**
 * 中文分词：简单的字符级 + 词典匹配分词
 * 对中文按 2-3 字符滑窗切分，对英文按空格和标点切分，过滤停用词
 */
export function tokenize(text: string): string[] {
  if (!text) return []
  const lower = text.toLowerCase()
  const tokens: string[] = []

  // 英文/数字 token（长度 >= 2）
  const englishMatches = lower.match(/[a-z][a-z0-9_]{1,}/g) ?? []
  for (const t of englishMatches) {
    if (!STOP_WORDS.has(t) && t.length >= 2) tokens.push(t)
  }

  // 中文 2-gram 和 3-gram 滑窗
  const chineseChars = lower.match(/[\u4e00-\u9fa5]+/g) ?? []
  for (const seg of chineseChars) {
    // 2-gram
    for (let i = 0; i < seg.length - 1; i++) {
      const gram = seg.substring(i, i + 2)
      if (!STOP_WORDS.has(gram)) tokens.push(gram)
    }
    // 3-gram（捕捉更完整的词组）
    for (let i = 0; i < seg.length - 2; i++) {
      const gram = seg.substring(i, i + 3)
      if (!STOP_WORDS.has(gram)) tokens.push(gram)
    }
  }

  return tokens
}

/**
 * 规范化短文本，用于短句包含判断
 * 去除常见停用字、标点和空格，降低"用户的名字是"与"用户名字是"的差异
 */
export function normalizeShortText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s的是了在和有都一]/g, '')
    .replace(/[^\u4e00-\u9fa5a-z0-9]/g, '')
}

/**
 * 判断两段短文本是否语义等价（忽略"的/是/了"等虚词差异）
 */
export function isShortTextEquivalent(a: string, b: string): boolean {
  if (a.length > 30 || b.length > 30) return false
  const na = normalizeShortText(a)
  const nb = normalizeShortText(b)
  if (na.length < 3 || nb.length < 3) return false
  return na.includes(nb) || nb.includes(na)
}

/** 实体提取的单字中文停用词（2-gram/3-gram 已由 STOP_WORDS 覆盖，此处补单字） */
const ENTITY_STOP_CHARS = new Set([
  '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '上',
  '也', '很', '到', '说', '要', '去', '你', '会', '着', '看', '好', '这', '那',
  '它', '他', '她', '们', '把', '被', '让', '使', '给', '对', '为', '个', '中',
  '大', '小', '多', '少', '来', '去', '里', '外', '下', '后', '前'
])

/**
 * 本地实体提取（正则回退，无需 API）
 * 提取策略：
 * 1. 英文专有名词/技术词：[a-zA-Z][a-zA-Z0-9_]{2,}（如 React、TypeScript、python）—— 统一小写
 * 2. 中文术语：2-4 字连续中文序列（过滤纯停用字组合）
 * 3. Windows 路径：[A-Za-z]:\\... 或 Unix 路径 /path/...
 * 4. 版本号：\d+\.\d+(\.\d+)?
 * 5. 引用字符串："..." 或 「...」
 * 返回规范化（小写、去首尾空格）后的去重实体列表
 */
export function extractEntitiesLocal(text: string): string[] {
  if (!text) return []
  const entities = new Set<string>()

  // 1. 英文技术词（长度 >= 3，过滤停用词）
  const englishMatches = text.match(/[a-zA-Z][a-zA-Z0-9_+#.]{2,}/g) ?? []
  for (const e of englishMatches) {
    const lower = e.toLowerCase()
    if (!STOP_WORDS.has(lower) && lower.length >= 3) {
      entities.add(lower)
    }
  }

  // 2. 中文术语：2-4 字连续中文序列
  const chineseSegs = text.match(/[\u4e00-\u9fa5]+/g) ?? []
  for (const seg of chineseSegs) {
    if (seg.length >= 2 && seg.length <= 4) {
      // 过滤纯单字停用词组合
      const hasContent = [...seg].some((ch) => !ENTITY_STOP_CHARS.has(ch))
      if (hasContent) entities.add(seg)
    } else if (seg.length > 4) {
      // 长中文段：提取 2-gram 和 3-gram 作为实体候选（去停用）
      for (let i = 0; i < seg.length - 1; i++) {
        const gram2 = seg.substring(i, i + 2)
        if (![...gram2].every((ch) => ENTITY_STOP_CHARS.has(ch))) {
          entities.add(gram2)
        }
      }
    }
  }

  // 3. 文件路径（保留原始大小写，作为标识符）
  const pathMatches = text.match(/[A-Za-z]:\\[^\s'"，。；：、]+|\/[a-zA-Z][^\s'"，。；：、]+/g) ?? []
  for (const p of pathMatches) {
    entities.add(p.toLowerCase())
  }

  // 4. 版本号
  const versionMatches = text.match(/\d+\.\d+(\.\d+)?/g) ?? []
  for (const v of versionMatches) {
    entities.add(v)
  }

  // 5. 引用字符串（「...」或"..."，长度 2-30）
  const quotedMatches = text.match(/[「"][^」"]{2,30}[」"]/g) ?? []
  for (const q of quotedMatches) {
    const inner = q.slice(1, -1).trim().toLowerCase()
    if (inner.length >= 2) entities.add(inner)
  }

  return [...entities]
}
