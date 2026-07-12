import { BrowserWindow, Notification } from 'electron'
import { scheduleStore } from '../store/schedule'
import { sessionsStore } from '../store/sessions'
import { getOrchestrator } from '../orchestrator/task-orchestrator'
import { logger } from './logger'
import { focusBrowserWindow } from './window-focus'
import { notifyTaskComplete, notifyTaskError } from './notifier'
import { IPC_CHANNELS } from '@shared/constants'
import type { ScheduledTask, ScheduleRunLog, ScheduleStatus } from '@shared/types'

/** 调度器检查间隔（每 30 秒检查一次到期任务） */
const CHECK_INTERVAL_MS = 30_000
/** 窗口隐藏时调度器检查间隔（降频 4 倍，减少后台 CPU 占用） */
const CHECK_INTERVAL_MS_BACKGROUND = 120_000
/** 最大并发执行任务数 */
const MAX_CONCURRENT = 3
/** 默认任务超时（5 分钟） */
const DEFAULT_TIMEOUT_MS = 300_000
/** 默认重试间隔（1 分钟） */
const DEFAULT_RETRY_DELAY_MS = 60_000

class ScheduleService {
  private timer: NodeJS.Timeout | null = null
  private mainWindow: BrowserWindow | null = null
  /** 正在执行中的任务 ID 集合（避免重复触发） */
  private runningTaskIds = new Set<string>()
  /** 任务超时定时器 */
  private timeoutTimers = new Map<string, NodeJS.Timeout>()
  /** 重试定时器 */
  private retryTimers = new Map<string, NodeJS.Timeout>()
  /** 窗口是否隐藏（隐藏时降频检查，减少后台 CPU 占用） */
  private throttled = false

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  /** 窗口隐藏时降频调度检查 */
  onWindowHidden(): void {
    if (this.throttled) return
    this.throttled = true
    this.restartTimer()
    logger.info('[Scheduler] 窗口隐藏，检查间隔降频到 120s')
  }

  /** 窗口可见时恢复正常检查频率 */
  onWindowVisible(): void {
    if (!this.throttled) return
    this.throttled = false
    this.restartTimer()
    logger.info('[Scheduler] 窗口可见，检查间隔恢复到 30s')
  }

  /** 重启调度定时器（用当前 throttled 状态决定间隔） */
  private restartTimer(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.timer = setInterval(() => {
      void this.tick()
    }, this.throttled ? CHECK_INTERVAL_MS_BACKGROUND : CHECK_INTERVAL_MS)
  }

