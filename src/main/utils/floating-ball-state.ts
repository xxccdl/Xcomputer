import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import type { FloatingBallState, FloatingBallStatusPayload } from '@shared/types'
import { logger } from './logger'

/**
 * 悬浮球状态服务（单例）
 * 负责跟踪 AI 工作状态并广播到悬浮球窗口
 */
class FloatingBallStateService {
  private currentState: FloatingBallState = 'idle'
  private currentDetail = ''
  private currentSessionId: string | undefined
  private floatingBallWindow: BrowserWindow | null = null
  private resetTimer: NodeJS.Timeout | null = null

  /** 注册悬浮球窗口 */
  setWindow(win: BrowserWindow | null): void {
    this.floatingBallWindow = win
    if (win) {
      // 窗口就绪后立即推送当前状态
      win.webContents.once('did-finish-load', () => {
        this.broadcast()
      })
    }
  }

  getState(): FloatingBallState {
    return this.currentState
  }

  getPayload(): FloatingBallStatusPayload {
    return {
      state: this.currentState,
      detail: this.currentDetail || undefined,
      sessionId: this.currentSessionId,
      timestamp: Date.now()
    }
  }

  /** 更新状态并广播 */
  setState(state: FloatingBallState, detail?: string, sessionId?: string): void {
    // 清除之前的自动重置定时器
    if (this.resetTimer) {
      clearTimeout(this.resetTimer)
      this.resetTimer = null
    }

    this.currentState = state
    this.currentDetail = detail ?? ''
    this.currentSessionId = sessionId
    logger.info(`[FloatingBallState] -> ${state} (${detail ?? ''})`)
    this.broadcast()

    // success / error 状态 3 秒后自动回到 idle
    if (state === 'success' || state === 'error') {
      this.resetTimer = setTimeout(() => {
        this.setState('idle')
      }, 3000)
    }
  }

  /** 广播当前状态到悬浮球窗口 */
  private broadcast(): void {
    const payload = this.getPayload()
    if (this.floatingBallWindow && !this.floatingBallWindow.isDestroyed()) {
      this.floatingBallWindow.webContents.send(IPC_CHANNELS.FLOATING_BALL_STATE, payload)
    }
  }
}

export const floatingBallState = new FloatingBallStateService()
