/**
 * 记忆向量语义层：API embedding 优先 + 本地 TF-IDF 回退。
 * - 向量持久化在独立 electron-store 文件（xmemory-embeddings），与主记忆 store 隔离
 * - API 失败时自动降级为 TF-IDF（本次运行不再重试 API）
 * - 支持 backfill 批量补齐未向量化的记忆
 */
import Store from 'electron-store'
import OpenAI from 'openai'
import { settingsStore } from '../store/settings'
import { tokenize } from './text-utils'
import { logger } from '../utils/logger'

/** 当前向量版本号（版本升级时全量重新向量化） */
export const EMBEDDING_VERSION = 1
/** TF-IDF hashing 维度（固定维度便于持久化与余弦计算） */
const TFIDF_DIMENSIONS = 512
/** 单次 API 批量 embedding 的最大条数 */
const API_BATCH_SIZE = 16

interface EmbeddingEntry {
  /** 向量数据 */
  vector: number[]
  /** 生成时的 EMBEDDING_VERSION */
  version: number
  /** 生成模型名（API 模型名 或 'tfidf'） */
  model: string
}

interface EmbeddingStoreSchema {
  /** memoryId → 向量条目 */
  embeddings: Record<string, EmbeddingEntry>
}

class MemoryVectorizer {
  private store: Store<EmbeddingStoreSchema> | null = null
  /** 当前模式：init 时根据配置确定。API 失败后降级为 tfidf */
  private mode: 'api' | 'tfidf' | 'none' = 'none'
  /** API 失败标记：本次运行不再尝试 API */
  private apiFailed = false

  init(): void {
    this.store = new Store<EmbeddingStoreSchema>({
      name: 'xmemory-embeddings',
      defaults: { embeddings: {} }
    })
    const s = settingsStore.get()
    const model = s.embedding?.model ?? ''
    if (model) {
      this.mode = 'api'
      this.apiFailed = false
    } else {
      this.mode = 'tfidf'
    }
    const count = Object.keys(this.store.get('embeddings')).length
    logger.info(`[Xmemory-Vector] 向量存储已初始化（mode=${this.mode}，已有 ${count} 条向量）`)
  }

  private getStore(): Store<EmbeddingStoreSchema> {
    if (!this.store) this.init()
    return this.store as Store<EmbeddingStoreSchema>
  }

  /** 当前模式（供外部状态查询） */
  get currentMode(): 'api' | 'tfidf' | 'none' {
    return this.mode
  }

  /**
   * 获取单条文本的 embedding（API 优先，失败回退 TF-IDF）
   * 注意：此方法不查缓存，每次都重新计算。调用方应先用 getVector 查缓存。
   */
  async embed(text: string): Promise<number[]> {
    // API 可用时优先走 API
    if (this.mode === 'api' && !this.apiFailed) {
      try {
        const [vec] = await this.apiEmbed([text])
        return vec
      } catch (err) {
        logger.warn(`[Xmemory-Vector] API embedding 失败，降级为 TF-IDF:`, err)
        this.apiFailed = true
        this.mode = 'tfidf'
      }
    }
    return this.tfidfVector(text)
  }

