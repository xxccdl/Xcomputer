import { ipcMain, BrowserWindow, app } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import { settingsStore } from '../store/settings'
import { mcpClient } from '../mcp/mcp-client'
import { aiService } from '../ai/ai-service'
import { logger } from '../utils/logger'
import type { ConnectionTestResult, Settings } from '@shared/types'

export function registerSettingsIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (): Settings => {
    return settingsStore.get()
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, (_e, partial: Partial<Settings>): Settings => {
    const next = settingsStore.update(partial)
    // 如果 autoStart 发生变化，实时切换系统登录项
    if (partial.autoStart !== undefined) {
      app.setLoginItemSettings({
        openAtLogin: partial.autoStart,
        args: ['--hidden']
      })
      logger.info(`[Settings] 开机自启已${partial.autoStart ? '开启' : '关闭'}`)
    }
    // 通知所有窗口设置已变更
    mainWindow.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, next)
    return next
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_TEST_AI, async (): Promise<ConnectionTestResult> => {
    return aiService.testConnection()
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_TEST_MCP, async (): Promise<ConnectionTestResult> => {
    // 重启 MCP 以应用新配置
    await mcpClient.stop()
    return mcpClient.testConnection()
  })
}
