import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import { shortcutStore } from '../store/shortcuts'
import type { QuickCommand } from '@shared/types'

export function registerShortcutIpc(mainWindow: BrowserWindow): void {
  const notifyChanged = (): void => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.SHORTCUT_CHANGED, { updated: true })
    }
  }

  ipcMain.handle(IPC_CHANNELS.SHORTCUT_LIST, (): QuickCommand[] => {
    return shortcutStore.list()
  })

  ipcMain.handle(
    IPC_CHANNELS.SHORTCUT_GET,
    (_e, id: string): QuickCommand | undefined => {
      return shortcutStore.get(id)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SHORTCUT_ADD,
    (
      _e,
      item: {
        keyword: string
        name: string
        description: string
        prompt: string
        steps?: string[]
        category: string
      }
    ): QuickCommand => {
      const shortcut = shortcutStore.create(item)
      notifyChanged()
      return shortcut
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SHORTCUT_UPDATE,
    (
      _e,
      id: string,
      patch: Partial<Omit<QuickCommand, 'id' | 'createdAt'>>
    ): QuickCommand | null => {
      const updated = shortcutStore.update(id, patch)
      notifyChanged()
      return updated
    }
  )

  ipcMain.handle(IPC_CHANNELS.SHORTCUT_DELETE, (_e, id: string): boolean => {
    const deleted = shortcutStore.delete(id)
    notifyChanged()
    return deleted
  })

  ipcMain.handle(
    IPC_CHANNELS.SHORTCUT_TOGGLE,
    (_e, id: string, enabled: boolean): QuickCommand | null => {
      const updated = shortcutStore.setEnabled(id, enabled)
      notifyChanged()
      return updated
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SHORTCUT_EXPAND,
    (_e, keyword: string): QuickCommand | null => {
      return shortcutStore.expand(keyword)
    }
  )
}
