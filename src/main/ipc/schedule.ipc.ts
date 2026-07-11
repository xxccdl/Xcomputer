import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import { scheduleStore } from '../store/schedule'
import { scheduleService } from '../utils/schedule-service'
import { logger } from '../utils/logger'
import type { ScheduledTask } from '@shared/types'

let registered = false

export function registerScheduleIpc(mainWindow: BrowserWindow): void {
  if (registered) return
  registered = true

  scheduleService.setMainWindow(mainWindow)

  // 列出所有定时任务
  ipcMain.handle(IPC_CHANNELS.SCHEDULE_LIST, () => {
    return scheduleStore.list()
  })

  // 创建定时任务
  ipcMain.handle(
    IPC_CHANNELS.SCHEDULE_CREATE,
    (_e, task: Omit<ScheduledTask, 'id' | 'createdAt' | 'runCount'>) => {
      const created = scheduleStore.create(task)
      scheduleService.onTasksChanged()
      return created
    }
  )

  // 更新定时任务
  ipcMain.handle(
    IPC_CHANNELS.SCHEDULE_UPDATE,
    (_e, id: string, patch: Partial<ScheduledTask>) => {
      const updated = scheduleStore.update(id, patch)
      scheduleService.onTasksChanged()
      return updated
    }
  )

  // 删除定时任务
  ipcMain.handle(IPC_CHANNELS.SCHEDULE_DELETE, (_e, id: string) => {
    scheduleStore.delete(id)
    scheduleService.onTasksChanged()
    logger.info(`[Schedule IPC] deleted ${id}`)
  })

  // 启用/禁用
  ipcMain.handle(IPC_CHANNELS.SCHEDULE_TOGGLE, (_e, id: string, enabled: boolean) => {
    const updated = scheduleStore.toggle(id, enabled)
    scheduleService.onTasksChanged()
    return updated
  })

  // 立即执行
  ipcMain.handle(IPC_CHANNELS.SCHEDULE_RUN_NOW, async (_e, id: string) => {
    const task = scheduleStore.get(id)
    if (!task) {
      logger.warn(`[Schedule IPC] runNow: task ${id} not found`)
      return { ok: false, error: '任务不存在' }
    }
    void scheduleService.runTask(task)
    return { ok: true }
  })

  // 获取执行日志
  ipcMain.handle(IPC_CHANNELS.SCHEDULE_GET_LOGS, (_e, limit = 50) => {
    return scheduleStore.listLogs(limit)
  })
}
