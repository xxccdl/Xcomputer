import { app, BrowserWindow, globalShortcut } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createMainWindow } from './window'
import { registerIpcHandlers } from './ipc'
import { logger } from './utils/logger'
import { settingsStore } from './store/settings'
import { sessionsStore } from './store/sessions'
import { scheduleStore } from './store/schedule'
import { scheduleService } from './utils/schedule-service'
import { mcpClient } from './mcp/mcp-client'
import { terminalManager } from './tools/terminal-manager'
import { createFloatingBallWindow, destroyFloatingBallWindow } from './windows/floating-ball-window'
import { floatingBallState } from './utils/floating-ball-state'
import { createWidgetWindow, destroyWidgetWindow, toggleWidget, getWidgetWindow } from './windows/widget-window'
import { resetWidgetChat } from './ipc/widget.ipc'
import { createTray, handleMainWindowClose, destroyTray, refreshTrayMenu } from './tray'
import { memoryStore } from './store/memory'
import { remoteControl } from './remote/remote-client'
import { skillsStore } from './store/skills'
import { triggerStore } from './store/triggers'
import { triggerService } from './utils/trigger-service'
import { shortcutStore } from './store/shortcuts'
import { getOrchestrator } from './orchestrator/task-orchestrator'
import { fileSearchEngine } from './utils/file-search'
import { snippetStore } from './store/snippets'
import { customSubagentsStore } from './store/custom-subagents'
import { IPC_CHANNELS } from '@shared/constants'
import { selfCheckRunner } from './self-check/self-check-runner'
import { updateChecker } from './utils/update-checker'
import { showNotification } from './utils/notifier'
import { destroySelfCheckWindow } from './windows/self-check-window'
import { focusBrowserWindow } from './utils/window-focus'

let mainWindow: BrowserWindow | null = null
let floatingBallWindow: BrowserWindow | null = null

