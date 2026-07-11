import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import { settingsStore } from '../store/settings'
import { isVenvHealthy, rebuildVenv } from '../mcp/mcp-config'
import { logger } from '../utils/logger'
import { selfCheckRunner } from '../self-check/self-check-runner'
import type { Settings } from '@shared/types'

/** 初始化引导场景 */
export type InitScenario = 'first-install' | 'venv-broken' | 'none'

/** 初始化检查结果 */
export interface InitCheckResult {
  scenario: InitScenario
  /** 是否需要显示初始化引导 */
  needInit: boolean
  /** 原因说明 */
  reason: string
  /** 当前设置（首次安装时用于预填充） */
  settings: Settings
}

/** 重建 venv 结果 */
export interface RebuildResult {
  success: boolean
  error?: string
}

/**
 * 检查初始化引导场景。
 * - first-install: settings.initialized 为 false，需要完整引导（配置模型 + 初始化环境）
 * - venv-broken: settings.initialized 为 true 但 .venv 不健康，只需要修复环境
 * - none: 不需要引导
 */
function checkInitScenario(): InitCheckResult {
  const settings = settingsStore.get()
  if (!settings.initialized) {
    return {
      scenario: 'first-install',
      needInit: true,
      reason: '首次安装，需要完成初始化引导',
      settings
    }
  }
  if (!isVenvHealthy()) {
    return {
      scenario: 'venv-broken',
      needInit: true,
      reason: 'MCP 虚拟环境缺失或损坏，需要重建',
      settings
    }
  }
  return {
    scenario: 'none',
    needInit: false,
    reason: '',
    settings
  }
}

/**
 * 注册首次使用初始化引导相关的 IPC handler。
 *
 * - INIT_CHECK: 渲染进程启动时调用，检查是否需要初始化
 * - INIT_REBUILD_VENV: 触发 .venv 重建（带进度推送）
 * - INIT_SAVE_SETTINGS: 在向导中保存模型等设置
 * - INIT_COMPLETE: 标记初始化完成（写入 settings.initialized = true）
 */
export function registerInitIpc(mainWindow: BrowserWindow): void {
  // 1. 检查初始化场景
  ipcMain.handle(IPC_CHANNELS.INIT_CHECK, (): InitCheckResult => {
    const result = checkInitScenario()
    logger.info(
      `[Init] 检查初始化状态: scenario=${result.scenario}, needInit=${result.needInit}`
    )
    return result
  })

  // 2. 重建 .venv（首次使用或环境损坏时）
  ipcMain.handle(IPC_CHANNELS.INIT_REBUILD_VENV, (): RebuildResult => {
    logger.info('[Init] 开始重建 .venv')
    const success = rebuildVenv((message) => {
      // 推送进度到渲染进程
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.INIT_PROGRESS, { message })
      }
    })
    if (success) {
      logger.info('[Init] .venv 重建成功')
      return { success: true }
    }
    logger.error('[Init] .venv 重建失败')
    return { success: false, error: '重建虚拟环境失败，请查看日志获取详情' }
  })

  // 3. 在向导中保存设置（模型配置等）
  ipcMain.handle(
    IPC_CHANNELS.INIT_SAVE_SETTINGS,
    (_event, partial: Partial<Settings>): { success: boolean; settings: Settings } => {
      const next = settingsStore.update(partial)
      logger.info('[Init] 向导中已保存设置', Object.keys(partial))
      return { success: true, settings: next }
    }
  )

  // 4. 标记初始化完成
  ipcMain.handle(IPC_CHANNELS.INIT_COMPLETE, (): { success: boolean } => {
    settingsStore.update({ initialized: true })
    logger.info('[Init] 已标记初始化完成')
    // 向导完成后异步触发自检（首次安装场景补检）
    void selfCheckRunner.run({ coldStart: true })
    return { success: true }
  })

  // 5. 重置初始化状态（用于手动重新打开向导）
  ipcMain.handle(IPC_CHANNELS.INIT_RESET, (): { success: boolean } => {
    settingsStore.update({ initialized: false })
    logger.info('[Init] 已重置初始化状态')
    return { success: true }
  })

  // 6. 通知渲染进程显示初始化向导
  ipcMain.handle(IPC_CHANNELS.INIT_SHOW_GUIDE, (): { success: boolean } => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.INIT_SHOW_GUIDE)
    }
    return { success: true }
  })
}
