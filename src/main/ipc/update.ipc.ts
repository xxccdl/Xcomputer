import { BrowserWindow, ipcMain, app } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import type { UpdateCheckResult, UpdateInfo, UpdateStatus } from '@shared/update-types'
import { updateChecker } from '../utils/update-checker'
import { logger } from '../utils/logger'

/** 推送更新状态到渲染进程 */
function pushStatus(mainWindow: BrowserWindow, status: UpdateStatus): void {
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.UPDATE_STATUS, status)
  }
}

export function registerUpdateIpc(mainWindow: BrowserWindow): void {
  // 检查更新
  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async (): Promise<UpdateCheckResult> => {
    pushStatus(mainWindow, { type: 'checking' })
    const result = await updateChecker.checkForUpdates()
    if (result.error) {
      pushStatus(mainWindow, { type: 'error', message: result.error })
    } else if (result.hasUpdate && result.updateInfo) {
      pushStatus(mainWindow, { type: 'available', updateInfo: result.updateInfo })
    } else {
      pushStatus(mainWindow, { type: 'idle', message: '已是最新版本' })
    }
    return result
  })

  // 下载更新
  ipcMain.handle(
    IPC_CHANNELS.UPDATE_DOWNLOAD,
    async (_e, updateInfo: UpdateInfo): Promise<{ success: boolean; filePath?: string; error?: string }> => {
      try {
        // 用于计算下载速度
        let lastBytes = 0
        let lastTime = Date.now()
        const filePath = await updateChecker.downloadUpdate(updateInfo, (progress, downloaded, total) => {
          const MB = 1024 * 1024
          // 计算瞬时速度
          const now = Date.now()
          const elapsed = (now - lastTime) / 1000
          const speed = elapsed > 0 ? (downloaded - lastBytes) / elapsed : 0
          lastBytes = downloaded
          lastTime = now
          pushStatus(mainWindow, {
            type: 'downloading',
            progress,
            message: `${(downloaded / MB).toFixed(2)} / ${(total / MB).toFixed(2)} MB`,
            downloadedBytes: downloaded,
            totalBytes: total,
            downloadSpeed: speed,
            updateInfo
          })
        })
        pushStatus(mainWindow, { type: 'downloaded', downloadedPath: filePath, updateInfo })
        return { success: true, filePath }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.error('[UpdateIpc] 下载更新失败:', msg)
        pushStatus(mainWindow, { type: 'error', message: msg })
        return { success: false, error: msg }
      }
    }
  )

  // 安装更新
  ipcMain.handle(
    IPC_CHANNELS.UPDATE_INSTALL,
    async (_e, filePath: string): Promise<{ success: boolean; error?: string }> => {
      try {
        await updateChecker.installUpdate(filePath)
        return { success: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.error('[UpdateIpc] 启动安装失败:', msg)
        pushStatus(mainWindow, { type: 'error', message: msg })
        return { success: false, error: msg }
      }
    }
  )

  // 获取当前应用版本号（轻量级，不触发检查更新）
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, (): string => {
    return app.getVersion()
  })
}
