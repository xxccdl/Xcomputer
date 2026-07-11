import { app } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import { randomUUID } from 'crypto'
import type { ContextUsage, Message, Session, TaskStep } from '@shared/types'
import { extractTextFromContent } from '@shared/types'
import { logger } from '../utils/logger'

class SessionsStore {
  private dir: string = ''
  /** 正在写入的会话文件 Promise，避免并发读写竞态 */
  private writePromises = new Map<string, Promise<void>>()
  /** per-session 操作锁，串行化整个 read-modify-write，避免并发覆盖导致数据丢失 */
  private locks = new Map<string, Promise<void>>()

  private async ensureDir(): Promise<void> {
    if (!this.dir) this.dir = join(app.getPath('userData'), 'sessions')
    await fs.mkdir(this.dir, { recursive: true })
  }

  /** 串行化对同一会话的 read-modify-write 操作，避免并发覆盖导致消息/步骤丢失 */
  private async withSessionLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve()
    let release!: () => void
    const next = new Promise<void>((r) => {
      release = r
    })
    // 保存引用，finally 中用引用比较（而非再次调用 prev.then() 创建新 Promise）
    const newLock = prev.then(() => next)
    this.locks.set(id, newLock)
    await prev
    try {
      return await fn()
    } finally {
      release()
      // 只有当当前锁是 newLock 时才清理，避免误删后续锁
      if (this.locks.get(id) === newLock) {
        this.locks.delete(id)
      }
    }
  }

  private async readSessionFile(id: string): Promise<{
    meta: Session
    messages: Message[]
    steps: TaskStep[]
    contextUsage?: ContextUsage
  } | null> {
    await this.ensureDir()
    // 等待该会话的写入完成，避免读到半写入的数据
    const pending = this.writePromises.get(id)
    if (pending) await pending
    const filePath = join(this.dir, `${id}.json`)
    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  private async writeSessionFile(id: string, data: {
    meta: Session
    messages: Message[]
    steps: TaskStep[]
    contextUsage?: ContextUsage
  }): Promise<void> {
    await this.ensureDir()
    const filePath = join(this.dir, `${id}.json`)
    // 用 Promise 链保证同一会话的写入串行执行，避免并发覆盖
    const prev = this.writePromises.get(id) ?? Promise.resolve()
    const next = prev.then(() => fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8'))
    this.writePromises.set(id, next)
    next.then(
      () => {
        if (this.writePromises.get(id) === next) this.writePromises.delete(id)
      },
      (err) => {
        logger.error(`[SessionsStore] 写入会话 ${id} 失败:`, err)
        if (this.writePromises.get(id) === next) this.writePromises.delete(id)
      }
    )
    return next
  }

  list(): Session[] {
    return this._cache
  }

  getMeta(id: string): Session | undefined {
    return this._cache.find((s) => s.id === id)
  }

  private _cache: Session[] = []

  async loadAll(): Promise<void> {
    await this.ensureDir()
    const files = await fs.readdir(this.dir)
    const sessions: Session[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const data = await this.readSessionFile(file.replace('.json', ''))
      if (data) sessions.push(data.meta)
    }
    sessions.sort((a, b) => b.updatedAt - a.updatedAt)
    this._cache = sessions
    logger.info(`Loaded ${sessions.length} sessions`)
  }

  create(): Session {
    const now = Date.now()
    const session: Session = {
      id: randomUUID(),
      title: '新会话',
      createdAt: now,
      updatedAt: now
    }
    this._cache.unshift(session)
    void this.writeSessionFile(session.id, { meta: session, messages: [], steps: [] })
    return session
  }

  delete(id: string): void {
    this._cache = this._cache.filter((s) => s.id !== id)
    // 等待 pending 写入完成后再删除文件，避免文件被重新创建
    void this.ensureDir()
      .then(() => this.writePromises.get(id) ?? Promise.resolve())
      .then(() => fs.unlink(join(this.dir, `${id}.json`)).catch(() => {}))
      .finally(() => {
        this.writePromises.delete(id)
        this.locks.delete(id)
      })
  }

  async rename(id: string, title: string): Promise<void> {
    const idx = this._cache.findIndex((s) => s.id === id)
    if (idx < 0) return
    this._cache[idx] = { ...this._cache[idx], title, updatedAt: Date.now() }
    const newMeta = this._cache[idx]
    // 用锁串行化，避免与 appendMessage/upsertStep 并发覆盖
    // 等待落盘完成，避免进程崩溃时标题未持久化
    await this.withSessionLock(id, async () => {
      const data = await this.readSessionFile(id)
      if (data) {
        await this.writeSessionFile(id, { ...data, meta: newMeta })
      }
    })
  }

  async getMessages(id: string): Promise<Message[]> {
    const data = await this.readSessionFile(id)
    return data?.messages ?? []
  }

  async getSteps(id: string): Promise<TaskStep[]> {
    const data = await this.readSessionFile(id)
    return data?.steps ?? []
  }

  /** 持久化保存会话的上下文使用统计（切换会话后可直接读取，无需重新计算） */
  async saveContextUsage(id: string, usage: ContextUsage): Promise<void> {
    await this.withSessionLock(id, async () => {
      const data = await this.readSessionFile(id)
      if (!data) return
      data.contextUsage = usage
      await this.writeSessionFile(id, data)
    })
  }

  /** 读取持久化的上下文使用统计（可能为 null——任务从未执行过） */
  async getContextUsagePersisted(id: string): Promise<ContextUsage | null> {
    const data = await this.readSessionFile(id)
    return data?.contextUsage ?? null
  }

  /**
   * 全文搜索所有会话的消息内容
   * 返回匹配的会话列表（含匹配片段预览）
   */
  async search(query: string, limit = 50): Promise<Array<{
    sessionId: string
    sessionTitle: string
    matchedMessage: string  // 匹配的消息内容片段（前后各取 50 字符）
    messageRole: string
    createdAt: number
  }>> {
    const trimmed = query.trim()
    if (!trimmed) return []
    const lowerQuery = trimmed.toLowerCase()
    const results: Array<{
      sessionId: string
      sessionTitle: string
      matchedMessage: string
      messageRole: string
      createdAt: number
    }> = []
    // 遍历缓存中的所有会话
    for (const session of this._cache) {
      const data = await this.readSessionFile(session.id)
      if (!data) continue
      for (const message of data.messages) {
        const content = extractTextFromContent(message.content ?? '')
        const lowerContent = content.toLowerCase()
        const idx = lowerContent.indexOf(lowerQuery)
        if (idx < 0) continue
        // 截取匹配位置前后各 50 字符作为预览
        const start = Math.max(0, idx - 50)
        const end = Math.min(content.length, idx + lowerQuery.length + 50)
        const preview =
          (start > 0 ? '…' : '') +
          content.slice(start, end) +
          (end < content.length ? '…' : '')
        results.push({
          sessionId: session.id,
          sessionTitle: session.title,
          matchedMessage: preview,
          messageRole: message.role,
          createdAt: message.createdAt
        })
      }
    }
    // 按 createdAt 降序排列
    results.sort((a, b) => b.createdAt - a.createdAt)
    // 限制返回条数
    return results.slice(0, limit)
  }

  async appendMessage(id: string, message: Message): Promise<void> {
    // 用锁串行化整个 read-modify-write，避免并发覆盖导致消息丢失
    await this.withSessionLock(id, async () => {
      let data = await this.readSessionFile(id)
      if (!data) {
        const meta = this._cache.find((s) => s.id === id) ?? {
          id,
          title: '新会话',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
        data = { meta, messages: [], steps: [] }
      }
      data.messages.push(message)
      data.meta.updatedAt = Date.now()
      this.updateCache(data.meta)
      await this.writeSessionFile(id, data)
    })
  }

  /**
   * 用一条摘要消息替换 [0, keepFromIdx) 范围内的老消息（手动/自动上下文压缩后持久化）
   * @param keepFromIdx 保留消息的起始索引（该索引及之后的消息保留不变）
   * @param summaryMessage 用以替换老消息的摘要 assistant 消息
   * @returns 替换后的完整消息列表
   */
  async replaceMessagesRange(id: string, keepFromIdx: number, summaryMessage: Message): Promise<Message[]> {
    return await this.withSessionLock(id, async () => {
      let data = await this.readSessionFile(id)
      if (!data) {
        const meta = this._cache.find((s) => s.id === id) ?? {
          id,
          title: '新会话',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
        data = { meta, messages: [], steps: [] }
      }
      const safeIdx = Math.max(0, Math.min(keepFromIdx, data.messages.length))
      const kept = data.messages.slice(safeIdx)
      const newMessages = [summaryMessage, ...kept]
      data.messages = newMessages
      data.meta.updatedAt = Date.now()
      this.updateCache(data.meta)
      await this.writeSessionFile(id, data)
      return newMessages
    })
  }

  async upsertStep(id: string, step: TaskStep): Promise<void> {
    // 用锁串行化整个 read-modify-write，避免并发覆盖导致步骤丢失
    await this.withSessionLock(id, async () => {
      let data = await this.readSessionFile(id)
      if (!data) {
        const meta = this._cache.find((s) => s.id === id) ?? {
          id,
          title: '新会话',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
        data = { meta, messages: [], steps: [] }
      }
      const idx = data.steps.findIndex((s) => s.id === step.id)
      if (idx >= 0) data.steps[idx] = step
      else data.steps.push(step)
      data.meta.updatedAt = Date.now()
      this.updateCache(data.meta)
      await this.writeSessionFile(id, data)
    })
  }

  private updateCache(meta: Session): void {
    const idx = this._cache.findIndex((s) => s.id === meta.id)
    if (idx >= 0) this._cache[idx] = meta
    else this._cache.unshift(meta)
    this._cache.sort((a, b) => b.updatedAt - a.updatedAt)
  }
}

export const sessionsStore = new SessionsStore()
