import { ipcMain, BrowserWindow, dialog } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import { skillsStore } from '../store/skills'
import { logger } from '../utils/logger'
import type { Skill, SkillSource } from '@shared/types'

function notifySkillsChanged(mainWindow: BrowserWindow): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.SKILL_CHANGED, { updated: true })
  }
}

export function registerSkillsIpc(mainWindow: BrowserWindow): void {
  // 获取所有技能
  ipcMain.handle(IPC_CHANNELS.SKILL_LIST, (): Skill[] => {
    return skillsStore.listAll()
  })

  // 按 ID 获取
  ipcMain.handle(IPC_CHANNELS.SKILL_GET, (_e, id: string): Skill | undefined => {
    return skillsStore.get(id)
  })

  // 手动添加技能
  ipcMain.handle(
    IPC_CHANNELS.SKILL_ADD,
    (
      _e,
      item: {
        name: string
        description: string
        content: string
        tags?: string[]
        triggers?: string[]
      }
    ): Skill | { error: string } => {
      if (skillsStore.nameExists(item.name)) {
        return { error: `技能名称 "${item.name}" 已存在` }
      }
      const created = skillsStore.add({
        name: item.name,
        description: item.description || '',
        content: item.content,
        source: 'manual',
        fileType: 'markdown',
        tags: item.tags ?? [],
        triggers: item.triggers ?? [],
        enabled: true
      })
      notifySkillsChanged(mainWindow)
      return created
    }
  )

  // 更新技能
  ipcMain.handle(
    IPC_CHANNELS.SKILL_UPDATE,
    (_e, id: string, patch: Partial<Omit<Skill, 'id' | 'createdAt'>>): Skill | null => {
      // 检查名称冲突
      if (patch.name && skillsStore.nameExists(patch.name, id)) {
        return null
      }
      const updated = skillsStore.update(id, patch)
      if (updated) notifySkillsChanged(mainWindow)
      return updated
    }
  )

  // 删除技能
  ipcMain.handle(IPC_CHANNELS.SKILL_DELETE, (_e, id: string): boolean => {
    const ok = skillsStore.delete(id)
    if (ok) notifySkillsChanged(mainWindow)
    return ok
  })

  // 清空所有技能
  ipcMain.handle(IPC_CHANNELS.SKILL_CLEAR, (): void => {
    skillsStore.clear()
    notifySkillsChanged(mainWindow)
  })

  // 搜索技能
  ipcMain.handle(
    IPC_CHANNELS.SKILL_SEARCH,
    (_e, query: { keyword?: string; source?: SkillSource; tag?: string }): Skill[] => {
      return skillsStore.search(query)
    }
  )

  // 统计信息
  ipcMain.handle(IPC_CHANNELS.SKILL_STATS, () => {
    return skillsStore.stats()
  })

  // 启用/禁用技能
  ipcMain.handle(
    IPC_CHANNELS.SKILL_TOGGLE,
    (_e, id: string, enabled?: boolean): Skill | null => {
      const updated = skillsStore.toggle(id, enabled)
      if (updated) notifySkillsChanged(mainWindow)
      return updated
    }
  )

  // 上传技能文件（打开文件选择对话框）
  ipcMain.handle(
    IPC_CHANNELS.SKILL_UPLOAD,
    async (
      _e,
      options?: { name?: string; description?: string; tags?: string[] }
    ): Promise<Skill | { error: string } | null> => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: '选择技能文件',
        filters: [
          { name: '技能文件', extensions: ['md', 'markdown', 'txt', 'json', 'zip'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        properties: ['openFile']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      try {
        const skill = await skillsStore.uploadFromFile(result.filePaths[0], options)
        notifySkillsChanged(mainWindow)
        return skill
      } catch (err) {
        logger.error('[Skills IPC] 上传文件失败:', err)
        return { error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // 导出所有技能
  ipcMain.handle(IPC_CHANNELS.SKILL_EXPORT, () => {
    return skillsStore.exportAll()
  })

  // 导入技能
  ipcMain.handle(
    IPC_CHANNELS.SKILL_IMPORT,
    (_e, data: { skills: Skill[] }, merge = true): { added: number; skipped: number } => {
      const result = skillsStore.importAll(data, merge)
      notifySkillsChanged(mainWindow)
      return result
    }
  )
}
