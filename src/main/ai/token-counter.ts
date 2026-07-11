/**
 * DeepSeek 官方 tokenizer 精确 token 计数模块。
 *
 * 使用 DeepSeek V3 官方离线 tokenizer（HuggingFace LlamaTokenizerFast + BPE），
 * 通过 @huggingface/tokenizers（纯 JS/WASM，零原生依赖）在 Node.js 中加载 tokenizer.json。
 *
 * tokenizer.json（7.8MB）位于 resources/deepseek-tokenizer/（开发环境）
 * 或 process.resourcesPath/deepseek-tokenizer/（打包后）。
 *
 * 设计要点：
 *  - 懒加载：首次调用 countTokens 时才读取并解析 tokenizer 文件（7.8MB JSON 解析有开销）
 *  - 单例缓存：tokenizer 实例进程内复用，避免重复解析
 *  - 优雅降级：若 tokenizer 加载失败（文件缺失/解析错误），回退到 chars/3 估算
 *  - 批量计数：countTokensBatch 对多段文本一次性编码，减少调用开销
 */
import { app } from 'electron'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'
import { logger } from '../utils/logger'

/** 旧的粗略估算系数（回退用）：1 token ≈ 3 字符 */
const CHARS_PER_TOKEN_FALLBACK = 3

type TokenizerInstance = { encode: (text: string) => { ids: number[] } }
let tokenizerInstance: TokenizerInstance | null = null
let initPromise: Promise<TokenizerInstance | null> | null = null
let initFailed = false

/** 解析 tokenizer 文件所在目录（开发环境 vs 打包后） */
function getTokenizerDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'deepseek-tokenizer')
    : join(app.getAppPath(), 'resources', 'deepseek-tokenizer')
}

/** 懒加载 DeepSeek tokenizer；线程安全（多次调用共享同一 Promise） */
async function getTokenizer(): Promise<{ encode: (text: string) => { ids: number[] } } | null> {
  if (initFailed) return null
  if (tokenizerInstance) return tokenizerInstance
  if (!initPromise) {
    initPromise = (async (): Promise<{ encode: (text: string) => { ids: number[] } } | null> => {
      try {
        const dir = getTokenizerDir()
        const jsonPath = join(dir, 'tokenizer.json')
        const configPath = join(dir, 'tokenizer_config.json')
        if (!existsSync(jsonPath) || !existsSync(configPath)) {
          logger.warn(`[TokenCounter] tokenizer 文件缺失: ${jsonPath}，回退到 chars/${CHARS_PER_TOKEN_FALLBACK} 估算`)
          initFailed = true
          return null
        }
        // 动态 import 避免影响启动速度；@huggingface/tokenizers 是纯 ESM
        const { Tokenizer } = await import('@huggingface/tokenizers')
        const tokenizerJson = JSON.parse(readFileSync(jsonPath, 'utf8'))
        const tokenizerConfig = JSON.parse(readFileSync(configPath, 'utf8'))
        const inst = new Tokenizer(tokenizerJson, tokenizerConfig)
        tokenizerInstance = inst
        logger.info('[TokenCounter] DeepSeek tokenizer 加载成功')
        return inst
      } catch (err) {
        logger.error('[TokenCounter] tokenizer 加载失败，回退到粗略估算:', err instanceof Error ? err.message : String(err))
        initFailed = true
        return null
      }
    })()
  }
  return initPromise
}

/**
 * 精确计算文本的 token 数。
 * 若 tokenizer 不可用，回退到 Math.ceil(text.length / 3)。
 */
export async function countTokens(text: string): Promise<number> {
  if (!text) return 0
  const tok = await getTokenizer()
  if (!tok) {
    return Math.ceil(text.length / CHARS_PER_TOKEN_FALLBACK)
  }
  try {
    const encoded = tok.encode(text)
    return encoded.ids.length
  } catch (err) {
    logger.warn('[TokenCounter] encode 失败，回退到粗略估算:', err instanceof Error ? err.message : String(err))
    return Math.ceil(text.length / CHARS_PER_TOKEN_FALLBACK)
  }
}

/**
 * 批量计算多段文本的 token 数（各自独立计数）。
 * 用于一次统计多条消息/多段内容的 token 占用。
 */
export async function countTokensBatch(texts: string[]): Promise<number[]> {
  const tok = await getTokenizer()
  if (!tok) {
    return texts.map((t) => Math.ceil((t || '').length / CHARS_PER_TOKEN_FALLBACK))
  }
  const results: number[] = []
  for (const text of texts) {
    if (!text) {
      results.push(0)
      continue
    }
    try {
      const encoded = tok.encode(text)
      results.push(encoded.ids.length)
    } catch {
      results.push(Math.ceil(text.length / CHARS_PER_TOKEN_FALLBACK))
    }
  }
  return results
}