  start(): void {
    if (this.timer) return
    // 启动时立即计算一次下次执行时间
    this.recomputeNextRun()
    this.timer = setInterval(() => {
      void this.tick()
    }, CHECK_INTERVAL_MS)
    logger.info('[Scheduler] 已启动，每 30 秒检查一次到期任务')
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      logger.info('[Scheduler] 已停止')
    }
    // 清理所有超时和重试定时器
    for (const t of this.timeoutTimers.values()) clearTimeout(t)
    for (const t of this.retryTimers.values()) clearTimeout(t)
    this.timeoutTimers.clear()
    this.retryTimers.clear()
  }

  /** 计算每个启用任务的下次执行时间 */
  private recomputeNextRun(): void {
    const tasks = scheduleStore.list()
    const now = Date.now()
    for (const task of tasks) {
      if (!task.enabled) continue
      const next = this.computeNextRun(task, now)
      if (next !== task.nextRunAt) {
        scheduleStore.update(task.id, { nextRunAt: next })
      }
    }
  }

  /** 计算任务的下次执行时间戳（ms），无法计算返回 undefined */
  private computeNextRun(task: ScheduledTask, from: number): number | undefined {
    const now = new Date(from)
    switch (task.type) {
      case 'once': {
        const t = Date.parse(task.schedule)
        if (Number.isNaN(t)) return undefined
        if (task.lastRunStatus === 'done') return undefined
        return t
      }
      case 'interval': {
        const interval = parseInt(task.schedule, 10)
        if (!Number.isFinite(interval) || interval < 1000) return undefined
        const base = task.lastRunAt ?? task.createdAt
        const elapsed = Math.floor((from - base) / interval)
        return base + (elapsed + 1) * interval
      }
      case 'daily': {
        const m = /^(\d{1,2}):(\d{2})$/.exec(task.schedule)
        if (!m) return undefined
        const hh = parseInt(m[1], 10)
        const mm = parseInt(m[2], 10)
        if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return undefined
        const candidate = new Date(now)
        candidate.setHours(hh, mm, 0, 0)
        let t = candidate.getTime()
        if (t <= from) t += 24 * 3600 * 1000
        return t
      }
      case 'weekly': {
        const m = /^(\d{1,2}):(\d{2})\|([0-6])$/.exec(task.schedule)
        if (!m) return undefined
        const hh = parseInt(m[1], 10)
        const mm = parseInt(m[2], 10)
        const dow = parseInt(m[3], 10)
        if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || dow < 0 || dow > 6) return undefined
        for (let i = 0; i < 8; i++) {
          const candidate = new Date(now)
          candidate.setDate(candidate.getDate() + i)
          candidate.setHours(hh, mm, 0, 0)
          if (candidate.getDay() === dow && candidate.getTime() > from) {
            return candidate.getTime()
          }
        }
        return undefined
      }
      case 'cron': {
        return computeCronNextRun(task.schedule, from)
      }
      default:
        return undefined
    }
  }

  /** 每次定时检查：找出到期任务并执行 */
  private async tick(): Promise<void> {
    const tasks = scheduleStore.list()
    const now = Date.now()
    let changed = false

    for (const task of tasks) {
      if (!task.enabled) continue
      if (this.runningTaskIds.has(task.id)) continue
      // 并发控制：正在执行的任务数达到上限则跳过当前任务，继续检查后续到期任务
      if (this.runningTaskIds.size >= MAX_CONCURRENT) continue
      if (!task.nextRunAt || task.nextRunAt > now) continue

      void this.runTask(task)
      changed = true
    }

    if (changed) {
      this.recomputeNextRun()
      this.broadcastChange()
    }
  }

  /** 显示系统通知 */
  private showScheduleNotification(title: string, body: string): void {
    try {
      if (!Notification.isSupported()) return
      const notification = new Notification({
        title,
        body,
        silent: false,
        timeoutType: 'default'
      })
      notification.on('click', () => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          focusBrowserWindow(this.mainWindow)
        }
      })
      notification.show()
      logger.info(`[Scheduler] 通知已显示: ${title}`)
    } catch (err) {
      logger.error('[Scheduler] 通知显示失败:', err)
    }
  }

  /** 立即执行一个任务（用户手动触发或调度触发） */
  async runTask(task: ScheduledTask): Promise<void> {
    if (this.runningTaskIds.has(task.id)) {
      logger.warn(`[Scheduler] 任务 ${task.name} 正在执行中，跳过`)
      return
    }
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      logger.warn('[Scheduler] 主窗口不可用，无法执行定时任务')
      // 记录失败日志，不再静默丢弃
      this.recordFailure(task, '主窗口不可用')
      return
    }

    const orchestrator = getOrchestrator()
    if (!orchestrator) {
      logger.warn('[Scheduler] orchestrator 未初始化')
      this.recordFailure(task, 'orchestrator 未初始化')
      return
    }

    this.runningTaskIds.add(task.id)
    const startedAt = Date.now()
    const log: ScheduleRunLog = {
      taskId: task.id,
      taskName: task.name,
      prompt: task.prompt,
      startedAt,
      status: 'running'
    }
    this.broadcastLog(log)

    // 开始执行时通知用户（可通过 notify=false 关闭）
    if (task.notify !== false) {
      this.showScheduleNotification(
        '⏰ 定时任务开始执行',
        `${task.name}\n${task.prompt.slice(0, 50)}`
      )
    }
    logger.info(`[Scheduler] 开始执行任务 "${task.name}"`)

    // 设置超时定时器
    const timeoutMs = task.timeoutMs ?? DEFAULT_TIMEOUT_MS
    let timedOut = false
    if (timeoutMs > 0) {
      const timeoutTimer = setTimeout(() => {
        timedOut = true
        logger.warn(`[Scheduler] 任务 "${task.name}" 超时 (${timeoutMs}ms)`)
        // 中断 orchestrator 中该会话的任务
        const sessionId = log.sessionId
        if (sessionId) {
          orchestrator.abort(sessionId)
        }
      }, timeoutMs)
      this.timeoutTimers.set(task.id, timeoutTimer)
    }

    try {
      // 创建新会话用于执行
      const session = sessionsStore.create()
      const title = `[定时] ${task.name}`
      // 等待 rename 落盘，避免进程崩溃时留下"新会话"标题的孤儿会话
      await sessionsStore.rename(session.id, title)
      // 通知前端新增会话（SESSION_CREATED 让侧栏立即显示，使用局部 title 避免 session 变异）
      this.mainWindow.webContents.send(IPC_CHANNELS.SESSION_CREATED, {
        ...session,
        title
      })
      log.sessionId = session.id

      this.mainWindow.webContents.send(IPC_CHANNELS.SCHEDULE_RUN_LOG, {
        ...log,
        status: 'running' as ScheduleStatus
      })

      logger.info(`[Scheduler] 开始执行任务 "${task.name}" (session=${session.id})`)

      await orchestrator.handleUserMessage(session.id, task.prompt)

      // 清除超时定时器
      this.clearTimeoutTimer(task.id)

      if (timedOut) {
        throw new Error(`任务超时 (${timeoutMs}ms)`)
      }

      // 执行完成
      log.finishedAt = Date.now()
      log.status = 'done'
      scheduleStore.recordRun(log)
      this.broadcastLog(log)
      // 重置重试计数
      scheduleStore.update(task.id, { retryCount: 0 })
      if (task.notify !== false) {
        notifyTaskComplete(`定时任务：${task.name}`, task.prompt.slice(0, 40))
      }
      logger.info(`[Scheduler] 任务 "${task.name}" 执行完成`)
    } catch (err) {
      this.clearTimeoutTimer(task.id)

      const errorMsg = err instanceof Error ? err.message : String(err)
      log.finishedAt = Date.now()
      log.status = 'error'
      log.error = errorMsg
      scheduleStore.recordRun(log)
      this.broadcastLog(log)
      if (task.notify !== false) {
        notifyTaskError(`定时任务：${task.name}`, errorMsg)
      }
      logger.error(`[Scheduler] 任务 "${task.name}" 执行失败:`, errorMsg)

      // 自动重试逻辑
      this.scheduleRetry(task, errorMsg)
    } finally {
      this.runningTaskIds.delete(task.id)
      this.clearTimeoutTimer(task.id)
      this.recomputeNextRun()
      this.broadcastChange()
    }
  }

  /** 记录失败但不执行重试（用于窗口/orchestrator不可用时） */
  private recordFailure(task: ScheduledTask, reason: string): void {
    const log: ScheduleRunLog = {
      taskId: task.id,
      taskName: task.name,
      prompt: task.prompt,
      startedAt: Date.now(),
      finishedAt: Date.now(),
      status: 'error',
      error: reason
    }
    scheduleStore.recordRun(log)
    this.broadcastLog(log)
    this.scheduleRetry(task, reason)
  }

  /** 调度自动重试 */
  private scheduleRetry(task: ScheduledTask, errorMsg: string): void {
    const maxRetries = task.maxRetries ?? 0
    const currentRetry = task.retryCount ?? 0

    if (maxRetries <= 0 || currentRetry >= maxRetries) {
      logger.info(`[Scheduler] 任务 "${task.name}" 不再重试 (maxRetries=${maxRetries}, currentRetry=${currentRetry})`)
      scheduleStore.update(task.id, { retryCount: 0 })
      return
    }

    const retryDelay = task.retryDelay ?? DEFAULT_RETRY_DELAY_MS
    const nextRetry = currentRetry + 1
    scheduleStore.update(task.id, { retryCount: nextRetry })

    logger.info(
      `[Scheduler] 任务 "${task.name}" 将在 ${retryDelay / 1000}s 后第 ${nextRetry}/${maxRetries} 次重试`
    )

    // 清除旧的重试定时器
    const oldTimer = this.retryTimers.get(task.id)
    if (oldTimer) clearTimeout(oldTimer)

    const retryTimer = setTimeout(() => {
      this.retryTimers.delete(task.id)
      const currentTask = scheduleStore.get(task.id)
      if (!currentTask || !currentTask.enabled) {
        logger.info(`[Scheduler] 任务 "${task.name}" 已被禁用或删除，取消重试`)
        return
      }
      logger.info(`[Scheduler] 任务 "${task.name}" 开始第 ${nextRetry}/${maxRetries} 次重试`)
      void this.runTask(currentTask)
    }, retryDelay)

    this.retryTimers.set(task.id, retryTimer)
  }

  /** 清除任务的超时定时器 */
  private clearTimeoutTimer(taskId: string): void {
    const timer = this.timeoutTimers.get(taskId)
    if (timer) {
      clearTimeout(timer)
      this.timeoutTimers.delete(taskId)
    }
  }

  /** 任务列表变更时通知前端刷新 */
  private broadcastChange(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.mainWindow.webContents.send(IPC_CHANNELS.SCHEDULE_CHANGED, {
      tasks: scheduleStore.list()
    })
  }

  private broadcastLog(log: ScheduleRunLog): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.mainWindow.webContents.send(IPC_CHANNELS.SCHEDULE_RUN_LOG, log)
  }

  /** 任务被增删改后调用，重新计算下次执行时间 */
  onTasksChanged(): void {
    this.recomputeNextRun()
    this.broadcastChange()
  }
}