// 单实例锁：如果已有 Xcomputer 进程运行，不再启动新进程，而是聚焦到已有窗口
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  logger.info('[App] 已有 Xcomputer 实例运行，当前进程退出')
  app.quit()
} else {
  // 用户双击快捷方式启动第二个实例时，显示并聚焦已有窗口
  app.on('second-instance', () => {
    logger.info('[App] 检测到第二个实例启动，聚焦到已有窗口')
    if (!mainWindow || mainWindow.isDestroyed()) return
    focusBrowserWindow(mainWindow)
    refreshTrayMenu()
  })
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.xcomputer.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 初始化设置存储
  settingsStore.init()
  // 同步开机自启状态到系统
  const currentSettings = settingsStore.get()
  app.setLoginItemSettings({
    openAtLogin: currentSettings.autoStart,
    args: ['--hidden']
  })
  // 初始化定时任务存储
  scheduleStore.init()
  // 初始化 Xmemory 记忆存储
  memoryStore.init()
  // 初始化技能存储
  skillsStore.init()
  // 注入/更新内置技能（异步，不阻塞启动；失败仅记录日志）
  void skillsStore.ensureBuiltinSkills().catch((err) => {
    console.error('[Main] 注入内置技能失败:', err)
  })
  // 初始化触发器存储
  triggerStore.init()
  // 初始化快捷指令存储
  shortcutStore.init()
  // 初始化代码片段存储
  snippetStore.init()
  // 初始化自定义子智能体模板存储
  customSubagentsStore.init()
  // 初始化文件搜索引擎（加载缓存索引，必要时延迟重建）
  fileSearchEngine.init()
  // 加载历史会话
  await sessionsStore.loadAll()

  mainWindow = createMainWindow()
  registerIpcHandlers(mainWindow)

  // 创建系统托盘（右键支持退出、显示/隐藏主窗口和悬浮球）
  createTray(mainWindow)
  // 拦截主窗口关闭事件：最小化到托盘而非退出应用
  mainWindow.on('close', handleMainWindowClose)

  // 窗口可见性节流：隐藏到托盘时降低后台轮询频率（USB/网络/调度），减少 CPU 占用
  mainWindow.on('hide', () => {
    triggerService.onWindowHidden()
    scheduleService.onWindowHidden()
  })
  mainWindow.on('show', () => {
    triggerService.onWindowVisible()
    scheduleService.onWindowVisible()
  })

  // 创建悬浮球窗口并绑定到状态服务
  floatingBallWindow = createFloatingBallWindow()
  floatingBallState.setWindow(floatingBallWindow)

  // 创建 XC 桌面组件窗口（隐藏状态，等待快捷键召唤）
  const widgetWindow = createWidgetWindow()
  // widget 窗口隐藏时清空对话历史（每次打开都是全新对话）
  widgetWindow.on('hide', () => {
    resetWidgetChat()
  })

  // 启动定时任务调度器
  scheduleService.setMainWindow(mainWindow)
  scheduleService.start()

  // 初始化自动化触发器服务（注入执行器依赖，触发时创建会话并执行AI指令）
  triggerService.setMainWindow(mainWindow)
  triggerService.init({
    prepareSession: async (trigger) => {
      const session = sessionsStore.create()
      const title = `[触发] ${trigger.name}`
      // 等待 rename 落盘，避免进程崩溃时留下"新会话"标题的孤儿会话
      await sessionsStore.rename(session.id, title)
      // 通知前端新增会话（SESSION_CREATED 让侧栏立即显示，使用局部 title 避免 session 变异）
      mainWindow!.webContents.send(IPC_CHANNELS.SESSION_CREATED, {
        ...session,
        title
      })
      return { sessionId: session.id }
    },
    execute: (sessionId, prompt) => {
      const orchestrator = getOrchestrator()
      if (!orchestrator) {
        return Promise.reject(new Error('orchestrator 未初始化'))
      }
      return orchestrator.handleUserMessage(sessionId, prompt)
    },
    abort: (sessionId) => {
      const orchestrator = getOrchestrator()
      if (orchestrator) orchestrator.abort(sessionId)
    }
  })

  // 注册全局快捷键
  // Ctrl+Shift+X：显示/隐藏主窗口
  const ret = globalShortcut.register('CommandOrControl+Shift+X', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide()
    } else {
      focusBrowserWindow(mainWindow)
      refreshTrayMenu()
    }
  })
  if (ret) {
    logger.info('[App] 全局快捷键 Ctrl+Shift+X 已注册（显示/隐藏主窗口）')
  } else {
    logger.warn('[App] 全局快捷键 Ctrl+Shift+X 注册失败')
  }

  // Ctrl+Shift+X+C：召唤/隐藏 XC 桌面组件
  const widgetRet = globalShortcut.register('CommandOrControl+Shift+X+C', () => {
    toggleWidget()
  })
  if (widgetRet) {
    logger.info('[App] 全局快捷键 Ctrl+Shift+X+C 已注册（召唤 XC 桌面组件）')
  } else {
    logger.warn('[App] 全局快捷键 Ctrl+Shift+X+C 注册失败')
  }

  logger.info('Xcomputer app ready')

  // 冷启动系统自检（异步执行，不阻塞应用启动和使用）
  void selfCheckRunner.run({ coldStart: gotSingleInstanceLock })

  // 启动后延迟自动检查更新（仅在冷启动时，10秒后执行等待应用完全就绪）
  if (gotSingleInstanceLock) {
    setTimeout(() => {
      void (async () => {
        try {
          const settings = settingsStore.get()
          if (!settings.updateCheckEnabled) {
            logger.info('[App] 自动检查更新已禁用，跳过')
            return
          }
          const result = await updateChecker.checkForUpdates()
          if (result.hasUpdate && result.updateInfo && mainWindow && !mainWindow.isDestroyed()) {
            logger.info(`[App] 发现新版本 ${result.latestVersion}（当前 ${result.currentVersion}）`)
            // 推送更新状态到前端（设置面板会显示更新提示）
            mainWindow.webContents.send(IPC_CHANNELS.UPDATE_STATUS, {
              type: 'available',
              updateInfo: result.updateInfo
            })
            // 系统通知（主窗口未聚焦时显示）
            showNotification(
              '发现新版本',
              `Xcomputer ${result.latestVersion} 已发布，点击前往更新`,
              () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                  focusBrowserWindow(mainWindow)
                }
              }
            )
          } else if (!result.error) {
            logger.info('[App] 已是最新版本')
          }
        } catch (err) {
          logger.error('[App] 自动检查更新失败:', err)
        }
      })()
    }, 10000)

    // 限免模式每日登录签到：启动 8 秒后查询积分（触发后端当日记录创建，即"每日登录加 50 积分"）
    // 同时拉取付费余额（付费用户启动时即显示余额徽标）
    setTimeout(() => {
      void (async () => {
        try {
          const pushQuota = (globalThis as any).__pushRelayQuotaUpdate as (() => Promise<void>) | undefined
          if (pushQuota) {
            await pushQuota()
            logger.info('[App] 限免模式每日签到完成，已查询积分')
          }
          // 拉取付费余额并推送前端（同步到 aiService 缓存，确保首次 AI 请求时模型选择正确）
          const { paymentService } = await import('./payment/payment-service')
          const paidQuota = await paymentService.getPaidQuota()
          if (paidQuota && mainWindow && !mainWindow.isDestroyed()) {
            const { aiService } = await import('./ai/ai-service')
            aiService.setPaidBalance(paidQuota.balance)
            mainWindow.webContents.send(IPC_CHANNELS.PAYMENT_QUOTA_UPDATED, paidQuota)
            logger.info(`[App] 付费余额已加载: ${paidQuota.balance} 积分`)
          }
        } catch (err) {
          logger.warn('[App] 限免签到/付费余额加载失败:', err)
        }
      })()
    }, 8000)
  }
}).catch((err) => {
  // 捕获 app.whenReady async 函数内的未处理异常，防止静默失败
  logger.error('[App] 启动过程中发生致命错误:', err)
})

// 关闭所有窗口时不退出应用（因为主窗口已最小化到托盘）
// 只有用户从托盘菜单选择"退出"才会真正退出
app.on('window-all-closed', () => {
  // 不执行 app.quit()，让应用保留在系统托盘
  // macOS 上也是同样行为：窗口关闭但应用仍活跃
  logger.info('[App] 所有窗口已关闭，应用保留在系统托盘')
})

// before-quit 的 async 处理器不会被 Electron 等待，需用 preventDefault + 异步清理后手动退出
let isQuitting = false
app.on('before-quit', (e) => {
  if (isQuitting) return // 已经在退出流程中，放行
  e.preventDefault()
  isQuitting = true

  logger.info('App quitting, cleaning up...')
  scheduleService.stop()
  triggerService.stopAll()
  globalShortcut.unregisterAll()
  destroyTray()
  destroyFloatingBallWindow()
  destroyWidgetWindow()
  destroySelfCheckWindow()
  terminalManager.closeAll()

  // 停止远程控制服务
  remoteControl.stop()

  // 异步清理 MCP 后再真正退出（设置较短超时兜底，避免卡死）
  const cleanupTimeout = setTimeout(() => {
    logger.warn('[App] MCP cleanup timeout, force quitting')
    app.exit(0)
  }, 3000)

  mcpClient
    .stop()
    .catch((err) => logger.error('[App] MCP stop error:', err))
    .finally(() => {
      clearTimeout(cleanupTimeout)
      app.exit(0)
    })
})
