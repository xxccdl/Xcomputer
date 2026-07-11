import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import { memoryStore } from '../store/memory'
import { logger } from '../utils/logger'
import type {
  MemoryItem,
  MemoryType,
  MemorySource,
  SemanticSearchResult,
  MemoryGraphData,
  VectorIndexStatus
} from '@shared/types'

/** 通知所有渲染进程记忆已更新 */
function notifyMemoryChanged(mainWindow: BrowserWindow): void {
  try {
    mainWindow.webContents.send(IPC_CHANNELS.MEMORY_CHANGED, { updated: true })
  } catch (err) {
    logger.error('[Memory IPC] 通知前端失败:', err)
  }
}

export function registerMemoryIpc(mainWindow: BrowserWindow): void {
  // 获取所有记忆
  ipcMain.handle(IPC_CHANNELS.MEMORY_LIST, (): MemoryItem[] => {
    return memoryStore.list()
  })

  // 获取归档记忆
  ipcMain.handle(IPC_CHANNELS.MEMORY_LIST_ARCHIVED, (): MemoryItem[] => {
    return memoryStore.listArchived()
  })

  // 按 ID 获取
  ipcMain.handle(IPC_CHANNELS.MEMORY_GET, (_e, id: string): MemoryItem | undefined => {
    return memoryStore.get(id)
  })

  // 手动添加记忆
  ipcMain.handle(
    IPC_CHANNELS.MEMORY_ADD,
    (
      _e,
      item: {
        type: MemoryType
        category: string
        content: string
        confidence?: number
        tags?: string[]
      }
    ): MemoryItem => {
      const created = memoryStore.add({
        type: item.type,
        category: item.category || 'general',
        content: item.content,
        confidence: item.confidence ?? 0.8,
        source: 'manual',
        tags: item.tags ?? []
      })
      notifyMemoryChanged(mainWindow)
      return created
    }
  )

  // 更新记忆（支持完整字段编辑）
  ipcMain.handle(
    IPC_CHANNELS.MEMORY_UPDATE,
    (_e, id: string, patch: Partial<Omit<MemoryItem, 'id' | 'createdAt'>>): MemoryItem | null => {
      const updated = memoryStore.update(id, patch)
      notifyMemoryChanged(mainWindow)
      return updated
    }
  )

  // 删除记忆
  ipcMain.handle(IPC_CHANNELS.MEMORY_DELETE, (_e, id: string): boolean => {
    const ok = memoryStore.delete(id)
    if (ok) notifyMemoryChanged(mainWindow)
    return ok
  })

  // 清空所有记忆
  ipcMain.handle(IPC_CHANNELS.MEMORY_CLEAR, (): void => {
    memoryStore.clear()
    notifyMemoryChanged(mainWindow)
  })

  // 搜索记忆
  ipcMain.handle(
    IPC_CHANNELS.MEMORY_SEARCH,
    (
      _e,
      query: { keyword?: string; type?: MemoryType; source?: MemorySource; tag?: string }
    ): MemoryItem[] => {
      return memoryStore.search(query)
    }
  )

  // 统计信息
  ipcMain.handle(IPC_CHANNELS.MEMORY_STATS, () => {
    return memoryStore.stats()
  })

  // 恢复归档记忆
  ipcMain.handle(IPC_CHANNELS.MEMORY_RESTORE, (_e, id: string): boolean => {
    const ok = memoryStore.restore(id)
    if (ok) notifyMemoryChanged(mainWindow)
    return ok
  })

  // 导出所有记忆
  ipcMain.handle(IPC_CHANNELS.MEMORY_EXPORT, () => {
    return memoryStore.exportAll()
  })

  // 导入记忆
  ipcMain.handle(
    IPC_CHANNELS.MEMORY_IMPORT,
    (_e, data: { memories: MemoryItem[] }, merge = true): { added: number; skipped: number } => {
      const result = memoryStore.importAll(data, merge)
      notifyMemoryChanged(mainWindow)
      return result
    }
  )

  // 手动触发清理过时记忆
  ipcMain.handle(IPC_CHANNELS.MEMORY_CLEANUP, (): { archived: number } => {
    const result = memoryStore.cleanupStaleMemories()
    if (result.archived > 0) notifyMemoryChanged(mainWindow)
    return result
  })

  // 语义搜索（向量 + 图谱 + 关键词）
  ipcMain.handle(
    IPC_CHANNELS.MEMORY_SEMANTIC_SEARCH,
    async (_e, query: string, limit?: number): Promise<SemanticSearchResult[]> => {
      return memoryStore.semanticSearch(query, limit)
    }
  )

  // 知识图谱可视化数据
  ipcMain.handle(IPC_CHANNELS.MEMORY_GRAPH, (): MemoryGraphData => {
    return memoryStore.getGraphData()
  })

  // 向量索引状态
  ipcMain.handle(IPC_CHANNELS.MEMORY_VECTOR_STATUS, (): VectorIndexStatus => {
    return memoryStore.getVectorStatus()
  })

  // 重建索引（手动触发 KV + 图谱 + 向量 backfill）
  ipcMain.handle(
    IPC_CHANNELS.MEMORY_REBUILD_INDEX,
    async (): Promise<{ success: boolean }> => {
      try {
        await memoryStore.rebuildAllIndexes()
        return { success: true }
      } catch (err) {
        logger.error('[Memory IPC] 重建索引失败:', err)
        return { success: false }
      }
    }
  )
}
