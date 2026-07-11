import { ipcMain, BrowserWindow, screen } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import { logger } from '../utils/logger'
import { focusBrowserWindow } from '../utils/window-focus'
import { floatingBallState } from '../utils/floating-ball-state'
import { getFloatingBallWindow } from '../windows/floating-ball-window'

let registered = false

/** 主窗口引用（用于快捷操作） */
let mainWindowRef: BrowserWindow | null = null

/** 会话创建回调（由外部注入，避免循环依赖） */
let createSessionCallback: (() => void) | null = null
/** 停止任务回调 */
let stopTaskCallback: (() => void) | null = null

export function registerFloatingBallIpc(mainWindow: BrowserWindow): void {
  if (registered) return
  registered = true
  mainWindowRef = mainWindow

  // 查询当前状态
  ipcMain.handle(IPC_CHANNELS.FLOATING_BALL_GET_STATE, () => {
    return floatingBallState.getPayload()
  })

  // 显示/隐藏悬浮球
  ipcMain.handle(IPC_CHANNELS.FLOATING_BALL_TOGGLE, () => {
    const win = getFloatingBallWindow()
    if (!win) return { visible: false }
    if (win.isVisible()) {
      win.hide()
      return { visible: false }
    } else {
      win.show()
      return { visible: true }
    }
  })

  // 悬浮球点击：聚焦主窗口
  ipcMain.on(IPC_CHANNELS.FLOATING_BALL_CLICK, () => {
    logger.info('[FloatingBall] click received -> show main')
    focusMainWindow()
  })

  // 快捷操作
  ipcMain.on(IPC_CHANNELS.FLOATING_BALL_ACTION, (_e, action: string) => {
    logger.info(`[FloatingBall] action received: ${action}`)
    if (!mainWindowRef || mainWindowRef.isDestroyed()) {
      logger.warn('[FloatingBall] mainWindowRef is invalid')
      return
    }
    switch (action) {
      case 'showMain':
        focusMainWindow()
        break
      case 'hideMain':
        mainWindowRef.hide()
        logger.info('[FloatingBall] main window hidden')
        break
      case 'newSession':
        focusMainWindow()
        createSessionCallback?.()
        break
      case 'stopTask':
        stopTaskCallback?.()
        break
      default:
        logger.warn(`[FloatingBall] unknown action: ${action}`)
    }
  })

  // 拖拽移动悬浮球 —— 旧接口（deltaX/deltaY），保留兼容
  ipcMain.on(IPC_CHANNELS.FLOATING_BALL_DRAG, (_e, deltaX: number, deltaY: number) => {
    const win = getFloatingBallWindow()
    if (!win) return
    const BALL_SIZE = 88
    const [x, y] = win.getPosition()
    const [w] = win.getSize()
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

    // 拖拽过程中强制保持球体大小 88x88，防止菜单展开后拖动大窗口
    if (w !== BALL_SIZE) {
      const centerX = x + w / 2
      const centerY = y + w / 2
      win.setBounds(
        {
          x: Math.round(centerX - BALL_SIZE / 2),
          y: Math.round(centerY - BALL_SIZE / 2),
          width: BALL_SIZE,
          height: BALL_SIZE
        },
        false
      )
    }

    const [newXAfterResize, newYAfterResize] = win.getPosition()
    const [newW] = win.getSize()

    // 限制在屏幕范围内
    const newX = Math.max(0, Math.min(screenWidth - newW, newXAfterResize + deltaX))
    const newY = Math.max(0, Math.min(screenHeight - newW, newYAfterResize + deltaY))
    win.setPosition(Math.round(newX), Math.round(newY), false)
  })

  // ===== 主进程接管拖拽（解决小窗口鼠标移出后 mouseup 丢失问题）=====
  // renderer mousedown 时发送 DRAG_START，主进程启动 16ms 间隔轮询，
  // 用 screen.getCursorScreenPoint() 获取鼠标位置并移动窗口。
  // 因窗口跟随鼠标，鼠标始终在窗口附近，mouseup 能正常触发。
  let dragInterval: ReturnType<typeof setInterval> | null = null
  let dragOffsetX = 0
  let dragOffsetY = 0

  ipcMain.on(
    IPC_CHANNELS.FLOATING_BALL_DRAG_START,
    () => {
      const win = getFloatingBallWindow()
      if (!win) return
      const BALL_SIZE = 88
      // 用 screen.getCursorScreenPoint() 获取鼠标位置（与轮询中的坐标系一致），
      // 避免 DOM 事件 e.screenX（物理像素）与 screen API（逻辑像素）在高 DPI 下不一致
      const cursor = screen.getCursorScreenPoint()
      const [wx, wy] = win.getPosition()
      const [w] = win.getSize()
      if (w !== BALL_SIZE) {
        const centerX = wx + w / 2
        const centerY = wy + w / 2
        win.setBounds(
          {
            x: Math.round(centerX - BALL_SIZE / 2),
            y: Math.round(centerY - BALL_SIZE / 2),
            width: BALL_SIZE,
            height: BALL_SIZE
          },
          false
        )
        // resize 后重新获取位置
        const [nx, ny] = win.getPosition()
        dragOffsetX = cursor.x - nx
        dragOffsetY = cursor.y - ny
      } else {
        dragOffsetX = cursor.x - wx
        dragOffsetY = cursor.y - wy
      }

      // 清除上一次未正常结束的轮询（兜底）
      if (dragInterval) {
        clearInterval(dragInterval)
        dragInterval = null
      }

      dragInterval = setInterval(() => {
        const w = getFloatingBallWindow()
        if (!w || w.isDestroyed()) {
          if (dragInterval) {
            clearInterval(dragInterval)
            dragInterval = null
          }
          return
        }
        // 窗口大小保护：如果被意外改变（如 setMenuVisible 副作用），强制恢复到 88x88
        const [cw] = w.getSize()
        if (cw !== BALL_SIZE) {
          w.setSize(BALL_SIZE, BALL_SIZE)
        }
        const cursor = screen.getCursorScreenPoint()
        const { width: screenWidth, height: screenHeight } =
          screen.getPrimaryDisplay().workAreaSize
        const newX = Math.max(0, Math.min(screenWidth - BALL_SIZE, cursor.x - dragOffsetX))
        const newY = Math.max(0, Math.min(screenHeight - BALL_SIZE, cursor.y - dragOffsetY))
        w.setPosition(Math.round(newX), Math.round(newY), false)
      }, 16)
    }
  )

  ipcMain.on(IPC_CHANNELS.FLOATING_BALL_DRAG_END, () => {
    if (dragInterval) {
      clearInterval(dragInterval)
      dragInterval = null
    }
  })

  // 根据菜单展开/收起动态调整窗口大小，减小常态下的透明遮挡区域
  ipcMain.on(IPC_CHANNELS.FLOATING_BALL_SET_MENU_VISIBLE, (_e, visible: boolean) => {
    const win = getFloatingBallWindow()
    if (!win) return
    // 拖拽期间不允许改变窗口大小，防止与 setPosition 轮询冲突导致面积异常
    if (dragInterval) return
    const BALL_SIZE = 88
    const MENU_SIZE = 120
    const targetSize = visible ? MENU_SIZE : BALL_SIZE
    const [currentX, currentY] = win.getPosition()
    const [currentW, currentH] = win.getSize()

    // 计算球体中心点，保持中心不变调整窗口大小
    const centerX = currentX + currentW / 2
    const centerY = currentY + currentH / 2
    const newX = Math.round(centerX - targetSize / 2)
    const newY = Math.round(centerY - targetSize / 2)

    win.setBounds(
      {
        x: newX,
        y: newY,
        width: targetSize,
        height: targetSize
      },
      false
    )
    logger.debug(`[FloatingBall] resize to ${targetSize}x${targetSize}, menu=${visible}`)
  })

  // 动态启用/禁用鼠标事件：鼠标在球体/菜单上时接收事件，在透明区域时点击穿透
  ipcMain.on(IPC_CHANNELS.FLOATING_BALL_SET_MOUSE_EVENTS, (_e, enabled: boolean) => {
    const win = getFloatingBallWindow()
    if (!win) return
    win.setIgnoreMouseEvents(!enabled, { forward: true })
    logger.debug(`[FloatingBall] mouse events ${enabled ? 'enabled' : 'disabled'}`)
  })
}

/** 聚焦主窗口 */
function focusMainWindow(): void {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return
  focusBrowserWindow(mainWindowRef)
}

/** 注入会话创建回调（由 chat.ipc 调用） */
export function setCreateSessionCallback(cb: () => void): void {
  createSessionCallback = cb
}

/** 注入停止任务回调（由 chat.ipc 调用） */
export function setStopTaskCallback(cb: () => void): void {
  stopTaskCallback = cb
}
