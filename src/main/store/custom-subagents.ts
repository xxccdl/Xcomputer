import Store from 'electron-store'
import { randomUUID } from 'crypto'
import type { CustomSubagent, SubagentMode } from '@shared/types'
import { logger } from '../utils/logger'

interface StoreSchema {
  customSubagents: CustomSubagent[]
}

/** 自定义子智能体条数上限 */
const MAX_CUSTOM_SUBAGENTS = 100
/** 注入到上下文的最大模板条数 */
const MAX_INJECT_SUBAGENTS = 10

/**
 * 自定义子智能体模板存储。
 * 仿照 skills.ts 的设计：electron-store 单例 + 增删改查 + 上下文注入格式化。
 * 模板定义子智能体的角色与行为，AI 通过 Subagent 工具的 templateName 参数引用。
 */
class CustomSubagentStore {
  private store: Store<StoreSchema> | null = null

  init(): void {
    this.store = new Store<StoreSchema>({
      name: 'custom-subagents',
      defaults: { customSubagents: [] }
    })
    logger.info(
      `[CustomSubagents] 存储已初始化，当前 ${this.list().length} 个模板`
    )
  }

  private getStore(): Store<StoreSchema> {
    if (!this.store) this.init()
    return this.store as Store<StoreSchema>
  }

  /** 获取所有模板 */
  list(): CustomSubagent[] {
    return this.getStore().get('customSubagents')
  }

  /** 获取所有启用的模板 */
  listEnabled(): CustomSubagent[] {
    return this.list().filter((s) => s.enabled)
  }

  /** 按 ID 获取 */
  get(id: string): CustomSubagent | undefined {
    return this.list().find((s) => s.id === id)
  }

  /** 按名称获取 */
  getByName(name: string): CustomSubagent | undefined {
    return this.list().find((s) => s.name === name)
  }

  /** 检查名称是否已存在（可排除自身 ID，用于更新时） */
  nameExists(name: string, excludeId?: string): boolean {
    return this.list().some((s) => s.name === name && s.id !== excludeId)
  }

  /** 新增模板 */
  add(data: Omit<CustomSubagent, 'id' | 'createdAt' | 'updatedAt' | 'lastUsedAt' | 'useCount'>): CustomSubagent {
    const store = this.getStore()
    const all = store.get('customSubagents')
    if (all.length >= MAX_CUSTOM_SUBAGENTS) {
      throw new Error(`自定义子智能体数量已达上限（${MAX_CUSTOM_SUBAGENTS}）`)
    }
    const now = Date.now()
    const item: CustomSubagent = {
      ...data,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
      useCount: 0
    }
    all.push(item)
    store.set('customSubagents', all)
    logger.info(
      `[CustomSubagents] 新增模板 [${item.name}] (source=${item.source}): ${item.description.slice(0, 50)}`
    )
    return item
  }

  /** 更新模板 */
  update(id: string, patch: Partial<Omit<CustomSubagent, 'id' | 'createdAt'>>): CustomSubagent | null {
    const store = this.getStore()
    const all = store.get('customSubagents')
    const idx = all.findIndex((s) => s.id === id)
    if (idx < 0) return null
    all[idx] = { ...all[idx], ...patch, id, updatedAt: Date.now() }
    store.set('customSubagents', all)
    return all[idx]
  }

  /** 删除模板 */
  delete(id: string): boolean {
    const store = this.getStore()
    const all = store.get('customSubagents')
    const idx = all.findIndex((s) => s.id === id)
    if (idx < 0) return false
    all.splice(idx, 1)
    store.set('customSubagents', all)
    logger.info(`[CustomSubagents] 删除模板: ${id}`)
    return true
  }

  /** 启用/禁用模板 */
  toggle(id: string, enabled?: boolean): CustomSubagent | null {
    const item = this.get(id)
    if (!item) return null
    return this.update(id, { enabled: enabled ?? !item.enabled })
  }

  /** 标记模板被使用（使用计数 +1） */
  markUsed(ids: string[]): void {
    if (ids.length === 0) return
    const store = this.getStore()
    const all = store.get('customSubagents')
    const now = Date.now()
    for (const s of all) {
      if (ids.includes(s.id)) {
        s.useCount++
        s.lastUsedAt = now
      }
    }
    store.set('customSubagents', all)
  }

  /**
   * 检索与当前查询相关的模板（用于上下文注入）。
   * 简化策略：trigger 关键词命中的优先返回；若无命中则返回全部启用模板（让 AI 知道有哪些可用）。
   */
  retrieveForContext(userQuery: string, limit = MAX_INJECT_SUBAGENTS): CustomSubagent[] {
    const all = this.listEnabled()
    if (all.length === 0) return []

    const queryLower = userQuery.toLowerCase()
    // trigger 命中的模板
    const matched = all.filter((s) =>
      s.triggers.some((t) => queryLower.includes(t.toLowerCase()))
    )
    if (matched.length > 0) {
      return matched.slice(0, limit)
    }
    // 无命中：返回全部启用模板（最多 limit 条），让 AI 知道可用模板
    return all.slice(0, limit)
  }

  /**
   * 格式化为可注入 system prompt 的文本（仅模板列表：名称+描述+触发词）。
   * 让 AI 知道有哪些自定义子智能体可用，以及如何通过 Subagent 工具调用。
   */
  formatForInjection(items: CustomSubagent[]): string {
    if (items.length === 0) return ''
    const lines: string[] = [
      '# 可用自定义子智能体（Custom Subagents）',
      '以下是用户预设的子智能体角色。创建子代理时可通过 Subagent 工具的 templateName 参数指定使用某个模板：',
      '{ "action": "create", "templateName": "模板名称", "task": "具体任务描述" }'
    ]
    for (const s of items) {
      const triggers =
        s.triggers.length > 0 ? ` | 触发词: ${s.triggers.slice(0, 5).join(', ')}` : ''
      lines.push(`- **${s.name}**: ${s.description}${triggers}`)
    }
    return lines.join('\n')
  }

  /** AI 生成模板时调用（source 标记为 'ai'） */
  generateFromAI(params: {
    name: string
    description: string
    systemPrompt: string
    triggers?: string[]
    tags?: string[]
    defaultMode?: SubagentMode
    defaultMaxRounds?: number
    sessionId?: string
  }): CustomSubagent {
    const item = this.add({
      name: params.name,
      description: params.description,
      systemPrompt: params.systemPrompt,
      source: 'ai',
      defaultMode: params.defaultMode ?? 'foreground',
      defaultMaxRounds: params.defaultMaxRounds ?? 0,
      triggers: params.triggers ?? [],
      tags: params.tags ?? [],
      enabled: true,
      sessionId: params.sessionId
    })
    logger.info(`[CustomSubagents] AI 生成模板 [${item.name}]`)
    return item
  }
}

export const customSubagentsStore = new CustomSubagentStore()
