import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS, SKILL_HUB_BASE_URL } from '@shared/constants'
import { remoteControl } from '../remote/remote-client'
import type { RemoteControlState } from '../remote/remote-client'
import { logger } from '../utils/logger'

/** 将 Error / AggregateError 格式化为可读字符串 */
function formatError(err: unknown): string {
  if (!err) return '未知错误'
  // AggregateError（Node.js 18+ 多 IP 连接失败时抛出）
  const agg = err as { errors?: unknown[] }
  if (Array.isArray(agg.errors) && agg.errors.length > 0) {
    const details = agg.errors
      .map((e) => (e instanceof Error ? e.message : String(e)))
      .join('; ')
    return `无法连接到中继服务器 ${SKILL_HUB_BASE_URL}（${details}）。请确认服务器正在运行且 3210 端口可达。`
  }
  if (err instanceof Error) return err.message
  return String(err)
}

export function registerRemoteIpc(mainWindow: BrowserWindow): void {
  remoteControl.setMainWindow(mainWindow)

  // 启动远程控制服务
  ipcMain.handle(IPC_CHANNELS.REMOTE_START, async (): Promise<RemoteControlState> => {
    try {
      return await remoteControl.start()
    } catch (err) {
      logger.error('[Remote IPC] 启动远程控制失败:', err)
      throw new Error(`启动远程控制失败: ${formatError(err)}`)
    }
  })

  // 停止远程控制服务
  ipcMain.handle(IPC_CHANNELS.REMOTE_STOP, (): RemoteControlState => {
    remoteControl.stop()
    return remoteControl.getState()
  })

  // 获取当前状态
  ipcMain.handle(IPC_CHANNELS.REMOTE_STATE, (): RemoteControlState => {
    return remoteControl.getState()
  })
}
