import { BrowserWindow, screen, shell } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'
import { logger } from '../utils/logger'

let floatingBallWindow: BrowserWindow | null = null

/** 创建悬浮球窗口（透明置顶、可拖拽、点击穿透区域以外） */
export function createFloatingBallWindow(): BrowserWindow {
  if (floatingBallWindow && !floatingBallWindow.isDestroyed()) {
    return floatingBallWindow
  }

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

  // 常态只显示球体（88px），菜单展开时动态放大到 120px
  const ballSize = 88
  const menuSize = 120
  const initialX = screenWidth - ballSize - 16
  const initialY = Math.round(screenHeight / 2 - ballSize / 2)

  floatingBallWindow = new BrowserWindow({
    width: ballSize,
    height: ballSize,
    x: initialX,
    y: initialY,
    minWidth: ballSize,
    minHeight: ballSize,
    maxWidth: menuSize,
    maxHeight: menuSize,
    resizable: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true, // 必须可聚焦，否则 Windows 上接收不到按钮点击
    show: false,
    backgroundColor: '#00000000',
    roundedCorners: false, // Windows: 避免透明窗口圆角黑边
    title: 'Xcomputer-FloatingBall',
    webPreferences: {
      preload: join(__dirname, '../preload/floating-ball.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: false,
      backgroundThrottling: true, // 后台时降低定时器/动画频率
      spellcheck: false // 禁用拼写检查
    }
  })

  // 允许悬浮球在所有工作区/全屏应用之上（macOS）
  floatingBallWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // Windows: 在任务栏不显示
  floatingBallWindow.setSkipTaskbar(true)

  floatingBallWindow.on('ready-to-show', () => {
    floatingBallWindow?.show()
    // 默认让透明区域点击穿透，鼠标进入球体/菜单时渲染进程再启用事件
    floatingBallWindow?.setIgnoreMouseEvents(true, { forward: true })
    logger.info('[FloatingBall] 窗口已显示')
  })

  // 捕获错误
  floatingBallWindow.webContents.on('render-process-gone', (_event, details) => {
    logger.error(`[FloatingBall] Renderer gone: ${details.reason}`)
  })
  floatingBallWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    logger.error(`[FloatingBall] Failed to load: ${errorCode} ${errorDescription}`)
  })

  // 外部链接用系统浏览器打开
  floatingBallWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    // 开发模式：使用独立的 floating-ball 入口
    void floatingBallWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/floating-ball.html`)
  } else {
    void floatingBallWindow.loadFile(join(__dirname, '../renderer/floating-ball.html'))
  }

  return floatingBallWindow
}

/** 获取悬浮球窗口实例 */
export function getFloatingBallWindow(): BrowserWindow | null {
  if (floatingBallWindow && !floatingBallWindow.isDestroyed()) {
    return floatingBallWindow
  }
  return null
}

/** 显示/隐藏悬浮球 */
export function toggleFloatingBall(): boolean {
  const win = getFloatingBallWindow()
  if (!win) return false
  if (win.isVisible()) {
    win.hide()
    return false
  } else {
    win.show()
    return true
  }
}

/** 销毁悬浮球窗口 */
export function destroyFloatingBallWindow(): void {
  if (floatingBallWindow && !floatingBallWindow.isDestroyed()) {
    floatingBallWindow.destroy()
  }
  floatingBallWindow = null
}
