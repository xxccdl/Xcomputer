import { Notification, BrowserWindow, shell } from 'electron'
import { logger } from './logger'
import { focusBrowserWindow } from './window-focus'

/**
 * 显示系统通知（仅在主窗口失焦时显示，避免打扰用户）
 * @param title 通知标题
 * @param body 通知正文
 * @param onClick 点击通知回调（通常用于聚焦主窗口）
 */
export function showNotification(
  title: string,
  body: string,
  onClick?: () => void
): void {
  // 主窗口聚焦时不打扰用户
  const focusedWindow = BrowserWindow.getFocusedWindow()
  if (focusedWindow) {
    logger.info(`[Notifier] 主窗口聚焦中，跳过通知: ${title}`)
    return
  }

  try {
    if (!Notification.isSupported()) {
      logger.warn('[Notifier] 系统不支持通知')
      return
    }

    const notification = new Notification({
      title,
      body,
      silent: false,
      timeoutType: 'default'
    })

    if (onClick) {
      notification.on('click', () => {
        onClick()
      })
    } else {
      // 默认点击行为：聚焦主窗口
      notification.on('click', () => {
        const windows = BrowserWindow.getAllWindows()
        const main = windows.find((w) => w.title === 'Xcomputer') ?? windows[0]
        if (main) {
          focusBrowserWindow(main)
        }
      })
    }

    notification.show()
    logger.info(`[Notifier] 通知已显示: ${title} - ${body}`)
  } catch (err) {
    logger.error('[Notifier] 通知显示失败:', err)
  }
}

/** 任务完成通知 */
export function notifyTaskComplete(sessionTitle: string, summary: string): void {
  const body = summary ? `${sessionTitle}\n${summary}` : sessionTitle
  showNotification('✅ 任务完成', body)
}

/** 任务出错通知 */
export function notifyTaskError(sessionTitle: string, error: string): void {
  showNotification('❌ 任务出错', `${sessionTitle}\n${error}`)
}

/** 任务中断通知 */
export function notifyTaskAborted(sessionTitle: string): void {
  showNotification('⏹ 任务已中断', sessionTitle)
}

/** 打开通知设置（预留） */
export function openNotificationSettings(): void {
  // Windows 打开通知设置
  if (process.platform === 'win32') {
    void shell.openExternal('ms-settings:notifications')
  }
}
