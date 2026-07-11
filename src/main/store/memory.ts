import Store from 'electron-store'
import { randomUUID } from 'crypto'
import type {
  MemoryItem,
  MemoryStats,
  MemoryType,
  MemorySource,
  SemanticSearchResult,
  MemoryGraphData,
  VectorIndexStatus
} from '@shared/types'
import { logger } from '../utils/logger'
import { tokenize, isShortTextEquivalent } from '../ai/text-utils'
import { memoryGraph } from '../ai/memory-graph'
import { memoryVectorizer, EMBEDDING_VERSION } from '../ai/memory-vectorizer'

interface MemoryStoreSchema {
  memories: MemoryItem[]
}

/** 记忆条数上限（超过后自动归档低置信度的旧记忆） */
const MAX_MEMORIES = 500
/** 注入到上下文的最大记忆条数 */
const MAX_INJECT_MEMORIES = 30
/** 注入到上下文的最大字符数 */
const MAX_INJECT_CHARS = 3000
/** 主动遗忘：interaction 类型超过此天数未访问则归档 */
const INTERACTION_EXPIRE_DAYS = 90
/** 主动遗忘：低置信度且长期未访问的阈值 */
const STALE_DAYS = 180
const STALE_CONFIDENCE_THRESHOLD = 0.4

/**
 * 计算 Jaccard 相似度（基于 token 集合）
 * 用于记忆去重时的语义相似度判断（向量不可用时的回退）
 */
export function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a))
  const tokensB = new Set(tokenize(b))
  if (tokensA.size === 0 || tokensB.size === 0) return 0
  let intersection = 0
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++
  }
  const union = tokensA.size + tokensB.size - intersection
  return union > 0 ? intersection / union : 0
}

/** 去重相似度阈值：超过此值视为重复记忆 */
export const DEDUP_SIMILARITY_THRESHOLD = 0.65

class MemoryStore {
  private store: Store<MemoryStoreSchema> | null = null
  // ===== KV 内存索引（O(1) 查找） =====
  private byIdMap = new Map<string, MemoryItem>()
  private byTypeMap = new Map<MemoryType, Set<string>>()
  private byTagMap = new Map<string, Set<string>>()

  init(): void {
    this.store = new Store<MemoryStoreSchema>({
      name: 'xmemory',
      defaults: { memories: [] }
    })
    // 重建 KV 索引
    this.rebuildIndexes()
    // 重建知识图谱索引
    memoryGraph.rebuild(this.list())
    // 初始化向量存储
    memoryVectorizer.init()
    // 后台 backfill 未向量化的记忆（不阻塞启动）
    const all = this.list()
    const pending = all.filter((m) => memoryVectorizer.needsVector(m.embeddingVersion))
    if (pending.length > 0) {
      void memoryVectorizer
        .backfill(pending)
        .then(() => {
          logger.info(`[Xmemory] 后台向量化完成：${pending.length} 条`)
        })
        .catch((err) => logger.error('[Xmemory] 后台向量化失败:', err))
    }
    logger.info(
      `[Xmemory] 初始化完成：${all.length} 条记忆，${memoryGraph.totalEntities} 个实体，向量模式=${memoryVectorizer.currentMode}`
    )
  }

  private getStore(): Store<MemoryStoreSchema> {
    if (!this.store) this.init()
    return this.store as Store<MemoryStoreSchema>
  }

  // ===== KV 索引维护 =====

  /** 重建全部 KV 索引（init 时调用） */
  private rebuildIndexes(): void {
    this.byIdMap.clear()
    this.byTypeMap.clear()
    this.byTagMap.clear()
    for (const m of this.getStore().get('memories')) {
      this.indexAdd(m)
    }
  }

