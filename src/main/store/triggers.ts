import Store from 'electron-store'
import { randomUUID } from 'crypto'
import type { AutomationTrigger, TriggerType, TriggerRunLog } from '@shared/types'
import { logger } from '../utils/logger'

interface StoreSchema {
  triggers: AutomationTrigger[]
  logs: TriggerRunLog[]
}

const MAX_LOGS = 500

class TriggerStore {
  private store: Store<StoreSchema> | null = null

  init(): void {
    this.store = new Store<StoreSchema>({
      name: 'triggers',
      defaults: { triggers: [], logs: [] }
    })
    logger.info(
      `[TriggerStore] initialized at ${this.store.path}, triggers=${this.store.get('triggers').length}, logs=${this.store.get('logs').length}`
    )
  }

  private getStore(): Store<StoreSchema> {
    if (!this.store) this.init()
    return this.store as Store<StoreSchema>
  }

  list(): AutomationTrigger[] {
    return this.getStore().get('triggers').slice()
  }

  get(id: string): AutomationTrigger | undefined {
    return this.list().find((t) => t.id === id)
  }

  create(item: {
    name: string
    type: TriggerType
    config: AutomationTrigger['config']
    prompt: string
    maxRetries?: number
    retryDelay?: number
    timeoutMs?: number
    notify?: boolean
  }): AutomationTrigger {
    const trigger: AutomationTrigger = {
      id: randomUUID(),
      name: item.name,
      type: item.type,
      config: item.config,
      prompt: item.prompt,
      enabled: true,
      createdAt: Date.now(),
      triggerCount: 0,
      maxRetries: item.maxRetries,
      retryDelay: item.retryDelay,
      timeoutMs: item.timeoutMs,
      notify: item.notify
    }
    const store = this.getStore()
    store.set('triggers', [...store.get('triggers'), trigger])
    logger.info(`[TriggerStore] created trigger ${trigger.id} (${trigger.name})`)
    return trigger
  }

  update(
    id: string,
    patch: Partial<Omit<AutomationTrigger, 'id' | 'createdAt'>>
  ): AutomationTrigger | null {
    const store = this.getStore()
    const triggers = store.get('triggers').slice()
    const idx = triggers.findIndex((t) => t.id === id)
    if (idx === -1) return null
    const updated = { ...triggers[idx], ...patch }
    triggers[idx] = updated
    store.set('triggers', triggers)
    logger.info(`[TriggerStore] updated trigger ${id}`)
    return updated
  }

  delete(id: string): boolean {
    const store = this.getStore()
    const triggers = store.get('triggers')
    const filtered = triggers.filter((t) => t.id !== id)
    if (filtered.length === triggers.length) return false
    store.set('triggers', filtered)
    logger.info(`[TriggerStore] deleted trigger ${id}`)
    return true
  }

  setEnabled(id: string, enabled: boolean): AutomationTrigger | null {
    return this.update(id, { enabled })
  }

  markTriggered(id: string): void {
    const trigger = this.get(id)
    if (!trigger) return
    this.update(id, {
      lastTriggeredAt: Date.now(),
      triggerCount: trigger.triggerCount + 1
    })
  }

  /** 记录一次触发器执行结果 */
  recordRun(log: TriggerRunLog): void {
    const store = this.getStore()
    const logs = store.get('logs').slice()
    logs.unshift(log)
    if (logs.length > MAX_LOGS) logs.length = MAX_LOGS
    store.set('logs', logs)
  }

  /** 获取执行日志（最近 limit 条） */
  listLogs(limit = 50): TriggerRunLog[] {
    return this.getStore()
      .get('logs')
      .slice(0, limit)
  }
}

export const triggerStore = new TriggerStore()
