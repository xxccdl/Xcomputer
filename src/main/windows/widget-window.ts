import { BrowserWindow, screen, shell } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'
import { logger } from '../utils/logger'

let widgetWindow: BrowserWindow | null = null

/** 创建 XC 桌面组件窗口（透明置顶、圆角玻璃效果、blur 自动隐藏） */
export function createWidgetWindow(): BrowserWindow {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    return widgetWindow
  }

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
  const widgetWidth = 420
  const widgetHeight = 560

  widgetWindow = new BrowserWindow({
    width: widgetWidth,
    height: widgetHeight,
    x: Math.round((screenWidth - widgetWidth) / 2),
    y: Math.round((screenHeight - widgetHeight) / 2),
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

  widgetWindow.on('ready-to-show', () => {
    logger.info('[Widget] 窗口就绪')
  })

  // blur 时自动隐藏（点击外部区域关闭 widget）
  widgetWindow.on('blur', () => {
    if (widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible()) {
      widgetWindow.hide()
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

/** 显示/隐藏 widget（toggle） */
export function toggleWidget(): boolean {
  const win = getWidgetWindow()
  if (!win) return false
  if (win.isVisible()) {
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
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.destroy()
  }
  widgetWindow = null
}
