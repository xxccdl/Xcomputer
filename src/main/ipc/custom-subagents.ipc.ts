import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import { customSubagentsStore } from '../store/custom-subagents'
import { aiService } from '../ai/ai-service'
import { logger } from '../utils/logger'
import type { CustomSubagent } from '@shared/types'

function notifyChanged(mainWindow: BrowserWindow): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.CUSTOM_SUBAGENT_CHANGED, { updated: true })
  }
}

export function registerCustomSubagentsIpc(mainWindow: BrowserWindow): void {
  // 获取所有自定义子智能体
  ipcMain.handle(IPC_CHANNELS.CUSTOM_SUBAGENT_LIST, (): CustomSubagent[] => {
    return customSubagentsStore.list()
  })

  // 按 ID 获取
  ipcMain.handle(
    IPC_CHANNELS.CUSTOM_SUBAGENT_GET,
    (_e, id: string): CustomSubagent | undefined => {
      return customSubagentsStore.get(id)
    }
  )

  // 新增模板
  ipcMain.handle(
    IPC_CHANNELS.CUSTOM_SUBAGENT_ADD,
    (_e, item: Omit<CustomSubagent, 'id' | 'createdAt' | 'updatedAt' | 'lastUsedAt' | 'useCount'>):
      CustomSubagent | { error: string } => {
      if (customSubagentsStore.nameExists(item.name)) {
        return { error: `子智能体名称 "${item.name}" 已存在` }
      }
      try {
        const created = customSubagentsStore.add(item)
        notifyChanged(mainWindow)
        return created
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.error('[CustomSubagents IPC] 新增失败:', msg)
        return { error: msg }
      }
    }
  )

  // 更新模板
  ipcMain.handle(
    IPC_CHANNELS.CUSTOM_SUBAGENT_UPDATE,
    (_e, id: string, patch: Partial<Omit<CustomSubagent, 'id' | 'createdAt'>>): CustomSubagent | null => {
      // 检查名称冲突
      if (patch.name && customSubagentsStore.nameExists(patch.name, id)) {
        return null
      }
      const updated = customSubagentsStore.update(id, patch)
      if (updated) notifyChanged(mainWindow)
      return updated
    }
  )

  // 删除模板
  ipcMain.handle(IPC_CHANNELS.CUSTOM_SUBAGENT_DELETE, (_e, id: string): boolean => {
    const ok = customSubagentsStore.delete(id)
    if (ok) notifyChanged(mainWindow)
    return ok
  })

  // 启用/禁用模板
  ipcMain.handle(
    IPC_CHANNELS.CUSTOM_SUBAGENT_TOGGLE,
    (_e, id: string, enabled?: boolean): CustomSubagent | null => {
      const updated = customSubagentsStore.toggle(id, enabled)
      if (updated) notifyChanged(mainWindow)
      return updated
    }
  )

  // AI 辅助生成配置（不自动保存，交前端审核）
  ipcMain.handle(
    IPC_CHANNELS.CUSTOM_SUBAGENT_GENERATE,
    async (_e, description: string): Promise<unknown> => {
      if (!description || !description.trim()) {
        return { error: '请描述你想要的子智能体' }
      }
      const result = await aiService.generateCustomSubagentConfig(description.trim())
      return result
    }
  )
}