  private indexAdd(m: MemoryItem): void {
    this.byIdMap.set(m.id, m)
    let typeSet = this.byTypeMap.get(m.type)
    if (!typeSet) {
      typeSet = new Set<string>()
      this.byTypeMap.set(m.type, typeSet)
    }
    typeSet.add(m.id)
    for (const tag of m.tags) {
      let tagSet = this.byTagMap.get(tag)
      if (!tagSet) {
        tagSet = new Set<string>()
        this.byTagMap.set(tag, tagSet)
      }
      tagSet.add(m.id)
    }
  }

  private indexRemove(id: string): void {
    const m = this.byIdMap.get(id)
    if (!m) return
    this.byIdMap.delete(id)
    this.byTypeMap.get(m.type)?.delete(id)
    for (const tag of m.tags) this.byTagMap.get(tag)?.delete(id)
  }

  /** 全量重建索引（KV + 图谱 + 向量 backfill），供手动触发 */
  async rebuildAllIndexes(): Promise<void> {
    this.rebuildIndexes()
    memoryGraph.rebuild(this.list())
    const all = this.list()
    const pending = all.filter((m) => memoryVectorizer.needsVector(m.embeddingVersion))
    if (pending.length > 0) {
      await memoryVectorizer.backfill(pending)
    }
    logger.info(`[Xmemory] 索引全量重建完成：${all.length} 条记忆，${memoryGraph.totalEntities} 个实体`)
  }

  // ===== 查询方法 =====

  /** 获取所有记忆（未归档） */
  list(): MemoryItem[] {
    return this.getStore().get('memories').filter((m) => !m.archived)
  }

  /** 获取所有记忆（含归档） */
  listAll(): MemoryItem[] {
    return this.getStore().get('memories')
  }

  /** O(1) 按 ID 获取 */
  get(id: string): MemoryItem | undefined {
    return this.byIdMap.get(id)
  }

  // ===== 写操作（均维护 KV 索引 + 图谱索引 + 向量存储） =====

  /** 添加记忆 */
  add(
    item: Omit<MemoryItem, 'id' | 'createdAt' | 'updatedAt' | 'lastAccessedAt' | 'accessCount' | 'archived'>
  ): MemoryItem {
    const now = Date.now()
    const memory: MemoryItem = {
      ...item,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
      accessCount: 0,
      archived: false
    }
    const store = this.getStore()
    const memories = store.get('memories')
    memories.push(memory)
    store.set('memories', memories)
    // 维护索引
    this.indexAdd(memory)
    memoryGraph.indexMemory(memory)
    // 异步向量化（不阻塞）
    this.scheduleVectorize(memory)
    this.evictIfNeeded()
    // 每次添加后检查主动遗忘（低频操作，开销可接受）
    this.cleanupStaleMemories()
    logger.info(`[Xmemory] 新增记忆 [${memory.type}/${memory.category}]: ${memory.content.slice(0, 50)}`)
    return memory
  }

  /**
   * 查找与给定内容相似的记忆（用于去重）
   * 异步：向量语义相似度优先，向量不可用时回退 Jaccard
   * 匹配条件：同类型 + 相似度 >= 阈值
   * 短文本（<=30字）还会做去虚词后的包含判断
   * @returns 相似的记忆，或 undefined
   */
  async findSimilar(
    content: string,
    type: MemoryType,
    _category?: string,
    threshold = DEDUP_SIMILARITY_THRESHOLD
  ): Promise<MemoryItem | undefined> {
    // KV 预过滤：只看同类型记忆
    const candidateIds = this.byTypeMap.get(type)
    if (!candidateIds || candidateIds.size === 0) return undefined

    // 向量语义相似度
    const queryVec = await memoryVectorizer.embed(content)
    let best: MemoryItem | undefined
    let bestScore = 0

    for (const id of candidateIds) {
      const m = this.byIdMap.get(id)
      if (!m || m.archived) continue

      let score = 0
      const mVec = memoryVectorizer.getVector(id)
      if (queryVec && mVec) {
        // 向量余弦相似度
        score = memoryVectorizer.cosineSimilarity(queryVec, mVec)
      } else {
        // 回退：Jaccard
        score = jaccardSimilarity(m.content, content)
      }

      // 短文本等价判断
      if (score < threshold && isShortTextEquivalent(m.content, content)) {
        score = Math.max(score, threshold)
      }

      if (score >= threshold && score > bestScore) {
        bestScore = score
        best = m
      }
    }

    return best
  }

