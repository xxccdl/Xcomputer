import { BrowserWindow, screen } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import { logger } from '../utils/logger'

let mainWindow: BrowserWindow | null = null

// === 主窗口 mini 模式状态 ===
/** 主窗口是否处于 mini 模式（agent 执行时缩为小窗保持可见） */
let isMiniMode = false
/** mini 模式尺寸（底部右下角状态药丸，与 widget 一致） */
const MINI_WIDTH = 240
const MINI_HEIGHT = 44
/** 主窗口默认最小尺寸（退出 mini 时恢复） */
const DEFAULT_MIN_WIDTH = 1000
const DEFAULT_MIN_HEIGHT = 700
/** 窗口尺寸动画时长（ms），与 renderer CSS transition 协调 */
const ANIM_DURATION = 280
/** 当前动画帧 id，用于取消未完成的动画 */
let animFrameId: NodeJS.Timeout | null = null

/** 全尺寸窗口的缓存 bounds（进入 mini 前保存，恢复时还原位置+尺寸） */
let fullModeBounds: { x: number; y: number; width: number; height: number } | null = null

/** 设置主窗口引用（index.ts 启动时调用） */
export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win
}

/** 平滑动画窗口尺寸变化（setTimeout 驱动，ease-out cubic）
 *  注：主进程无 requestAnimationFrame，用 setTimeout(16ms) 模拟 ~60fps */
function animateBounds(
  win: BrowserWindow,
  target: { x: number; y: number; width: number; height: number },
  duration: number = ANIM_DURATION
): void {
  if (animFrameId) {
    clearTimeout(animFrameId)
    animFrameId = null
  }
  const start = win.getBounds()
  const startTime = Date.now()

  const step = (): void => {
    const elapsed = Date.now() - startTime
    const t = Math.min(elapsed / duration, 1)
    const eased = 1 - Math.pow(1 - t, 3)
    const x = Math.round(start.x + (target.x - start.x) * eased)
    const y = Math.round(start.y + (target.y - start.y) * eased)
    const width = Math.round(start.width + (target.width - start.width) * eased)
    const height = Math.round(start.height + (target.height - start.height) * eased)
    try {
      win.setBounds({ x, y, width, height })
    } catch {
      return
    }
    if (t < 1) {
      animFrameId = setTimeout(step, 1000 / 60)
    } else {
      animFrameId = null
    }
  }
  step()
}

/** 进入 mini 模式：主窗口缩为右下角状态药丸，通知 renderer 切换 UI */
export function enterMainMiniMode(): void {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible() || isMiniMode) return

  // 保存当前全尺寸 bounds（恢复时还原位置+尺寸）
  const currentBounds = mainWindow.getBounds()
  fullModeBounds = {
    x: currentBounds.x,
    y: currentBounds.y,
    width: currentBounds.width,
    height: currentBounds.height
  }

  // 临时放宽最小尺寸约束（主窗口默认 minWidth=1000/minHeight=700，阻止缩小到 240×44）
  mainWindow.setMinimumSize(MINI_WIDTH, MINI_HEIGHT)

  // mini 窗口定位到当前所在显示器的右下角
  const display = screen.getDisplayMatching(currentBounds)
  const { width: screenWidth, height: screenHeight } = display.workArea
  const miniX = Math.round(screenWidth - MINI_WIDTH - 16)
  const miniY = Math.round(screenHeight - MINI_HEIGHT - 16)

  isMiniMode = true
  // 使用 floating 级别而非 screen-saver：screen-saver 是最高 z-order，
  // 会压制系统托盘的右键菜单和通知，导致托盘图标"被窗口影响"。
  // floating 足以让药丸浮在普通窗口之上，且不干扰系统 UI。
  mainWindow.setAlwaysOnTop(true, 'floating')
  mainWindow.setSkipTaskbar(true)
  logger.info('[Main] 进入 mini 模式')

  if (!mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.MAIN_MINI_MODE)
  }
  animateBounds(mainWindow, { x: miniX, y: miniY, width: MINI_WIDTH, height: MINI_HEIGHT })
}

/** 退出 mini 模式：恢复全尺寸窗口，通知 renderer 切换 UI */
export function exitMainMiniMode(): void {
  if (!mainWindow || mainWindow.isDestroyed() || !isMiniMode) return

  isMiniMode = false
  mainWindow.setAlwaysOnTop(false)
  mainWindow.setSkipTaskbar(false)
  logger.info('[Main] 退出 mini 模式，恢复全尺寸')

  if (!mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.MAIN_FULL_MODE)
  }

  // 恢复到进入 mini 前的位置和尺寸
  const restoreW = fullModeBounds?.width ?? 1400
  const restoreH = fullModeBounds?.height ?? 900
  const display = fullModeBounds
    ? screen.getDisplayMatching(fullModeBounds)
    : screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = display.workArea
  const restoreX = fullModeBounds?.x ?? Math.round((screenWidth - restoreW) / 2)
  const restoreY = fullModeBounds?.y ?? Math.round((screenHeight - restoreH) / 2)
  fullModeBounds = null

  animateBounds(mainWindow, { x: restoreX, y: restoreY, width: restoreW, height: restoreH })

  // 动画完成后恢复最小尺寸约束（延迟以避免动画中被钳制）
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !isMiniMode) {
      mainWindow.setMinimumSize(DEFAULT_MIN_WIDTH, DEFAULT_MIN_HEIGHT)
    }
  }, ANIM_DURATION + 50)

  mainWindow.focus()
}

/** 查询主窗口当前是否处于 mini 模式 */
export function isMainMiniMode(): boolean {
  return isMiniMode
}

/** 主窗口 blur 事件处理：agent 运行中时缩为 mini 模式
 *  由 index.ts 注册到 mainWindow.on('blur') */
export function handleMainWindowBlur(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (!mainWindow.isVisible() || isMiniMode) return

  // 动态导入避免循环依赖
  void (async () => {
    try {
      const { getOrchestrator } = await import('../orchestrator/task-orchestrator')
      const { getWidgetAgentSessionId } = await import('../ipc/widget.ipc')
      const orchestrator = getOrchestrator()
      if (!orchestrator) return

      const runningIds = orchestrator.getRunningSessionIds()
      const widgetSessionId = getWidgetAgentSessionId()
      // 过滤掉 widget agent 的 session，只看主窗口是否有 agent 运行
      const mainRunningIds = runningIds.filter((id) => id !== widgetSessionId)
      if (mainRunningIds.length > 0) {
        enterMainMiniMode()
      }
    } catch (err) {
      logger.warn('[Main] blur 检查 agent 运行状态失败:', err instanceof Error ? err.message : String(err))
    }
  })()
}

/** 主窗口 show 事件处理：从 mini 恢复时确保全尺寸 */
export function handleMainWindowShow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (isMiniMode) {
    // show 时重置 mini 状态（外部调用 show 时应已退出 mini，此处防御性处理）
    exitMainMiniMode()
  }
}

/** 销毁时清理 */
export function destroyMainMiniMode(): void {
  if (animFrameId) {
    clearTimeout(animFrameId)
    animFrameId = null
  }
  isMiniMode = false
  fullModeBounds = null
  mainWindow = null
}
