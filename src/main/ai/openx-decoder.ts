/**
 * OpenX 内核加速解码器
 *
 * 解析 AI 输出中的 OX{} 压缩标记，还原为完整代码。
 *
 * 语法规则：
 * - OX{ID}参数          引用模板 ID，参数到下一个 OX{ 或文本结束
 * - OX{ID}              无参数引用（参数为空）
 * - OX{def:ID}内容OX    静默定义新模板（不输出），后续可引用
 * - 多参数用 | 分隔      OX{ID}arg1|arg2|arg3，模板中用 {0} {1} {2} 引用
 * - \| 转义              参数中包含字面量 | 时用 \| 转义
 *
 * 流式安全：
 * - OX{ 标记可能跨 chunk，decoder 维护缓冲区，只有完整标记才展开
 * - OX{def:...} 块可能跨 chunk，检测到未闭合的 def 块时缓冲等待
 * - buffer 末尾的 O、OX 字符也会缓冲，避免截断终止符
 */

import { OPENX_PRESET_TEMPLATES } from '@shared/constants'

/** 匹配 OX{...} 标记的正则（全局，用于非流式解码） */
const OX_PATTERN = /OX\{([^}]+)\}([^]*?)(?=OX\{|$)/g

/** 匹配可能未完成的 OX{ 标记开头（位于字符串末尾） */
const OX_PREFIX = /OX\{[^}]*$/

/** 匹配 OX{def:ID}...OX 模板定义（终止符 OX 后不跟字母数字，避免误匹配 Oxford 等） */
const DEF_PATTERN = /OX\{def:([^}]+)\}([^]*?)OX(?![A-Za-z0-9_])/g

/** 检测 buffer 末尾是否有未闭合的 def 块（OX{def:...} 后无终止符 OX） */
const UNCLOSED_DEF = /OX\{def:[^}]*\}[^]*$/

/** 检测 buffer 末尾可能是 OX 终止符的开头（单独的 O 或 OX 字符） */
const TRAILING_OX = /O$|OX$/

/**
 * 将模板内容中的 {0} {1} ... 占位符替换为实际参数。
 * 支持 {n} 形式，n 超出参数范围时替换为空字符串。
 */
function expandTemplate(template: string, args: string[]): string {
  return template.replace(/\{(\d+)\}/g, (_, idx) => {
    const i = Number(idx)
    return i < args.length ? args[i] : ''
  })
}

/**
 * 按分隔符 | 切分参数，支持 \| 转义（字面量 | 不作为分隔符）。
 * 转义后的 \| 还原为 |，\\ 还原为 \。
 */
function splitArgs(raw: string): string[] {
  if (!raw) return []
  const result: string[] = []
  let current = ''
  let i = 0
  while (i < raw.length) {
    const ch = raw[i]
    if (ch === '\\' && i + 1 < raw.length) {
      // 转义下一个字符（\| → |，\\ → \）
      current += raw[i + 1]
      i += 2
    } else if (ch === '|') {
      result.push(current)
      current = ''
      i++
    } else {
      current += ch
      i++
    }
  }
  result.push(current)
  return result
}

/**
 * 非流式一次性解码完整文本。
 * 用于非流式场景、工具调用 arguments 解码、测试。
 *
 * 流程：
 * 1. 提取并移除 OX{def:ID}...OX 模板定义（静默，不输出）
 * 2. 展开 OX{ID}参数 引用
 * 3. 未知 ID 原样输出（容错）
 */
export function decodeOpenXSync(text: string): string {
  // 模板字典：预设 + 本次定义
  const templates = new Map<string, string>(Object.entries(OPENX_PRESET_TEMPLATES))
  let output = text

  // 1. 提取并移除模板定义（静默，不输出到结果）
  output = output.replace(DEF_PATTERN, (_, id: string, content: string) => {
    templates.set(id, content)
    return '' // 静默定义，不输出
  })

  // 2. 展开 OX{ID}参数 引用
  output = output.replace(OX_PATTERN, (_, id: string, rawArgs: string) => {
    const template = templates.get(id)
    if (template === undefined) {
      // 未知模板，原样输出（容错）
      return `OX{${id}}${rawArgs}`
    }
    const args = splitArgs(rawArgs)
    return expandTemplate(template, args)
  })

  return output
}

/**
 * 流式 OpenX 解码器。
 * 处理跨 chunk 的 OX{} 标记，确保不完整标记不会被部分输出。
 *
 * 设计：
 * - 维护 buffer 累积流式 chunk
 * - 先提取完整的 def 块（注册到字典，从 buffer 移除）
 * - 检测 buffer 末尾的未完成标记（OX{... 未闭合、def 块未终止、OX 终止符未完成）
 * - 只处理安全部分，未完成部分保留在 buffer 等待下一个 chunk
 */