  /** 更新记忆 */
  update(id: string, patch: Partial<Omit<MemoryItem, 'id' | 'createdAt'>>): MemoryItem | null {
    const store = this.getStore()
    const memories = store.get('memories')
    const idx = memories.findIndex((m) => m.id === id)
    if (idx < 0) return null
    const contentChanged = patch.content !== undefined && patch.content !== memories[idx].content
    memories[idx] = { ...memories[idx], ...patch, updatedAt: Date.now() }
    store.set('memories', memories)
    // 维护索引
    this.indexRemove(id)
    this.indexAdd(memories[idx])
    memoryGraph.indexMemory(memories[idx])
    // content 变化时重新向量化
    if (contentChanged) {
      this.scheduleVectorize(memories[idx])
    }
    return memories[idx]
  }

  /** 删除记忆 */
  delete(id: string): boolean {
    const store = this.getStore()
    const memories = store.get('memories')
    const next = memories.filter((m) => m.id !== id)
    if (next.length === memories.length) return false
    store.set('memories', next)
    // 维护索引
    this.indexRemove(id)
    memoryGraph.removeMemory(id)
    memoryVectorizer.deleteVector(id)
    return true
  }

  /** 清空所有记忆 */
  clear(): void {
    this.getStore().set('memories', [])
    this.byIdMap.clear()
    this.byTypeMap.clear()
    this.byTagMap.clear()
    memoryGraph.clear()
    memoryVectorizer.clearAll()
    logger.info('[Xmemory] 所有记忆已清空')
  }

  /** 获取归档记忆 */
  listArchived(): MemoryItem[] {
    return this.getStore().get('memories').filter((m) => m.archived)
  }

  /** 恢复归档记忆 */
  restore(id: string): boolean {
    const store = this.getStore()
    const memories = store.get('memories')
    const idx = memories.findIndex((m) => m.id === id)
    if (idx < 0 || !memories[idx].archived) return false
    memories[idx].archived = false
    memories[idx].updatedAt = Date.now()
    store.set('memories', memories)
    // 维护索引
    this.indexAdd(memories[idx])
    memoryGraph.indexMemory(memories[idx])
    this.scheduleVectorize(memories[idx])
    logger.info(`[Xmemory] 恢复归档记忆: ${id}`)
    return true
  }

  /** 导出所有记忆为 JSON（含归档） */
  exportAll(): { memories: MemoryItem[]; exportedAt: number; version: string } {
    const memories = this.getStore().get('memories')
    return {
      memories,
      exportedAt: Date.now(),
      version: '1.0'
    }
  }

  /** 导入记忆（合并模式，跳过已存在的 ID） */
  importAll(data: { memories: MemoryItem[] }, merge = true): { added: number; skipped: number } {
    if (!data.memories || !Array.isArray(data.memories)) {
      return { added: 0, skipped: 0 }
    }
    const store = this.getStore()
    const existing = store.get('memories')
    const existingIds = new Set(existing.map((m) => m.id))
    let added = 0
    let skipped = 0
    const addedMemories: MemoryItem[] = []
    for (const m of data.memories) {
      if (!m.id || !m.type || !m.content) {
        skipped++
        continue
      }
      if (merge && existingIds.has(m.id)) {
        skipped++
        continue
      }
      // 确保必要字段存在
      const memory: MemoryItem = {
        id: m.id,
        type: m.type,
        category: m.category || 'general',
        content: m.content,
        confidence: Math.max(0, Math.min(1, m.confidence ?? 0.5)),
        source: m.source ?? 'manual',
        sessionId: m.sessionId,
        createdAt: m.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        lastAccessedAt: m.lastAccessedAt ?? Date.now(),
        accessCount: m.accessCount ?? 0,
        tags: Array.isArray(m.tags) ? m.tags : [],
        archived: m.archived ?? false,
        entities: Array.isArray(m.entities) ? m.entities : undefined,
        embeddingVersion: m.embeddingVersion
      }
      existing.push(memory)
      existingIds.add(m.id)
      addedMemories.push(memory)
      added++
    }
    store.set('memories', existing)
    // 维护索引
    for (const m of addedMemories) {
      this.indexAdd(m)
      if (!m.archived) memoryGraph.indexMemory(m)
    }
    this.evictIfNeeded()
    this.cleanupStaleMemories()
    // 后台 backfill 导入的记忆
    const pending = addedMemories.filter((m) => memoryVectorizer.needsVector(m.embeddingVersion))
    if (pending.length > 0) {
      void memoryVectorizer.backfill(pending).catch((err) =>
        logger.error('[Xmemory] 导入后向量化失败:', err)
      )
    }
    logger.info(`[Xmemory] 导入完成：新增 ${added} 条，跳过 ${skipped} 条`)
    return { added, skipped }
  }

