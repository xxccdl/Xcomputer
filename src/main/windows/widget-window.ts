import { BrowserWindow, screen, shell } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'
import { logger } from '../utils/logger'
import { IPC_CHANNELS } from '@shared/constants'
import { isWidgetBlurLocked, isWidgetAgentRunning } from '../ipc/widget.ipc'

let widgetWindow: BrowserWindow | null = null

// === Mini 模式状态 ===
/** Widget 是否处于 mini 模式（AI 点击操作时缩为小窗保持可见） */
let isMiniMode = false
/** mini 模式尺寸（底部居中的状态药丸） */
const MINI_WIDTH = 240
const MINI_HEIGHT = 44
/** 全尺寸模式尺寸 */
const FULL_WIDTH = 380
const FULL_HEIGHT = 520
/** 窗口尺寸动画时长（ms），与 renderer CSS transition 协调 */
const ANIM_DURATION = 280
/** 当前动画帧 id，用于取消未完成的动画 */
let animFrameId: NodeJS.Timeout | null = null

/** 全尺寸窗口的缓存 bounds（进入 mini 前保存，恢复时还原位置+尺寸） */
let fullModeBounds: { x: number; y: number; width: number; height: number } | null = null

/** 平滑动画窗口尺寸变化（requestAnimationFrame 驱动，ease-out cubic） */
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
    // ease-out cubic：先快后慢，自然流畅
    const eased = 1 - Math.pow(1 - t, 3)
    const x = Math.round(start.x + (target.x - start.x) * eased)
    const y = Math.round(start.y + (target.y - start.y) * eased)
    const width = Math.round(start.width + (target.width - start.width) * eased)
    const height = Math.round(start.height + (target.height - start.height) * eased)
    try {
      win.setBounds({ x, y, width, height })
    } catch {
      // 窗口可能已销毁
      return
    }
    if (t < 1) {
      animFrameId = setTimeout(step, 1000 / 60) // ~60fps
    } else {
      animFrameId = null
    }
  }
  step()
}

/** 进入 mini 模式：窗口缩为底部居中的状态药丸，通知 renderer 切换 UI */
export function enterMiniMode(): void {
  const win = getWidgetWindow()
  if (!win || win.isDestroyed() || !win.isVisible() || isMiniMode) return

  // 保存当前全尺寸 bounds（恢复时还原位置+尺寸）
  const currentBounds = win.getBounds()
  fullModeBounds = { x: currentBounds.x, y: currentBounds.y, width: currentBounds.width, height: currentBounds.height }

  // mini 窗口定位到当前所在显示器的右下角（不遮挡 AI 正在操作的区域）
  // 使用 getDisplayMatching 而非 getPrimaryDisplay，避免多显示器时窗口跳到主屏
  const display = screen.getDisplayMatching(currentBounds)
  const { width: screenWidth, height: screenHeight } = display.workArea
  const miniX = Math.round(screenWidth - MINI_WIDTH - 16) // 距右侧 16px
  const miniY = Math.round(screenHeight - MINI_HEIGHT - 16) // 距底部 16px

  isMiniMode = true
  logger.info('[Widget] 进入 mini 模式')

  // 通知 renderer 切换到 mini UI（renderer 先做 CSS 过渡，同时主进程动画窗口尺寸）
  if (!win.webContents.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.WIDGET_MINI_MODE)
  }
  animateBounds(win, { x: miniX, y: miniY, width: MINI_WIDTH, height: MINI_HEIGHT })
}

/** 退出 mini 模式：恢复全尺寸窗口，通知 renderer 切换 UI */
export function exitWidgetMiniMode(): void {
  const win = getWidgetWindow()
  if (!win || win.isDestroyed() || !isMiniMode) return

  isMiniMode = false
  logger.info('[Widget] 退出 mini 模式，恢复全尺寸')

  // 通知 renderer 恢复全尺寸 UI
  if (!win.webContents.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.WIDGET_FULL_MODE)
  }

  // 恢复到进入 mini 前的位置和尺寸，若无缓存则居中
  const restoreW = fullModeBounds?.width ?? FULL_WIDTH
  const restoreH = fullModeBounds?.height ?? FULL_HEIGHT
  const display = fullModeBounds
    ? screen.getDisplayMatching(fullModeBounds)
    : screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = display.workArea
  const restoreX = fullModeBounds?.x ?? Math.round((screenWidth - restoreW) / 2)
  const restoreY = fullModeBounds?.y ?? Math.round((screenHeight - restoreH) / 2)
  fullModeBounds = null

  animateBounds(win, { x: restoreX, y: restoreY, width: restoreW, height: restoreH })

  // 恢复后聚焦窗口（让用户能立即交互）
  win.focus()
}

/** 查询当前是否处于 mini 模式 */
export function isWidgetMiniMode(): boolean {
  return isMiniMode
}