  /** 批量 embedding（API 批量接口优先，回退逐条 TF-IDF） */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []
    if (this.mode === 'api' && !this.apiFailed) {
      try {
        const results: number[][] = []
        // 按 API_BATCH_SIZE 分批调用
        for (let i = 0; i < texts.length; i += API_BATCH_SIZE) {
          const batch = texts.slice(i, i + API_BATCH_SIZE)
          const batchVecs = await this.apiEmbed(batch)
          results.push(...batchVecs)
        }
        return results
      } catch (err) {
        logger.warn(`[Xmemory-Vector] API 批量 embedding 失败，降级为 TF-IDF:`, err)
        this.apiFailed = true
        this.mode = 'tfidf'
      }
    }
    // TF-IDF 逐条计算
    return texts.map((t) => this.tfidfVector(t))
  }

  /** 存储某条记忆的向量 */
  setVector(memoryId: string, vector: number[], model: string): void {
    const store = this.getStore()
    const embeddings = store.get('embeddings')
    embeddings[memoryId] = { vector, version: EMBEDDING_VERSION, model }
    store.set('embeddings', embeddings)
  }

  /** 获取某条记忆的向量（不存在或版本过期返回 undefined） */
  getVector(memoryId: string): number[] | undefined {
    const embeddings = this.getStore().get('embeddings')
    const entry = embeddings[memoryId]
    if (!entry) return undefined
    // 版本过期视为缺失
    if (entry.version < EMBEDDING_VERSION) return undefined
    return entry.vector
  }

  /** 删除向量 */
  deleteVector(memoryId: string): void {
    const store = this.getStore()
    const embeddings = store.get('embeddings')
    if (embeddings[memoryId]) {
      delete embeddings[memoryId]
      store.set('embeddings', embeddings)
    }
  }

  /** 清空所有向量 */
  clearAll(): void {
    this.getStore().set('embeddings', {})
  }

  /** 判断某记忆是否需要（重新）向量化 */
  needsVector(embeddingVersion?: number): boolean {
    return !embeddingVersion || embeddingVersion < EMBEDDING_VERSION
  }

  /** 余弦相似度（两个等长向量） */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0
    let dot = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    if (normA === 0 || normB === 0) return 0
    return dot / (Math.sqrt(normA) * Math.sqrt(normB))
  }

  /**
   * TF-IDF hashing 向量（本地回退）
   * 使用 tokenize 分词，对每个 token 用 FNV-1a 哈希到 [0, TFIDF_DIMENSIONS)，
   * 累加权重（词频），最后 L2 归一化。
   */
  private tfidfVector(text: string): number[] {
    const vec = new Array<number>(TFIDF_DIMENSIONS).fill(0)
    const tokens = tokenize(text)
    if (tokens.length === 0) return vec

    for (const token of tokens) {
      const idx = this.fnv1aHash(token) % TFIDF_DIMENSIONS
      // 用符号 hash 减少碰撞干扰：奇偶决定正负
      const sign = (this.fnv1aHash(token + '_sign') & 1) === 0 ? 1 : -1
      vec[idx] += sign * 1.0
    }

    // L2 归一化
    let norm = 0
    for (const v of vec) norm += v * v
    norm = Math.sqrt(norm)
    if (norm > 0) {
      for (let i = 0; i < vec.length; i++) vec[i] /= norm
    }
    return vec
  }

  /** FNV-1a 32 位哈希 */
  private fnv1aHash(str: string): number {
    let hash = 0x811c9dc5
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193)
    }
    return hash >>> 0
  }

  /**
   * 调用 API embedding（失败抛错，由调用方回退）
   * 使用 settings.embedding 配置，复用主 apiKey/baseURL 作为回退
   */
  private async apiEmbed(texts: string[]): Promise<number[][]> {
    const s = settingsStore.get()
    const embCfg = s.embedding
    const model = embCfg?.model ?? ''
    if (!model) throw new Error('未配置 embedding 模型')

    const apiKey = embCfg?.apiKey || s.apiKey
    const baseURL = embCfg?.baseURL || s.baseURL
    if (!apiKey) throw new Error('未配置 API Key')

    const client = new OpenAI({ apiKey, baseURL, dangerouslyAllowBrowser: false })
    const resp = await client.embeddings.create({ model, input: texts })
    // 按 index 排序确保顺序正确
    const sorted = resp.data.sort((a, b) => a.index - b.index)
    return sorted.map((d) => d.embedding)
  }

  /**
   * 后台 backfill：为所有未向量化的记忆生成向量
   * 按 API_BATCH_SIZE 分批，每批后写入持久化，避免一次性占用过多内存
   */
  async backfill(
    memories: Array<{ id: string; content: string; embeddingVersion?: number }>
  ): Promise<void> {
    const pending = memories.filter((m) => this.needsVector(m.embeddingVersion))
    if (pending.length === 0) return

    logger.info(`[Xmemory-Vector] 开始 backfill：${pending.length} 条待向量化（mode=${this.mode}）`)
    const modelLabel = this.mode === 'api' ? (settingsStore.get().embedding?.model ?? 'api') : 'tfidf'

    let processed = 0
    for (let i = 0; i < pending.length; i += API_BATCH_SIZE) {
      const batch = pending.slice(i, i + API_BATCH_SIZE)
      try {
        const vectors = await this.embedBatch(batch.map((m) => m.content))
        for (let j = 0; j < batch.length; j++) {
          this.setVector(batch[j].id, vectors[j], modelLabel)
          processed++
        }
      } catch (err) {
        logger.error(`[Xmemory-Vector] backfill 第 ${i}~${i + batch.length} 批失败:`, err)
        // 失败的批次逐条用 TF-IDF 兜底
        for (const m of batch) {
          try {
            const vec = this.tfidfVector(m.content)
            this.setVector(m.id, vec, 'tfidf')
            processed++
          } catch {
            /* 单条失败跳过，下次 backfill 再试 */
          }
        }
      }
    }
    logger.info(`[Xmemory-Vector] backfill 完成：${processed}/${pending.length} 条已向量化`)
  }

  /** 状态查询 */
  getStatus(totalMemories: number): { vectorized: number; pending: number; mode: string } {
    const embeddings = this.getStore().get('embeddings')
    let vectorized = 0
    for (const id of Object.keys(embeddings)) {
      if (embeddings[id].version >= EMBEDDING_VERSION) vectorized++
    }
    return {
      vectorized,
      pending: Math.max(0, totalMemories - vectorized),
      mode: this.mode
    }
  }
}

export const memoryVectorizer = new MemoryVectorizer()