  /**
   * 主动遗忘机制：清理过时记忆
   * - interaction 类型超过 90 天未访问则归档
   * - 低置信度（<0.4）且超过 180 天未访问的记忆归档
   * 应在添加记忆和导入记忆后调用
   */
  cleanupStaleMemories(): { archived: number } {
    const store = this.getStore()
    const memories = store.get('memories')
    const now = Date.now()
    let archivedCount = 0

    for (const m of memories) {
      if (m.archived) continue
      const daysSinceAccess = (now - m.lastAccessedAt) / (1000 * 60 * 60 * 24)
      // interaction 类型时效性强，90 天未访问则归档
      if (m.type === 'interaction' && daysSinceAccess > INTERACTION_EXPIRE_DAYS) {
        m.archived = true
        // 维护索引：归档后从图谱移除
        memoryGraph.removeMemory(m.id)
        archivedCount++
        continue
      }
      // 低置信度且长期未访问的记忆归档
      if (m.confidence < STALE_CONFIDENCE_THRESHOLD && daysSinceAccess > STALE_DAYS) {
        m.archived = true
        memoryGraph.removeMemory(m.id)
        archivedCount++
      }
    }

    if (archivedCount > 0) {
      store.set('memories', memories)
      // 同步 byIdMap 中的引用（archived 状态变化）
      for (const m of memories) {
        if (this.byIdMap.has(m.id)) this.byIdMap.set(m.id, m)
      }
      logger.info(`[Xmemory] 主动遗忘：归档 ${archivedCount} 条过时记忆`)
    }
    return { archived: archivedCount }
  }

  /** 搜索记忆（按关键词、类型、标签） */
  search(query: {
    keyword?: string
    type?: MemoryType
    source?: MemorySource
    tag?: string
  }): MemoryItem[] {
    const all = this.list()
    return all.filter((m) => {
      if (query.type && m.type !== query.type) return false
      if (query.source && m.source !== query.source) return false
      if (query.tag && !m.tags.includes(query.tag)) return false
      if (query.keyword) {
        const kw = query.keyword.toLowerCase()
        const haystack = `${m.content} ${m.category} ${m.tags.join(' ')}`.toLowerCase()
        if (!haystack.includes(kw)) return false
      }
      return true
    })
  }