/** 创建 XC 桌面组件窗口（透明置顶、圆角玻璃效果、blur 自动隐藏） */
export function createWidgetWindow(): BrowserWindow {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    return widgetWindow
  }

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

  widgetWindow = new BrowserWindow({
    width: FULL_WIDTH,
    height: FULL_HEIGHT,
    x: Math.round((screenWidth - FULL_WIDTH) / 2),
    y: Math.round((screenHeight - FULL_HEIGHT) / 2),
    resizable: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    show: false,
    backgroundColor: '#00000000',
    roundedCorners: false, // Windows: 避免透明窗口圆角黑边
    title: 'Xcomputer-Widget',
    webPreferences: {
      preload: join(__dirname, '../preload/widget.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
      spellcheck: false
    }
  })

  // 允许在所有工作区/全屏应用之上（macOS）
  widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  widgetWindow.setSkipTaskbar(true)
  // 小组件置顶级别设为 pop-up-menu（高于 floating），确保不被主窗口 mini 药丸、
  // 悬浮球等 floating 级窗口遮挡；低于 screen-saver，不压制系统托盘菜单/通知
  widgetWindow.setAlwaysOnTop(true, 'pop-up-menu')

  widgetWindow.on('ready-to-show', () => {
    logger.info('[Widget] 窗口就绪')
  })

  // blur 时自动隐藏（点击外部区域关闭 widget）
  // - blur 锁定中（有 pending 高危确认/提问）→ 跳过隐藏
  // - agent 正在运行 → 缩为 mini 模式保持可见（而非完全隐藏）
  // - 其他情况 → 直接隐藏
  widgetWindow.on('blur', () => {
    if (widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible()) {
      if (isWidgetBlurLocked()) {
        logger.info('[Widget] blur 锁定中，跳过自动隐藏（有 pending 确认/提问）')
        return
      }
      if (isWidgetAgentRunning()) {
        // agent 运行中：缩为 mini 模式，保持状态可见
        enterMiniMode()
      } else {
        widgetWindow.hide()
      }
    }
  })

  // 窗口重新显示时通知 renderer 刷新 agent 状态（恢复任务历史和未完成任务）
  widgetWindow.on('show', () => {
    // 恢复显示时确保全尺寸模式（从 mini 重新打开时应展开）
    if (isMiniMode) {
      isMiniMode = false
      fullModeBounds = null
    }
    // 防御性尺寸恢复：若窗口在 mini 模式下被隐藏（如 WIDGET_HIDE），
    // 再次 show 时尺寸仍是 mini（240×44），需恢复为全尺寸以免 UI 被裁剪
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      const bounds = widgetWindow.getBounds()
      if (bounds.width !== FULL_WIDTH || bounds.height !== FULL_HEIGHT) {
        const display = screen.getDisplayMatching(bounds)
        const { width: screenWidth, height: screenHeight } = display.workArea
        widgetWindow.setBounds({
          x: Math.round((screenWidth - FULL_WIDTH) / 2),
          y: Math.round((screenHeight - FULL_HEIGHT) / 2),
          width: FULL_WIDTH,
          height: FULL_HEIGHT
        })
      }
    }
    if (widgetWindow && !widgetWindow.isDestroyed() && !widgetWindow.webContents.isDestroyed()) {
      widgetWindow.webContents.send(IPC_CHANNELS.WIDGET_AGENT_REFRESH)
      widgetWindow.webContents.send(IPC_CHANNELS.WIDGET_FULL_MODE)
    }
  })

  // 捕获渲染进程崩溃
  widgetWindow.webContents.on('render-process-gone', (_event, details) => {
    logger.error(`[Widget] Renderer gone: ${details.reason}`)
  })
  widgetWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    logger.error(`[Widget] Failed to load: ${errorCode} ${errorDescription}`)
  })

  // 外部链接用系统浏览器打开
  widgetWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void widgetWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/widget.html`)
  } else {
    void widgetWindow.loadFile(join(__dirname, '../renderer/widget.html'))
  }

  return widgetWindow
}

/** 获取 widget 窗口实例 */
export function getWidgetWindow(): BrowserWindow | null {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    return widgetWindow
  }
  return null
}

/** 显示/隐藏 widget（toggle）
 *  可见（含 mini 模式）→ 隐藏；隐藏 → 显示全尺寸 */
export function toggleWidget(): boolean {
  const win = getWidgetWindow()
  if (!win) return false
  if (win.isVisible()) {
    // 隐藏时重置 mini 状态（下次打开为全尺寸）
    if (isMiniMode) {
      isMiniMode = false
      fullModeBounds = null
      if (animFrameId) {
        clearTimeout(animFrameId)
        animFrameId = null
      }
      // 先恢复尺寸再隐藏，避免下次 show 时尺寸不对
      const display = screen.getDisplayMatching(win.getBounds())
      const { width: screenWidth, height: screenHeight } = display.workArea
      win.setBounds({
        x: Math.round((screenWidth - FULL_WIDTH) / 2),
        y: Math.round((screenHeight - FULL_HEIGHT) / 2),
        width: FULL_WIDTH,
        height: FULL_HEIGHT
      })
    }
    win.hide()
    return false
  } else {
    win.show()
    win.focus()
    return true
  }
}

/** 销毁 widget 窗口 */
export function destroyWidgetWindow(): void {
  if (animFrameId) {
    clearTimeout(animFrameId)
    animFrameId = null
  }
  isMiniMode = false
  fullModeBounds = null
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.destroy()
  }
  widgetWindow = null
}
