import type { BrowserWindow } from 'electron'
import { logger } from './logger'

/**
 * 聚焦 BrowserWindow 并恢复 webContents 键盘焦点。
 *
 * Electron 在 Windows 上有一个常见问题：窗口 hide → show + focus 后，
 * 操作系统焦点已恢复，但渲染进程的 webContents 可能未获得键盘焦点。
 * 表现为：点击输入框出现 :focus 蓝框样式，却看不见光标、无法输入文字。
 *
 * 本函数在 window.focus() 之后显式调用 webContents.focus()，确保
 * DOM 焦点与键盘焦点一致，避免上述输入失灵问题。
 *
 * 用于所有"从托盘/通知/快捷键/悬浮球重新显示主窗口"的场景。
 */
export function focusBrowserWindow(window: BrowserWindow): void {
  if (!window || window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  if (!window.isVisible()) window.show()
  window.focus()
  // 关键：恢复 webContents 键盘焦点，否则输入框有 :focus 样式但收不到按键
  try {
    window.webContents.focus()
  } catch (err) {
    logger.warn(
      '[WindowFocus] webContents.focus 失败:',
      err instanceof Error ? err.message : String(err)
    )
  }
}
