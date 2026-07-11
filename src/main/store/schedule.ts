import Store from 'electron-store'
import { randomUUID } from 'crypto'
import type { ScheduledTask, ScheduleRunLog } from '@shared/types'
import { logger } from '../utils/logger'

interface StoreSchema {
  tasks: ScheduledTask[]
  logs: ScheduleRunLog[]
}

const MAX_LOGS = 200

class ScheduleStore {
  private store: Store<StoreSchema> | null = null

  init(): void {
    this.store = new Store<StoreSchema>({
      name: 'schedule',
      defaults: { tasks: [], logs: [] }
    })
    logger.info(
      `[ScheduleStore] initialized at ${this.store.path}, tasks=${this.store.get('tasks').length}, logs=${this.store.get('logs').length}`
    )
  }

  private getStore(): Store<StoreSchema> {
    if (!this.store) this.init()
    return this.store as Store<StoreSchema>
  }

  list(): ScheduledTask[] {
    return this.getStore().get('tasks').slice()
  }

  get(id: string): ScheduledTask | undefined {
    return this.list().find((t) => t.id === id)
  }

  create(task: Omit<ScheduledTask, 'id' | 'createdAt' | 'runCount' | 'enabled'> & {
    enabled?: boolean
  }): ScheduledTask {
    const newTask: ScheduledTask = {
      id: randomUUID(),
      createdAt: Date.now(),
      runCount: 0,
      enabled: task.enabled ?? true,
      name: task.name,
      prompt: task.prompt,
      type: task.type,
      schedule: task.schedule
    }
    const store = this.getStore()
    store.set('tasks', [...store.get('tasks'), newTask])
    logger.info(`[ScheduleStore] created task ${newTask.id} (${newTask.name})`)
    return newTask
  }

  update(id: string, patch: Partial<Omit<ScheduledTask, 'id' | 'createdAt'>>): ScheduledTask | null {
    const store = this.getStore()
    const tasks = store.get('tasks')
    const idx = tasks.findIndex((t) => t.id === id)
    if (idx < 0) return null
    const updated = { ...tasks[idx], ...patch }
    tasks[idx] = updated
    store.set('tasks', tasks)
    logger.info(`[ScheduleStore] updated task ${id}`)
    return updated
  }

  delete(id: string): void {
    const store = this.getStore()
    store.set(
      'tasks',
      store.get('tasks').filter((t) => t.id !== id)
    )
    logger.info(`[ScheduleStore] deleted task ${id}`)
  }

  toggle(id: string, enabled: boolean): ScheduledTask | null {
    return this.update(id, { enabled })
  }

  /** 记录一次执行结果，并更新任务的 lastRun 字段 */
  recordRun(log: ScheduleRunLog): void {
    const store = this.getStore()
    const logs = store.get('logs')
    logs.unshift(log)
    // 截断日志，仅保留最近 MAX_LOGS 条
    if (logs.length > MAX_LOGS) logs.length = MAX_LOGS
    store.set('logs', logs)

    // 同步更新任务元信息
    this.update(log.taskId, {
      lastRunAt: log.startedAt,
      lastRunStatus: log.status,
      lastRunError: log.error,
      runCount: (this.get(log.taskId)?.runCount ?? 0) + 1
    })
  }

  listLogs(limit = 50): ScheduleRunLog[] {
    return this.getStore()
      .get('logs')
      .slice(0, limit)
  }
}

export const scheduleStore = new ScheduleStore()
