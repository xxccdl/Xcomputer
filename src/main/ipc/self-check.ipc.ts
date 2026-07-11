import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import { selfCheckRunner } from '../self-check/self-check-runner'
import { getSelfCheckWindow } from '../windows/self-check-window'

/**
 * 注册系统自检相关 IPC handler。
 *
 * - SELF_CHECK_RUN: 手动触发自检（设置面板"立即自检"按钮）
 * - SELF_CHECK_CLOSE: 隐藏自检弹窗
 */
export function registerSelfCheckIpc(_mainWindow: BrowserWindow): void {
  // 手动触发自检
  ipcMain.handle(IPC_CHANNELS.SELF_CHECK_RUN, async (): Promise<{ ok: boolean }> => {
    void selfCheckRunner.run({ coldStart: true })
    return { ok: true }
  })

  // 隐藏弹窗
  ipcMain.on(IPC_CHANNELS.SELF_CHECK_CLOSE, () => {
    const win = getSelfCheckWindow()
    if (win && !win.isDestroyed()) win.hide()
  })
}
