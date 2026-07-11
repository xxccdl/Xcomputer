import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import { templatesStore } from '../store/templates'
import { logger } from '../utils/logger'
import type { TaskTemplate } from '@shared/types'

/** 通知前端模板数据已变更 */
function notifyTemplatesChanged(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.TEMPLATE_CHANGED, { updated: true })
  }
}

export function registerTemplateIpc(): void {
  // 获取所有模板
  ipcMain.handle(IPC_CHANNELS.TEMPLATE_LIST, (): TaskTemplate[] => {
    return templatesStore.list()
  })

  // 按 ID 获取
  ipcMain.handle(
    IPC_CHANNELS.TEMPLATE_GET,
    (_e, id: string): TaskTemplate | undefined => {
      return templatesStore.get(id)
    }
  )

  // 添加模板
  ipcMain.handle(
    IPC_CHANNELS.TEMPLATE_ADD,
    (
      _e,
      item: {
        name: string
        description: string
        prompt: string
        category: string
      }
    ): TaskTemplate => {
      const created = templatesStore.add(
        item.name,
        item.description || '',
        item.prompt || '',
        item.category || ''
      )
      notifyTemplatesChanged()
      return created
    }
  )

  // 更新模板
  ipcMain.handle(
    IPC_CHANNELS.TEMPLATE_UPDATE,
    (
      _e,
      id: string,
      patch: Partial<Omit<TaskTemplate, 'id' | 'createdAt'>>
    ): TaskTemplate | null => {
      const updated = templatesStore.update(id, patch)
      if (updated) notifyTemplatesChanged()
      return updated
    }
  )

  // 删除模板
  ipcMain.handle(IPC_CHANNELS.TEMPLATE_DELETE, (_e, id: string): boolean => {
    const ok = templatesStore.delete(id)
    if (ok) notifyTemplatesChanged()
    return ok
  })

  logger.info('[Templates IPC] 模板 IPC 已注册')
}
