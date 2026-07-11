import { BrowserWindow, screen, shell } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'
import { logger } from '../utils/logger'

let selfCheckWindow: BrowserWindow | null = null

const WIDTH = 340
const HEIGHT = 260

/** 创建自检弹窗窗口（右上角置顶卡片，不抢主窗口焦点） */
export function createSelfCheckWindow(): BrowserWindow {
  if (selfCheckWindow && !selfCheckWindow.isDestroyed()) {
    return selfCheckWindow
  }

  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize

  selfCheckWindow = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    x: screenWidth - WIDTH - 16, // 右上角，留 16px 边距
    y: 16,
    resizable: false,
    frame: false,
    transparent: false,
    hasShadow: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false, // 不抢主窗口键盘焦点
    show: false,
    backgroundColor: '#1e1e2e',
    title: 'Xcomputer-SelfCheck',
    webPreferences: {
      preload: join(__dirname, '../preload/self-check.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  selfCheckWindow.setSkipTaskbar(true)
  selfCheckWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  selfCheckWindow.on('ready-to-show', () => {
    selfCheckWindow?.show()
    logger.info('[SelfCheck] 弹窗已显示')
  })

  selfCheckWindow.webContents.on('render-process-gone', (_event, details) => {
    logger.error(`[SelfCheck] Renderer gone: ${details.reason}`)
  })
  selfCheckWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    logger.error(`[SelfCheck] Failed to load: ${errorCode} ${errorDescription}`)
  })

  selfCheckWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void selfCheckWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/self-check.html`)
  } else {
    void selfCheckWindow.loadFile(join(__dirname, '../renderer/self-check.html'))
  }

  return selfCheckWindow
}

/** 获取自检弹窗实例 */
export function getSelfCheckWindow(): BrowserWindow | null {
  if (selfCheckWindow && !selfCheckWindow.isDestroyed()) {
    return selfCheckWindow
  }
  return null
}

/** 销毁自检弹窗窗口 */
export function destroySelfCheckWindow(): void {
  if (selfCheckWindow && !selfCheckWindow.isDestroyed()) {
    selfCheckWindow.destroy()
  }
  selfCheckWindow = null
}
