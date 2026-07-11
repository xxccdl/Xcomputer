import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import { mcpClient, type McpStatus } from '../mcp/mcp-client'

let registered = false

/** 注册 MCP 状态 IPC：查询 + 状态变更广播 */
export function registerMcpStatusIpc(mainWindow: BrowserWindow): void {
  if (registered) return
  registered = true

  // 渲染进程查询当前状态
  ipcMain.handle(IPC_CHANNELS.MCP_STATUS, (): { status: McpStatus } => {
    return { status: mcpClient.getStatus() }
  })

  // MCP 状态变更时广播到渲染进程
  mcpClient.onStatusChange((status) => {
    mainWindow.webContents.send(IPC_CHANNELS.MCP_STATUS, { status })
  })
}
