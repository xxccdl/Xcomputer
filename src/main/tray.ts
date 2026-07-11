import { Tray, Menu, BrowserWindow, app, nativeImage } from 'electron'
import { join } from 'path'
import { logger } from './utils/logger'
import { focusBrowserWindow } from './utils/window-focus'
import { getFloatingBallWindow } from './windows/floating-ball-window'

let tray: Tray | null = null

/** 主窗口引用，用于托盘菜单操作 */
let mainWindowRef: BrowserWindow | null = null

/** 是否最小化到托盘（而非真正退出） */
let minimizeToTray = true

/** 创建系统托盘 */
export function createTray(mainWindow: BrowserWindow): Tray {
  mainWindowRef = mainWindow

  // 使用 build 目录下的图标
  // 打包后资源位于 process.resourcesPath/build，开发环境位于 app.getAppPath()/build
  const basePath = app.isPackaged ? process.resourcesPath : app.getAppPath()
  const iconPath = join(basePath, 'build/icon_256.png')
  let icon: Electron.NativeImage
  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) {
      // 降级：使用 16x16 小图标
      icon = nativeImage.createFromPath(join(basePath, 'build/icon_16.png'))
    }
  } catch {
    logger.warn('[Tray] 图标加载失败，使用空图标')
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('Xcomputer — AI 桌面自动化助手')

  updateTrayMenu()

  // 单击托盘：显示/隐藏主窗口
  tray.on('click', () => {
    if (!mainWindowRef || mainWindowRef.isDestroyed()) return
    if (mainWindowRef.isVisible() && mainWindowRef.isFocused()) {
      mainWindowRef.hide()
    } else {
      focusMainWindow()
    }
  })

  // 双击托盘：显示主窗口
  tray.on('double-click', () => {
    focusMainWindow()
  })

  logger.info('[Tray] 系统托盘已创建')
  return tray
}

/** 更新托盘右键菜单 */
function updateTrayMenu(): void {
  if (!tray) return

  const isVisible = Boolean(
    mainWindowRef && !mainWindowRef.isDestroyed() && mainWindowRef.isVisible()
  )

  const menu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: (): void => focusMainWindow()
    },
    {
      label: '隐藏主窗口',
      enabled: isVisible,
      click: (): void => {
        if (mainWindowRef && !mainWindowRef.isDestroyed()) {
          mainWindowRef.hide()
        }
      }
    },
    { type: 'separator' },
    {
      label: '显示悬浮球',
      click: (): void => {
        const win = getFloatingBallWindow()
        if (win && !win.isVisible()) win.show()
      }
    },
    {
      label: '隐藏悬浮球',
      click: (): void => {
        const win = getFloatingBallWindow()
        if (win && win.isVisible()) win.hide()
      }
    },
    { type: 'separator' },
    {
      label: '退出 Xcomputer',
      click: (): void => {
        minimizeToTray = false
        app.quit()
      }
    }
  ])

  tray.setContextMenu(menu)
}

/** 聚焦主窗口 */
function focusMainWindow(): void {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return
  focusBrowserWindow(mainWindowRef)
  updateTrayMenu()
}

/** 主窗口关闭时的处理：最小化到托盘而非退出 */
export function handleMainWindowClose(e: Electron.Event): void {
  if (minimizeToTray && tray) {
    e.preventDefault()
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.hide()
      logger.info('[Tray] 主窗口最小化到托盘')
    }
    updateTrayMenu()
  }
  // minimizeToTray = false 时允许正常关闭（由"退出"菜单触发）
}

/** 监听主窗口显示/隐藏，更新托盘菜单 */
export function refreshTrayMenu(): void {
  updateTrayMenu()
}

/** 销毁托盘 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