// ============ Cron 表达式解析（5段式：分 时 日 月 周） ============

/** 解析 cron 表达式段，返回匹配的数值集合 */
function parseCronField(field: string, min: number, max: number): Set<number> {
  const result = new Set<number>()
  if (field === '*') {
    for (let i = min; i <= max; i++) result.add(i)
    return result
  }
  // 支持逗号分隔、范围（1-5）、步进（*/2 或 1-10/2）
  for (const part of field.split(',')) {
    const stepMatch = /^(.+?)\/(\d+)$/.exec(part)
    const step = stepMatch ? parseInt(stepMatch[2], 10) : 1
    const range = stepMatch ? stepMatch[1] : part
    if (range === '*') {
      for (let i = min; i <= max; i += step) result.add(i)
    } else {
      const rangeMatch = /^(\d+)-(\d+)$/.exec(range)
      if (rangeMatch) {
        const s = parseInt(rangeMatch[1], 10)
        const e = parseInt(rangeMatch[2], 10)
        for (let i = s; i <= e; i += step) result.add(i)
      } else {
        const v = parseInt(range, 10)
        if (!Number.isNaN(v)) result.add(v)
      }
    }
  }
  return result
}

/** 计算 cron 表达式的下次执行时间 */
function computeCronNextRun(cronExpr: string, from: number): number | undefined {
  const parts = cronExpr.trim().split(/\s+/)
  if (parts.length !== 5) return undefined

  const [minF, hourF, dayF, monthF, dowF] = parts
  const minutes = parseCronField(minF, 0, 59)
  const hours = parseCronField(hourF, 0, 23)
  const days = parseCronField(dayF, 1, 31)
  const months = parseCronField(monthF, 1, 12)
  const dows = parseCronField(dowF, 0, 6) // 0=周日

  // 从 from+1 分钟开始逐分钟搜索（最多搜索 366 天）
  const start = new Date(from)
  start.setSeconds(0, 0)
  start.setMinutes(start.getMinutes() + 1)

  const maxIter = 366 * 24 * 60 // 最多一年的分钟数
  for (let i = 0; i < maxIter; i++) {
    const candidate = new Date(start.getTime() + i * 60_000)
    if (
      minutes.has(candidate.getMinutes()) &&
      hours.has(candidate.getHours()) &&
      days.has(candidate.getDate()) &&
      months.has(candidate.getMonth() + 1) &&
      dows.has(candidate.getDay())
    ) {
      return candidate.getTime()
    }
  }
  return undefined
}

export const scheduleService = new ScheduleService()
