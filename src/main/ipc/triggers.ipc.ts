import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import { triggerStore } from '../store/triggers'
import { triggerService } from '../utils/trigger-service'
import type { AutomationTrigger, TriggerType } from '@shared/types'

let registered = false

export function registerTriggerIpc(mainWindow: BrowserWindow): void {
  if (registered) return
  registered = true

  const notifyChanged = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send(IPC_CHANNELS.TRIGGER_CHANGED, { updated: true })
  }

  // 列出所有触发器
  ipcMain.handle(IPC_CHANNELS.TRIGGER_LIST, () => {
    return triggerStore.list()
  })

  // 获取单个触发器
  ipcMain.handle(IPC_CHANNELS.TRIGGER_GET, (_e, id: string) => {
    return triggerStore.get(id)
  })

  // 创建触发器
  ipcMain.handle(
    IPC_CHANNELS.TRIGGER_ADD,
    (
      _e,
      item: {
        name: string
        type: TriggerType
        config: AutomationTrigger['config']
        prompt: string
        maxRetries?: number
        retryDelay?: number
        timeoutMs?: number
        notify?: boolean
      }
    ) => {
      const trigger = triggerStore.create(item)
      triggerService.startWatching(trigger)
      notifyChanged()
      return trigger
    }
  )

  // 更新触发器
  ipcMain.handle(
    IPC_CHANNELS.TRIGGER_UPDATE,
    (_e, id: string, patch: Partial<Omit<AutomationTrigger, 'id' | 'createdAt'>>) => {
      const updated = triggerStore.update(id, patch)
      if (updated) {
        triggerService.stopWatching(id)
        triggerService.startWatching(updated)
        notifyChanged()
      }
      return updated
    }
  )

  // 删除触发器
  ipcMain.handle(IPC_CHANNELS.TRIGGER_DELETE, (_e, id: string) => {
    triggerService.stopWatching(id)
    const deleted = triggerStore.delete(id)
    notifyChanged()
    return deleted
  })

  // 启用/禁用触发器
  ipcMain.handle(IPC_CHANNELS.TRIGGER_TOGGLE, (_e, id: string, enabled: boolean) => {
    const updated = triggerStore.setEnabled(id, enabled)
    if (updated) {
      if (enabled) {
        triggerService.startWatching(updated)
      } else {
        triggerService.stopWatching(id)
      }
      notifyChanged()
    }
    return updated
  })

  // 测试触发器
  ipcMain.handle(IPC_CHANNELS.TRIGGER_TEST, (_e, id: string) => {
    return triggerService.testTrigger(id)
  })

  // 获取执行日志
  ipcMain.handle(IPC_CHANNELS.TRIGGER_GET_LOGS, (_e, limit = 50) => {
    return triggerStore.listLogs(limit)
  })
}
