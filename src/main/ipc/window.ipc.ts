import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import { exitMainMiniMode } from '../windows/main-window-mini'

export function registerWindowIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    mainWindow.minimize()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, () => {
    mainWindow.close()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, () => {
    return mainWindow.isMaximized()
  })

  // 用户点击主窗口 mini 药丸 → 展开恢复全尺寸
  ipcMain.on(IPC_CHANNELS.MAIN_EXPAND, () => {
    exitMainMiniMode()
  })

  // 窗口最大化/还原状态变化时通知渲染进程
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED, true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED, false)
  })
}