export class OpenXDecoder {
  private buffer = ''
  private readonly templates: Map<string, string>
  /** 压缩指标：AI 输出的压缩字符数（push 输入累计） */
  private rawChars = 0
  /** 压缩指标：解码还原后的字符数（push/flush 输出累计） */
  private decodedChars = 0

  constructor() {
    this.templates = new Map(Object.entries(OPENX_PRESET_TEMPLATES))
  }

  /**
   * 输入流式 chunk，返回可安全输出的已解码文本。
   * 返回空字符串表示正在缓冲未完成的标记。
   */
  push(chunk: string): string {
    this.rawChars += chunk.length
    this.buffer += chunk

    // 1. 先提取完整的 def 块（从 buffer 中移除并注册到字典）
    this.buffer = this.buffer.replace(DEF_PATTERN, (_, id: string, content: string) => {
      this.templates.set(id, content)
      return '' // 静默定义，不输出
    })

    // 2. 检测 buffer 末尾的未完成状态
    let safeEnd = this.buffer.length

    // 2a. 检测未闭合的 OX{ 标记（如 "OX{abc" 或 "OX{def:id}内容" 无终止符）
    const unmatchedOx = this.buffer.search(OX_PREFIX)
    if (unmatchedOx !== -1) {
      // 有未完成的 OX{ 标记，只处理到该位置
      safeEnd = Math.min(safeEnd, unmatchedOx)
    }

    // 2b. 检测未闭合的 def 块（OX{def:...} 后无终止符 OX）
    const unclosedDefMatch = this.buffer.match(UNCLOSED_DEF)
    if (unclosedDefMatch && unclosedDefMatch.index !== undefined) {
      // 有未闭合的 def 块，只处理到 def 块开始之前
      safeEnd = Math.min(safeEnd, unclosedDefMatch.index)
    }

    // 2c. 检测末尾可能是 OX 终止符的开头（单独的 O 或 OX）
    // 避免 def 块的终止符 OX 被截断
    if (safeEnd === this.buffer.length) {
      const trailingMatch = this.buffer.match(TRAILING_OX)
      if (trailingMatch && trailingMatch.index !== undefined) {
        // 末尾是 O 或 OX，可能是终止符的一部分，缓冲等待
        safeEnd = trailingMatch.index
      }
    }

    // 3. 分割安全部分和待缓冲部分
    const toProcess = this.buffer.slice(0, safeEnd)
    const toKeep = this.buffer.slice(safeEnd)

    // 4. 展开 OX{ID}参数 标记
    const decoded = toProcess.replace(OX_PATTERN, (_, id: string, rawArgs: string) => {
      const template = this.templates.get(id)
      if (template === undefined) {
        // 未知模板，原样输出（容错）
        return `OX{${id}}${rawArgs}`
      }
      const args = splitArgs(rawArgs)
      return expandTemplate(template, args)
    })

    this.buffer = toKeep
    this.decodedChars += decoded.length
    return decoded
  }

  /**
   * 流结束时调用，输出缓冲区剩余内容。
   * 残留的不完整标记按原样输出（容错，避免内容丢失）。
   */
  flush(): string {
    const remaining = this.buffer
    this.buffer = ''
    if (!remaining) return ''

    // 尝试解码残留的完整标记，不完整的原样输出
    let result = remaining.replace(DEF_PATTERN, (_, id: string, content: string) => {
      // flush 阶段也注册 def（容错：def 块正好在流结束时闭合）
      this.templates.set(id, content)
      return ''
    })

    result = result.replace(OX_PATTERN, (_, id: string, rawArgs: string) => {
      const template = this.templates.get(id)
      if (template === undefined) return `OX{${id}}${rawArgs}`
      const args = splitArgs(rawArgs)
      return expandTemplate(template, args)
    })

    this.decodedChars += result.length
    return result
  }

  /** 重置解码器状态（清空 buffer 与指标，保留预设模板） */
  reset(): void {
    this.buffer = ''
    this.rawChars = 0
    this.decodedChars = 0
    this.templates.clear()
    for (const [k, v] of Object.entries(OPENX_PRESET_TEMPLATES)) {
      this.templates.set(k, v)
    }
  }

  /**
   * 压缩指标：本次解码的压缩统计。
   * - rawChars: AI 输出的压缩字符数（OX{} 标记形式）
   * - decodedChars: 还原后的字符数（用户看到的完整内容）
   * - savedChars: 节省的字符数 = decoded - raw（>0 表示压缩生效）
   * - ratio: 压缩比 = saved / decoded（0~1，越高越好）
   */
  getMetrics(): { rawChars: number; decodedChars: number; savedChars: number; ratio: number } {
    const savedChars = Math.max(0, this.decodedChars - this.rawChars)
    const ratio = this.decodedChars > 0 ? savedChars / this.decodedChars : 0
    return { rawChars: this.rawChars, decodedChars: this.decodedChars, savedChars, ratio }
  }
}
