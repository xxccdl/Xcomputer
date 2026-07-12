import { watch, type FSWatcher } from 'fs'
import { execFile } from 'child_process'
import { networkInterfaces } from 'os'
import { BrowserWindow, Notification } from 'electron'
import { triggerStore } from '../store/triggers'
import { logger } from './logger'
import { focusBrowserWindow } from './window-focus'
import { notifyTaskComplete, notifyTaskError } from './notifier'
import { IPC_CHANNELS } from '@shared/constants'
import type { AutomationTrigger, TriggerRunLog } from '@shared/types'

/** 触发器执行器：由 index.ts 注入，避免与 orchestrator 直接耦合（防循环依赖） */
export interface TriggerExecutor {
  /** 创建会话并通知前端，返回 sessionId */
  prepareSession: (trigger: AutomationTrigger) => Promise<{ sessionId: string }>
  /** 执行 AI 指令（在会话中），resolve 表示完成，reject 表示失败 */
  execute: (sessionId: string, prompt: string) => Promise<void>
  /** 中止某会话的执行（超时时调用） */
  abort: (sessionId: string) => void
}

/** 默认任务超时（5 分钟） */
const DEFAULT_TIMEOUT_MS = 300_000
/** 默认重试间隔（1 分钟） */
const DEFAULT_RETRY_DELAY_MS = 60_000
/** 触发防抖窗口（2 秒） */
const DEBOUNCE_MS = 2000
/** 系统（USB/网络）轮询间隔 */
const SYSTEM_POLL_MS = 10_000
/** 窗口隐藏时系统轮询间隔（降频 6 倍，减少后台 CPU 占用） */
const SYSTEM_POLL_MS_BACKGROUND = 60_000

class TriggerService {
  private fileWatchers = new Map<string, FSWatcher>() // triggerId -> watcher
  private intervalTimers = new Map<string, NodeJS.Timeout>() // triggerId -> timer
  private startupTriggered = false
  private executor: TriggerExecutor | null = null
  private mainWindow: BrowserWindow | null = null
  /** 正在执行中的触发器 ID 集合（避免重复触发） */
  private runningIds = new Set<string>()
  /** 触发器超时定时器 */
  private timeoutTimers = new Map<string, NodeJS.Timeout>()
  /** 触发器重试定时器 */
  private retryTimers = new Map<string, NodeJS.Timeout>()
  /** 触发防抖定时器（合并短时间内的多次触发） */
  private debounceTimers = new Map<string, NodeJS.Timeout>()
  /** 窗口是否隐藏（隐藏时降频 USB/网络轮询，减少后台 CPU 占用） */
  private throttled = false

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  init(executor: TriggerExecutor): void {
    this.executor = executor
    // 启动时触发 startup 类型的触发器
    if (!this.startupTriggered) {
      this.startupTriggered = true
      setTimeout(() => this.triggerStartup(), 5000) // 5秒后触发，等待应用完全启动
    }
    // 重新加载所有已启用的触发器
    this.reloadAll()
  }

  reloadAll(): void {
    const triggers = triggerStore.list().filter((t) => t.enabled)
    for (const trigger of triggers) {
      this.startWatching(trigger)
    }
  }

  startWatching(trigger: AutomationTrigger): void {
    this.stopWatching(trigger.id) // 先停止旧的监听

    if (!trigger.enabled) return

    switch (trigger.type) {
      case 'file_watch':
        this.watchFile(trigger)
        break
      case 'interval':
        this.watchInterval(trigger)
        break
      case 'startup':
        // startup 在 init 时已处理
        break
      case 'usb':
        this.watchUsb(trigger)
        break
      case 'network':
        this.watchNetwork(trigger)
        break
    }
  }

  stopWatching(triggerId: string): void {
    const watcher = this.fileWatchers.get(triggerId)
    if (watcher) {
      watcher.close()
      this.fileWatchers.delete(triggerId)
    }
    const timer = this.intervalTimers.get(triggerId)
    if (timer) {
      clearInterval(timer)
      this.intervalTimers.delete(triggerId)
    }
    // 清理防抖定时器
    const debounce = this.debounceTimers.get(triggerId)
    if (debounce) {
      clearTimeout(debounce)
      this.debounceTimers.delete(triggerId)
    }
  }

