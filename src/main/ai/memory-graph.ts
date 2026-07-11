/**
 * 记忆知识图谱层：实体链接（Entity Linking）。
 * - entity → Set<memoryId> 内存索引，init 时从全量记忆重建
 * - 不独立持久化：实体列表存在 MemoryItem.entities 中，图谱索引从其派生
 * - 实体缺失时本地 extractEntitiesLocal 回退提取
 * - 支持图遍历扩展（1-hop）和可视化数据生成
 */
import { extractEntitiesLocal } from './text-utils'
import type {
  MemoryItem,
  MemoryGraphData,
  GraphNode,
  GraphEdge
} from '@shared/types'

/** 可视化时保留的最大节点数（避免过大） */
const MAX_GRAPH_NODES = 100

class MemoryGraph {
  /** entity → Set<memoryId>（内存索引） */
  private entityIndex = new Map<string, Set<string>>()

  /** 重建索引（init 时调用） */
  rebuild(memories: MemoryItem[]): void {
    this.entityIndex.clear()
    for (const m of memories) {
      if (m.archived) continue
      const entities = m.entities?.length ? m.entities : extractEntitiesLocal(m.content)
      for (const e of entities) {
        const normalized = this.normalize(e)
        let set = this.entityIndex.get(normalized)
        if (!set) {
          set = new Set<string>()
          this.entityIndex.set(normalized, set)
        }
        set.add(m.id)
      }
    }
  }

  /** 新增/更新记忆时维护索引（先移除旧索引再重新加入） */
  indexMemory(memory: MemoryItem): void {
    this.removeMemory(memory.id)
    const entities = memory.entities?.length ? memory.entities : extractEntitiesLocal(memory.content)
    for (const e of entities) {
      const normalized = this.normalize(e)
      let set = this.entityIndex.get(normalized)
      if (!set) {
        set = new Set<string>()
        this.entityIndex.set(normalized, set)
      }
      set.add(memory.id)
    }
  }

  /** 删除记忆时清理索引 */
  removeMemory(memoryId: string): void {
    for (const [entity, ids] of this.entityIndex) {
      ids.delete(memoryId)
      if (ids.size === 0) this.entityIndex.delete(entity)
    }
  }

  /** 清空全部索引 */
  clear(): void {
    this.entityIndex.clear()
  }

  /**
   * 图遍历扩展：从查询中提取实体，找到关联记忆
   * @param query 用户查询文本
   * @param knownEntities 已知实体（来自 AI 提取，可选；优先使用）
   * @param maxExpand 最大扩展记忆数（默认 10）
   * @returns 关联的 memoryId 集合
   */
  expand(query: string, knownEntities?: string[], maxExpand = 10): Set<string> {
    const entities = knownEntities?.length
      ? knownEntities.map((e) => this.normalize(e))
      : extractEntitiesLocal(query).map((e) => this.normalize(e))

    const result = new Set<string>()
    for (const e of entities) {
      const ids = this.entityIndex.get(e)
      if (ids) {
        for (const id of ids) result.add(id)
      }
      if (result.size >= maxExpand) break
    }
    return result
  }

  /** 查询实体关联的所有记忆 ID（精确匹配实体） */
  lookupByEntity(entity: string): Set<string> | undefined {
    return this.entityIndex.get(this.normalize(entity))
  }

  /** 生成可视化数据（供前端图谱展示） */
  toGraphData(memories: MemoryItem[]): MemoryGraphData {
    // 节点：每个 entity 一个节点，memoryCount = 关联记忆数
    const nodes: GraphNode[] = []
    for (const [entity, ids] of this.entityIndex) {
      const memoryIds = [...ids].filter((id) => {
        const m = memories.find((mm) => mm.id === id)
        return m && !m.archived
      })
      if (memoryIds.length > 0) {
        nodes.push({ entity, memoryCount: memoryIds.length, memoryIds })
      }
    }
    // 按 memoryCount 降序取 top MAX_GRAPH_NODES
    nodes.sort((a, b) => b.memoryCount - a.memoryCount)
    const topNodes = nodes.slice(0, MAX_GRAPH_NODES)
    const topEntities = new Set(topNodes.map((n) => n.entity))

    // 边：两个实体同时出现在同一条记忆中则连边，weight = 共现次数
    const edgeMap = new Map<string, number>()
    for (const m of memories) {
      if (m.archived) continue
      const entities = (m.entities?.length ? m.entities : extractEntitiesLocal(m.content))
        .map((e) => this.normalize(e))
        .filter((e) => topEntities.has(e))
      // 去重
      const uniqueEntities = [...new Set(entities)]
      // 两两组合
      for (let i = 0; i < uniqueEntities.length; i++) {
        for (let j = i + 1; j < uniqueEntities.length; j++) {
          const a = uniqueEntities[i]
          const b = uniqueEntities[j]
          const key = a < b ? `${a}\0${b}` : `${b}\0${a}`
          edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1)
        }
      }
    }
    const edges: GraphEdge[] = []
    for (const [key, weight] of edgeMap) {
      const [source, target] = key.split('\0')
      edges.push({ source, target, weight })
    }
    // 边按 weight 降序，取 top 200 避免过多
    edges.sort((a, b) => b.weight - a.weight)
    const topEdges = edges.slice(0, 200)

    return {
      nodes: topNodes,
      edges: topEdges,
      totalEntities: this.entityIndex.size
    }
  }

  /** 统计：实体总数 */
  get totalEntities(): number {
    return this.entityIndex.size
  }

  /** 实体规范化：小写 + 去首尾空格 */
  private normalize(entity: string): string {
    return entity.toLowerCase().trim()
  }
}

export const memoryGraph = new MemoryGraph()