  /**
   * 检索与当前查询最相关的记忆（四阶段管线），用于注入到 AI 上下文
   *
   * 阶段 1：KV 预过滤 —— 用 byTagMap 缩小候选集
   * 阶段 2：向量语义相似度 —— 余弦相似度
   * 阶段 3：图谱扩展 —— 实体链接关联记忆
   * 阶段 4：启发式综合评分 —— 置信度 + 访问频率 + 时间衰减 + 向量 + 图谱 + token 匹配
   */
  async retrieveForContext(userQuery: string, limit = MAX_INJECT_MEMORIES): Promise<MemoryItem[]> {
    const all = this.list()
    if (all.length === 0) return []

    const now = Date.now()
    const queryTokens = new Set(tokenize(userQuery))

    // ===== 阶段 1：KV 预过滤 =====
    // 从查询中提取 token，用 byTagMap 缩小候选集
    let candidateIds: Set<string> | null = null
    for (const t of queryTokens) {
      const tagHits = this.byTagMap.get(t)
      if (tagHits) {
        if (!candidateIds) {
          candidateIds = new Set(tagHits)
        } else {
          for (const id of tagHits) candidateIds.add(id)
        }
      }
    }
    // 候选集为空或太小（<limit*2）时回退到全量
    let candidates: MemoryItem[]
    if (candidateIds && candidateIds.size >= limit * 2) {
      candidates = []
      for (const id of candidateIds) {
        const m = this.byIdMap.get(id)
        if (m && !m.archived) candidates.push(m)
      }
    } else {
      candidates = all
    }

    // ===== 阶段 2：向量语义相似度 =====
    const queryVec = await memoryVectorizer.embed(userQuery)
    const vectorScores = new Map<string, number>()
    if (queryVec) {
      for (const m of candidates) {
        const mVec = memoryVectorizer.getVector(m.id)
        if (mVec) {
          vectorScores.set(m.id, memoryVectorizer.cosineSimilarity(queryVec, mVec))
        }
      }
    }

    // ===== 阶段 3：图谱扩展 =====
    const graphIds = memoryGraph.expand(userQuery, [], limit)

    // ===== 阶段 4：启发式综合评分 =====
    // 类型权重差异化：长期稳定信息权重更高
    const typeWeight: Record<MemoryType, number> = {
      profile: 0.15, // 用户画像：长期稳定，高权重
      preference: 0.12, // 偏好设置：较稳定
      fact: 0.1, // 事实知识：较稳定
      skill: 0.08, // 技能记忆：操作相关
      habit: 0.06, // 操作习惯：可能变化
      interaction: 0.03 // 交互历史：时效性强，低权重
    }

    const scored = candidates.map((m) => {
      // 基础分：置信度 * 0.35
      let score = m.confidence * 0.35
      // 访问频率加权（上限 0.15）
      score += Math.min(m.accessCount * 0.015, 0.15)
      // 类型权重
      score += typeWeight[m.type] ?? 0

      // 时间衰减：30天内不衰减，超过后线性衰减至最低 0.3
      const daysSinceAccess = (now - m.lastAccessedAt) / (1000 * 60 * 60 * 24)
      if (daysSinceAccess > 30) {
        score *= Math.max(0.3, 1 - (daysSinceAccess - 30) / 365)
      }

      // 向量相似度加权（上限 0.4）
      const vScore = vectorScores.get(m.id)
      if (vScore !== undefined) {
        score += Math.min(vScore * 0.4, 0.4)
      }

      // 图谱命中加权
      if (graphIds.has(m.id)) {
        score += 0.15
      }

      // token 匹配加权
      if (queryTokens.size > 0) {
        const contentTokens = new Set(tokenize(m.content))
        const tagTokens = new Set(m.tags.flatMap((t) => tokenize(t)))

        let contentMatches = 0
        let tagMatches = 0
        for (const qt of queryTokens) {
          if (contentTokens.has(qt)) contentMatches++
          if (tagTokens.has(qt)) tagMatches++
        }

        // 内容匹配：按匹配比例加权（上限 0.3）
        const contentRatio = contentMatches / Math.max(queryTokens.size, 1)
        if (contentRatio > 0) score += Math.min(contentRatio * 0.4, 0.3)

        // 标签匹配：按匹配比例加权（上限 0.25）
        const tagRatio = tagMatches / Math.max(queryTokens.size, 1)
        if (tagRatio > 0) score += Math.min(tagRatio * 0.5, 0.25)
      }

      return { memory: m, score }
    })

    // 图谱扩展的记忆若不在候选集中，以低分加入（保证被检索到）
    for (const id of graphIds) {
      if (!candidates.find((m) => m.id === id)) {
        const m = this.byIdMap.get(id)
        if (m && !m.archived) {
          scored.push({ memory: m, score: 0.1 })
        }
      }
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit).map((s) => s.memory)
  }