  stopAll(): void {
    for (const [id] of this.fileWatchers) {
      this.stopWatching(id)
    }
    for (const [id] of this.intervalTimers) {
      this.stopWatching(id)
    }
    // 清理防抖定时器（否则 stopAll 后仍会有孤儿会话被创建）
    for (const t of this.debounceTimers.values()) clearTimeout(t)
    this.debounceTimers.clear()
    for (const t of this.timeoutTimers.values()) clearTimeout(t)
    for (const t of this.retryTimers.values()) clearTimeout(t)
    this.timeoutTimers.clear()
    this.retryTimers.clear()
    this.runningIds.clear()
  }

  /** 窗口隐藏时降频 USB/网络轮询（只重建轮询定时器，不中断正在执行的触发器） */
  onWindowHidden(): void {
    if (this.throttled) return // 已处于节流状态
    this.throttled = true
    this.reloadPollers()
    logger.info('[TriggerService] 窗口隐藏，USB/网络轮询降频到 60s')
  }

  /** 窗口可见时恢复正常轮询频率 */
  onWindowVisible(): void {
    if (!this.throttled) return // 已处于正常状态
    this.throttled = false
    this.reloadPollers()
    logger.info('[TriggerService] 窗口可见，USB/网络轮询恢复到 10s')
  }

  /** 重建所有 USB/网络轮询型监听器（用当前 throttled 状态决定间隔） */
  private reloadPollers(): void {
    // 收集当前所有 usb/network 类型的触发器 ID
    const triggers = triggerStore.list().filter(
      (t) => t.enabled && (t.type === 'usb' || t.type === 'network')
    )
    for (const trigger of triggers) {
      // 停止旧的轮询定时器（只清 intervalTimers，不碰 runningIds/timeout/retry）
      const timer = this.intervalTimers.get(trigger.id)
      if (timer) {
        clearInterval(timer)
        this.intervalTimers.delete(trigger.id)
      }
      // 用新间隔重建
      if (trigger.type === 'usb') this.watchUsb(trigger)
      else if (trigger.type === 'network') this.watchNetwork(trigger)
    }
  }

  private watchFile(trigger: AutomationTrigger): void {
    if (!trigger.config.path) return
    try {
      const pattern = trigger.config.pattern || '*'
      const watcher = watch(
        trigger.config.path,
        { recursive: true },
        (eventType, filename) => {
          if (!filename) return
          const name = String(filename)
          // 简单匹配模式
          if (pattern !== '*' && !this.matchPattern(name, pattern)) return
          logger.info(
            `[TriggerService] file_watch triggered: ${trigger.name} (${eventType} ${name})`
          )
          this.fire(trigger)
        }
      )
      // FSWatcher 的 'error' 事件若无监听器会触发 uncaughtException 导致进程崩溃
      // （如监听目录被删除、权限不足等场景）
      watcher.on('error', (err) => {
        logger.error(`[TriggerService] fs.watch error for ${trigger.name}:`, err)
        try {
          watcher.close()
        } catch {
          // ignore
        }
        this.fileWatchers.delete(trigger.id)
      })
      this.fileWatchers.set(trigger.id, watcher)
      logger.info(
        `[TriggerService] watching ${trigger.config.path} for trigger ${trigger.name}`
      )
    } catch (err) {
      logger.error(`[TriggerService] failed to watch ${trigger.config.path}:`, err)
    }
  }

  private watchInterval(trigger: AutomationTrigger): void {
    const interval = trigger.config.interval || 60000 // 默认1分钟
    const timer = setInterval(() => {
      logger.info(`[TriggerService] interval triggered: ${trigger.name}`)
      this.fire(trigger)
    }, interval)
    this.intervalTimers.set(trigger.id, timer)
    logger.info(
      `[TriggerService] interval timer set for ${trigger.name} (${interval}ms)`
    )
  }

