// 本地模型（实验性）IPC handler
// 注册状态查询、基座模型下载、加载、推理测试、卸载等 IPC 通道
// 状态变更通过 LOCAL_MODEL_STATUS 通道主动推送给渲染进程

import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import { localModelManager } from '../local-model/local-model-manager'
import { logger } from '../utils/logger'

export function registerLocalModelIpc(mainWindow: BrowserWindow): void {
  // 订阅管理器状态变更 → 推送给渲染进程
  localModelManager.onStatus((status) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.LOCAL_MODEL_STATUS, status)
    }
  })

  // 查询当前状态
  ipcMain.handle(IPC_CHANNELS.LOCAL_MODEL_GET_STATUS, async () => {
    return localModelManager.getStatus()
  })

  // 触发基座模型下载（长任务，进度通过 LOCAL_MODEL_STATUS 推送）
  ipcMain.handle(IPC_CHANNELS.LOCAL_MODEL_DOWNLOAD, async () => {
    try {
      await localModelManager.downloadBaseModel()
      return { success: true, status: localModelManager.getStatus() }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[local-model.ipc] 下载失败', err)
      return { success: false, error: msg, status: localModelManager.getStatus() }
    }
  })

  // 取消下载
  ipcMain.handle(IPC_CHANNELS.LOCAL_MODEL_CANCEL_DOWNLOAD, async () => {
    localModelManager.cancelDownload()
    return { success: true }
  })

  // 加载模型到内存（就绪推理）
  ipcMain.handle(IPC_CHANNELS.LOCAL_MODEL_LOAD, async () => {
    try {
      await localModelManager.ensureReady()
      return { success: true, status: localModelManager.getStatus() }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg, status: localModelManager.getStatus() }
    }
  })

  // 推理健康检查
  ipcMain.handle(IPC_CHANNELS.LOCAL_MODEL_TEST, async () => {
    return await localModelManager.test()
  })

  // 卸载模型，释放显存/内存
  ipcMain.handle(IPC_CHANNELS.LOCAL_MODEL_DISPOSE, async () => {
    try {
      await localModelManager.dispose()
      return { success: true, status: localModelManager.getStatus() }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg, status: localModelManager.getStatus() }
    }
  })

  logger.info('[local-model.ipc] 已注册本地模型 IPC handlers')
}
