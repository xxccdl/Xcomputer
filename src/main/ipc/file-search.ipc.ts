import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import { fileSearchEngine } from '../utils/file-search'
import type { FileSearchResult, FileIndexStatus } from '@shared/types'

/**
 * 注册文件搜索相关 IPC 处理器
 * 通道：FILE_SEARCH_QUERY / FILE_SEARCH_REBUILD / FILE_SEARCH_STOP / FILE_SEARCH_STATUS
 */
export function registerFileSearchIpc(): void {
  // 搜索文件
  ipcMain.handle(
    IPC_CHANNELS.FILE_SEARCH_QUERY,
    (
      _e,
      keyword: string,
      options?: { maxResults?: number; extFilter?: string }
    ): FileSearchResult[] => {
      return fileSearchEngine.search(keyword, options)
    }
  )

  // 重建索引
  ipcMain.handle(
    IPC_CHANNELS.FILE_SEARCH_REBUILD,
    async (_e, paths?: string[]): Promise<void> => {
      await fileSearchEngine.rebuild(paths)
    }
  )

  // 停止索引构建
  ipcMain.handle(IPC_CHANNELS.FILE_SEARCH_STOP, (): void => {
    fileSearchEngine.stop()
  })

  // 获取索引状态
  ipcMain.handle(
    IPC_CHANNELS.FILE_SEARCH_STATUS,
    (): FileIndexStatus => {
      return fileSearchEngine.getStatus()
    }
  )
}