  /** USB 设备检测：轮询 Get-PnpDevice，检测新增设备时触发 */
  private watchUsb(trigger: AutomationTrigger): void {
    let lastDevices = new Set<string>()
    const timer = setInterval(() => {
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          'Get-PnpDevice -PresentOnly | Where-Object {$_.Class -in "USB","DiskDrive","Volume"} | Select-Object -ExpandProperty InstanceId'
        ],
        { timeout: 8000, windowsHide: true },
        (err, stdout) => {
          if (err) {
            logger.debug(`[TriggerService] USB poll failed for ${trigger.name}:`, err.message)
            return
          }
          const current = new Set(
            stdout
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean)
          )
          // 首次轮询仅建立基线，不触发
          if (lastDevices.size > 0) {
            const pattern = (trigger.config.devicePattern ?? '*').toLowerCase()
            for (const dev of current) {
              if (!lastDevices.has(dev)) {
                const needle = pattern.replace(/\*/g, '')
                if (pattern === '*' || dev.toLowerCase().includes(needle)) {
                  logger.info(
                    `[TriggerService] usb triggered: ${trigger.name} (new device: ${dev})`
                  )
                  this.fire(trigger)
                  break
                }
              }
            }
          }
          lastDevices = current
        }
      )
    }, this.throttled ? SYSTEM_POLL_MS_BACKGROUND : SYSTEM_POLL_MS)
    this.intervalTimers.set(trigger.id, timer)
    logger.info(`[TriggerService] usb watcher started for ${trigger.name}`)
  }

  /** 网络变化检测：轮询 os.networkInterfaces()，对比非内网地址集合变化时触发 */
  private watchNetwork(trigger: AutomationTrigger): void {
    let lastKey = ''
    const snapshot = (): string => {
      const ifaces = networkInterfaces()
      const acc: Record<string, string[]> = {}
      for (const k of Object.keys(ifaces)) {
        acc[k] = (ifaces[k] || [])
          .filter((a) => !a.internal)
          .map((a) => a.address)
      }
      return JSON.stringify(acc)
    }
    const timer = setInterval(() => {
      const key = snapshot()
      if (lastKey && lastKey !== key) {
        const event = trigger.config.networkEvent ?? 'both'
        const oldCount = lastKey.split('"').length
        const newCount = key.split('"').length
        const connected = newCount > oldCount
        const disconnected = newCount < oldCount
        if (
          event === 'both' ||
          (event === 'connect' && connected) ||
          (event === 'disconnect' && disconnected)
        ) {
          logger.info(
            `[TriggerService] network triggered: ${trigger.name} (event=${event})`
          )
          this.fire(trigger)
        }
      }
      lastKey = key
    }, this.throttled ? SYSTEM_POLL_MS_BACKGROUND : SYSTEM_POLL_MS)
    this.intervalTimers.set(trigger.id, timer)
    logger.info(`[TriggerService] network watcher started for ${trigger.name}`)
  }

  private triggerStartup(): void {
    const startupTriggers = triggerStore
      .list()
      .filter((t) => t.enabled && t.type === 'startup')
    for (const trigger of startupTriggers) {
      logger.info(`[TriggerService] startup triggered: ${trigger.name}`)
      this.fire(trigger)
    }
  }

  /**
   * 触发入口：防抖合并 2 秒内的多次触发，避免 fs.watch 重复事件导致短时间多次执行。
   */
  private fire(trigger: AutomationTrigger): void {
    const old = this.debounceTimers.get(trigger.id)
    if (old) clearTimeout(old)
    this.debounceTimers.set(
      trigger.id,
      setTimeout(() => {
        this.debounceTimers.delete(trigger.id)
        // 防抖到期后重新校验触发器是否仍存在且启用（可能已被用户删除/禁用）
        const current = triggerStore.get(trigger.id)
        if (!current || !current.enabled) {
          logger.info(`[TriggerService] 触发器 "${trigger.name}" 已被删除或禁用，取消执行`)
          return
        }
        void this.runTrigger(current)
      }, DEBOUNCE_MS)
    )
  }

  /** 显示系统通知 */
  private showTriggerNotification(title: string, body: string): void {
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
    } catch (err) {
      logger.error('[TriggerService] 通知显示失败:', err)
    }
  }

  /** 执行触发器：创建会话→执行→超时→重试→日志→通知 */
  async runTrigger(trigger: AutomationTrigger): Promise<void> {
    if (this.runningIds.has(trigger.id)) {
      logger.warn(`[TriggerService] 触发器 "${trigger.name}" 正在执行中，跳过`)
      return
    }
    if (!this.executor) {
      logger.warn('[TriggerService] executor 未注入，跳过触发')
      return
    }
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      logger.warn('[TriggerService] 主窗口不可用，无法执行触发器')
      this.recordFailure(trigger, '主窗口不可用')
      return
    }

    this.runningIds.add(trigger.id)
    const startedAt = Date.now()
    const log: TriggerRunLog = {
      triggerId: trigger.id,
      triggerName: trigger.name,
      prompt: trigger.prompt,
      startedAt,
      status: 'running'
    }
    this.broadcastLog(log)

    // 开始执行时通知用户（可通过 notify=false 关闭）
    if (trigger.notify !== false) {
      this.showTriggerNotification(
        '⚡ 自动化触发器执行',
        `${trigger.name}\n${trigger.prompt.slice(0, 50)}`
      )
    }
    logger.info(`[TriggerService] 开始执行触发器 "${trigger.name}"`)

    // 设置超时定时器
    const timeoutMs = trigger.timeoutMs ?? DEFAULT_TIMEOUT_MS
    let timedOut = false
    let sessionId: string | undefined
    if (timeoutMs > 0) {
      const timeoutTimer = setTimeout(() => {
        timedOut = true
        logger.warn(`[TriggerService] 触发器 "${trigger.name}" 超时 (${timeoutMs}ms)`)
        if (sessionId) {
          this.executor!.abort(sessionId)
        }
      }, timeoutMs)
      this.timeoutTimers.set(trigger.id, timeoutTimer)
    }

    try {
      // 创建新会话用于执行
      const prepared = await this.executor.prepareSession(trigger)
      sessionId = prepared.sessionId
      log.sessionId = sessionId

      // 超时若在 prepareSession 期间触发，sessionId 此时才就绪，需立即中止并抛出
      // （否则 abort() 永远不会被调用，execute 仍会执行）
      if (timedOut) {
        this.executor!.abort(sessionId)
        throw new Error(`触发器超时 (${timeoutMs}ms)`)
      }

      logger.info(
        `[TriggerService] 开始执行触发器 "${trigger.name}" (session=${sessionId})`
      )

      await this.executor.execute(sessionId, trigger.prompt)

      // 清除超时定时器
      this.clearTimeoutTimer(trigger.id)

      if (timedOut) {
        throw new Error(`触发器超时 (${timeoutMs}ms)`)
      }

      // 执行完成
      log.finishedAt = Date.now()
      log.status = 'done'
      triggerStore.recordRun(log)
      this.broadcastLog(log)
      // 重置重试计数
      triggerStore.update(trigger.id, { retryCount: 0 })
      // 标记触发（更新 lastTriggeredAt / triggerCount）
      triggerStore.markTriggered(trigger.id)
      if (trigger.notify !== false) {
        notifyTaskComplete(`触发器：${trigger.name}`, trigger.prompt.slice(0, 40))
      }
      logger.info(`[TriggerService] 触发器 "${trigger.name}" 执行完成`)
    } catch (err) {
      this.clearTimeoutTimer(trigger.id)

      const errorMsg = err instanceof Error ? err.message : String(err)
      log.finishedAt = Date.now()
      log.status = 'error'
      log.error = errorMsg
      triggerStore.recordRun(log)
      this.broadcastLog(log)
      // 仍然标记触发（已尝试执行）
      triggerStore.markTriggered(trigger.id)
      if (trigger.notify !== false) {
        notifyTaskError(`触发器：${trigger.name}`, errorMsg)
      }
      logger.error(`[TriggerService] 触发器 "${trigger.name}" 执行失败:`, errorMsg)

      // 自动重试逻辑
      this.scheduleRetry(trigger, errorMsg)
    } finally {
      this.runningIds.delete(trigger.id)
      this.clearTimeoutTimer(trigger.id)
      this.broadcastChange()
    }
  }

  /** 记录失败但不执行重试（用于窗口/executor不可用时） */
  private recordFailure(trigger: AutomationTrigger, reason: string): void {
    const log: TriggerRunLog = {
      triggerId: trigger.id,
      triggerName: trigger.name,
      prompt: trigger.prompt,
      startedAt: Date.now(),
      finishedAt: Date.now(),
      status: 'error',
      error: reason
    }
    triggerStore.recordRun(log)
    this.broadcastLog(log)
    triggerStore.markTriggered(trigger.id)
    this.scheduleRetry(trigger, reason)
  }

  /** 调度自动重试 */
  private scheduleRetry(trigger: AutomationTrigger, errorMsg: string): void {
    const maxRetries = trigger.maxRetries ?? 0
    const currentRetry = trigger.retryCount ?? 0

    if (maxRetries <= 0 || currentRetry >= maxRetries) {
      logger.info(
        `[TriggerService] 触发器 "${trigger.name}" 不再重试 (maxRetries=${maxRetries}, currentRetry=${currentRetry})`
      )
      triggerStore.update(trigger.id, { retryCount: 0 })
      return
    }

    const retryDelay = trigger.retryDelay ?? DEFAULT_RETRY_DELAY_MS
    const nextRetry = currentRetry + 1
    triggerStore.update(trigger.id, { retryCount: nextRetry })

    logger.info(
      `[TriggerService] 触发器 "${trigger.name}" 将在 ${retryDelay / 1000}s 后第 ${nextRetry}/${maxRetries} 次重试`
    )

    // 清除旧的重试定时器
    const oldTimer = this.retryTimers.get(trigger.id)
    if (oldTimer) clearTimeout(oldTimer)

    const retryTimer = setTimeout(() => {
      this.retryTimers.delete(trigger.id)
      const current = triggerStore.get(trigger.id)
      if (!current || !current.enabled) {
        logger.info(`[TriggerService] 触发器 "${trigger.name}" 已被禁用或删除，取消重试`)
        return
      }
      logger.info(
        `[TriggerService] 触发器 "${trigger.name}" 开始第 ${nextRetry}/${maxRetries} 次重试`
      )
      void this.runTrigger(current)
    }, retryDelay)

    this.retryTimers.set(trigger.id, retryTimer)
  }

  /** 清除触发器的超时定时器 */
  private clearTimeoutTimer(triggerId: string): void {
    const timer = this.timeoutTimers.get(triggerId)
    if (timer) {
      clearTimeout(timer)
      this.timeoutTimers.delete(triggerId)
    }
  }

  private broadcastLog(log: TriggerRunLog): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.mainWindow.webContents.send(IPC_CHANNELS.TRIGGER_RUN_LOG, log)
  }

  private broadcastChange(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.mainWindow.webContents.send(IPC_CHANNELS.TRIGGER_CHANGED, { updated: true })
  }

  private matchPattern(filename: string, pattern: string): boolean {
    // 简单 glob 匹配
    const regex = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
    return new RegExp(`^${regex}$`, 'i').test(filename)
  }

  testTrigger(id: string): { ok: boolean; error?: string } {
    const trigger = triggerStore.get(id)
    if (!trigger) return { ok: false, error: '触发器不存在' }
    // 测试时直接触发（绕过防抖立即执行）
    void this.runTrigger(trigger)
    return { ok: true }
  }
}

export const triggerService = new TriggerService()