  /**
   * 语义搜索（纯向量 + 图谱，用于前端语义搜索 UI）
   * 返回带 matchedBy 来源标记的搜索结果
   */
  async semanticSearch(query: string, limit = 20): Promise<SemanticSearchResult[]> {
    const all = this.list()
    if (all.length === 0) return []

    const queryVec = await memoryVectorizer.embed(query)
    const graphIds = memoryGraph.expand(query, [], limit)
    const queryTokens = new Set(tokenize(query))

    const results: SemanticSearchResult[] = all.map((m) => {
      let score = 0
      const matchedBy: SemanticSearchResult['matchedBy'] = []

      // 向量相似度
      const mVec = memoryVectorizer.getVector(m.id)
      if (queryVec && mVec) {
        const vScore = memoryVectorizer.cosineSimilarity(queryVec, mVec)
        if (vScore > 0.1) {
          score += vScore * 0.6
          matchedBy.push('vector')
        }
      }

      // 图谱命中
      if (graphIds.has(m.id)) {
        score += 0.3
        matchedBy.push('graph')
      }

      // 关键词匹配
      if (queryTokens.size > 0) {
        const contentTokens = new Set(tokenize(m.content))
        let matches = 0
        for (const qt of queryTokens) if (contentTokens.has(qt)) matches++
        const ratio = matches / Math.max(queryTokens.size, 1)
        if (ratio > 0) {
          score += Math.min(ratio * 0.4, 0.3)
          matchedBy.push('keyword')
        }
      }

      // 启发式：置信度
      if (matchedBy.length > 0) {
        score += m.confidence * 0.1
        matchedBy.push('heuristic')
      }

      return { memory: m, score, matchedBy }
    })

    return results
      .filter((r) => r.matchedBy.length > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  /** 获取知识图谱可视化数据 */
  getGraphData(): MemoryGraphData {
    return memoryGraph.toGraphData(this.listAll())
  }

  /** 获取向量索引状态 */
  getVectorStatus(): VectorIndexStatus {
    const all = this.list()
    const { vectorized, pending, mode } = memoryVectorizer.getStatus(all.length)
    return {
      totalMemories: all.length,
      vectorized,
      pending,
      embeddingVersion: EMBEDDING_VERSION,
      mode: mode as 'api' | 'tfidf' | 'none',
      lastUpdated: Date.now()
    }
  }

  /** 标记记忆被访问（注入到上下文时调用） */
  markAccessed(ids: string[]): void {
    if (ids.length === 0) return
    const store = this.getStore()
    const memories = store.get('memories')
    const now = Date.now()
    const idSet = new Set(ids)
    for (const m of memories) {
      if (idSet.has(m.id)) {
        m.accessCount += 1
        m.lastAccessedAt = now
        // 同步 byIdMap
        this.byIdMap.set(m.id, m)
      }
    }
    store.set('memories', memories)
  }

  /** 统计信息 */
  stats(): MemoryStats {
    const all = this.list()
    const byType: Record<MemoryType, number> = {
      profile: 0,
      habit: 0,
      preference: 0,
      fact: 0,
      interaction: 0,
      skill: 0
    }
    const bySource: Record<MemorySource, number> = { auto: 0, manual: 0, ai: 0 }
    let confidenceSum = 0
    let lastUpdated = 0
    for (const m of all) {
      byType[m.type] += 1
      bySource[m.source] += 1
      confidenceSum += m.confidence
      if (m.updatedAt > lastUpdated) lastUpdated = m.updatedAt
    }
    return {
      total: all.length,
      byType,
      bySource,
      avgConfidence: all.length > 0 ? confidenceSum / all.length : 0,
      lastUpdated
    }
  }

  /** 超过上限时归档低置信度的旧记忆 */
  private evictIfNeeded(): void {
    const store = this.getStore()
    const memories = store.get('memories')
    if (memories.length <= MAX_MEMORIES) return
    // 按 置信度*0.5 + 访问次数*0.01 - 年龄天数*0.001 排序，归档得分最低的
    const now = Date.now()
    const scored = memories.map((m) => {
      const ageDays = (now - m.createdAt) / (1000 * 60 * 60 * 24)
      return { memory: m, score: m.confidence * 0.5 + m.accessCount * 0.01 - ageDays * 0.001 }
    })
    scored.sort((a, b) => a.score - b.score)
    const toArchive = scored.slice(0, memories.length - MAX_MEMORIES)
    const archiveIds = new Set(toArchive.map((s) => s.memory.id))
    for (const m of memories) {
      if (archiveIds.has(m.id)) {
        m.archived = true
        // 维护图谱索引：归档后从图谱移除
        memoryGraph.removeMemory(m.id)
      }
    }
    store.set('memories', memories)
    // 同步 byIdMap 引用
    for (const m of memories) {
      if (this.byIdMap.has(m.id)) this.byIdMap.set(m.id, m)
    }
    logger.info(`[Xmemory] 已归档 ${toArchive.length} 条低价值记忆`)
  }

  /**
   * 异步向量化某条记忆（不阻塞调用方）
   * 先查缓存，未命中或版本过期才重新生成
   */
  private scheduleVectorize(memory: MemoryItem): void {
    if (!memoryVectorizer.needsVector(memory.embeddingVersion)) return
    void memoryVectorizer
      .embed(memory.content)
      .then((vec) => {
        const modelLabel = memoryVectorizer.currentMode === 'api' ? 'api' : 'tfidf'
        memoryVectorizer.setVector(memory.id, vec, modelLabel)
        // 更新记忆的 embeddingVersion（持久化，避免重复计算）
        this.updateEmbeddingVersion(memory.id, EMBEDDING_VERSION)
      })
      .catch((err) => {
        logger.error(`[Xmemory] 向量化记忆 ${memory.id} 失败:`, err)
      })
  }

  /** 仅更新 embeddingVersion 字段（不触发索引/向量重算） */
  private updateEmbeddingVersion(id: string, version: number): void {
    const store = this.getStore()
    const memories = store.get('memories')
    const idx = memories.findIndex((m) => m.id === id)
    if (idx < 0) return
    memories[idx].embeddingVersion = version
    store.set('memories', memories)
    // 同步 byIdMap
    const m = this.byIdMap.get(id)
    if (m) {
      m.embeddingVersion = version
      this.byIdMap.set(id, m)
    }
  }

  /** 将记忆格式化为可注入 system prompt 的文本 */
  formatForInjection(memories: MemoryItem[]): string {
    if (memories.length === 0) return ''
    const grouped: Record<string, MemoryItem[]> = {}
    for (const m of memories) {
      const key = `${m.type}/${m.category}`
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(m)
    }
    const lines: string[] = [
      '# 用户记忆（Xmemory）',
      '以下是 AI 从历史交互中学习到的用户信息，请据此个性化服务：'
    ]
    let totalChars = lines.join('\n').length
    for (const [key, items] of Object.entries(grouped)) {
      const sectionHeader = `\n## ${key}`
      lines.push(sectionHeader)
      totalChars += sectionHeader.length
      for (const item of items) {
        const line = `- ${item.content}`
        // 逐条检查，超出上限则停止添加（而非跳过整个分组）
        if (totalChars + line.length + 1 > MAX_INJECT_CHARS) {
          // 添加省略提示后停止
          if (totalChars + 3 <= MAX_INJECT_CHARS) {
            lines.push('- ...(更多记忆已省略)')
            totalChars += 20
          }
          return lines.join('\n')
        }
        lines.push(line)
        totalChars += line.length + 1
      }
    }
    return lines.join('\n')
  }
}

export const memoryStore = new MemoryStore()
