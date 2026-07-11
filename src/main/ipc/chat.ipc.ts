import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import type { ChatMode, ContextUsage } from '@shared/types'
import { initOrchestrator, getOrchestrator } from '../orchestrator/task-orchestrator'
import { sessionsStore } from '../store/sessions'
import { aiService } from '../ai/ai-service'
import { logger } from '../utils/logger'
import { setCreateSessionCallback, setStopTaskCallback } from './floating-ball.ipc'

export function registerChatIpc(mainWindow: BrowserWindow): void {
  const orchestrator = initOrchestrator(mainWindow)

  // 当前活动会话 ID（用于悬浮球快捷操作）
  let activeSessionId: string | null = null

  /** 安全发送 IPC 消息：窗口已销毁时静默跳过（避免异步回调中访问已销毁的 webContents） */
  function safeSend(channel: string, ...args: unknown[]): void {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, ...args)
    }
  }

  /** 主动推送指定会话的上下文使用率（前端切换会话/进入会话时主动拉取） */
  async function pushContextUsage(sessionId: string): Promise<void> {
    try {
      const usage = await orchestrator.computeContextUsage(sessionId)
      safeSend(IPC_CHANNELS.CHAT_CONTEXT_USAGE, usage)
    } catch (err) {
      logger.warn('[chat.ipc] pushContextUsage 失败:', err instanceof Error ? err.message : String(err))
    }
  }

  // 查询限免剩余积分
  ipcMain.handle(IPC_CHANNELS.AI_GET_RELAY_QUOTA, async () => {
    return await aiService.getRelayQuota()
  })

  // 花费 10 积分跳过排队（限免模式高并发时排队）
  ipcMain.handle(IPC_CHANNELS.CHAT_QUEUE_SKIP, async () => {
    return await aiService.skipQueue()
  })

  /**
   * 推送限免积分更新到渲染进程（启动签到 / AI 请求完成后调用）
   * 非限免模式下不推送（getRelayQuota 返回 null）
   */
  async function pushRelayQuotaUpdate(): Promise<void> {
    try {
      const quota = await aiService.getRelayQuota()
      if (quota) {
        safeSend(IPC_CHANNELS.AI_RELAY_QUOTA_UPDATED, quota)
      }
    } catch (err) {
      logger.warn('[chat.ipc] 推送限免积分失败:', err instanceof Error ? err.message : String(err))
    }
  }

  // 暴露给其他模块（main/index.ts 启动签到、orchestrator 请求完成）
  // 通过全局回调避免循环依赖
  ;(globalThis as any).__pushRelayQuotaUpdate = pushRelayQuotaUpdate

  ipcMain.handle(IPC_CHANNELS.CHAT_SEND, async (_e, sessionId: string, text: string) => {
    activeSessionId = sessionId
    // 用会话首条消息作为标题
    const messages = await sessionsStore.getMessages(sessionId)
    if (messages.length === 0) {
      const title = text.slice(0, 30)
      await sessionsStore.rename(sessionId, title)
      safeSend(IPC_CHANNELS.SESSION_UPDATED, { id: sessionId, title })
    }
    await orchestrator.handleUserMessage(sessionId, text)
    // 限免模式下，一次 AI 请求完成后刷新积分（延迟 500ms 等待后端计数落盘）
    if (aiService.isRelayMode()) {
      setTimeout(() => {
        void pushRelayQuotaUpdate()
        // 同时刷新付费余额（付费用户消耗了积分，需更新前端徽标和 aiService 缓存）
        void (async () => {
          try {
            const { paymentService } = await import('../payment/payment-service')
            const quota = await paymentService.getPaidQuota()
            if (quota) {
              aiService.setPaidBalance(quota.balance)
              mainWindow.webContents.send(IPC_CHANNELS.PAYMENT_QUOTA_UPDATED, quota)
            }
          } catch (err) {
            logger.warn('[chat.ipc] 推送付费余额失败:', err instanceof Error ? err.message : String(err))
          }
        })()
      }, 500)
    }
  })

  // 查询某会话的上下文使用情况（优先读取持久化值，无则实时计算）
  ipcMain.handle(
    IPC_CHANNELS.CHAT_CONTEXT_USAGE,
    async (_e, sessionId: string): Promise<ContextUsage | null> => {
      // 优先读取持久化值（切换会话时快速返回，不闪烁）
      const persisted = await sessionsStore.getContextUsagePersisted(sessionId)
      if (persisted) return persisted
      // 无持久化值（首次或旧版本会话），实时计算
      return await orchestrator.computeContextUsage(sessionId)
    }
  )

  // 手动触发上下文压缩（AI 详细总结老消息并持久化替换）
  ipcMain.handle(
    IPC_CHANNELS.CHAT_CONTEXT_COMPRESS,
    async (_e, sessionId: string): Promise<{ success: boolean; summaryId?: string; error?: string; newMessageCount?: number; compressedCount?: number }> => {
      return await orchestrator.manualCompressContext(sessionId)
    }
  )

  ipcMain.handle(IPC_CHANNELS.CHAT_STOP, async (_e, sessionId: string) => {
    orchestrator.abort(sessionId)
  })

  // 设置会话工作模式（task/plan/spec/code）
  ipcMain.handle(
    IPC_CHANNELS.CHAT_SET_MODE,
    (_e, sessionId: string, mode: ChatMode): { success: boolean; mode: ChatMode } => {
      orchestrator.setMode(sessionId, mode)
      return { success: true, mode }
    }
  )

  // 查询会话当前工作模式
  ipcMain.handle(
    IPC_CHANNELS.CHAT_GET_MODE,
    (_e, sessionId: string): ChatMode => {
      return orchestrator.getMode(sessionId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CHAT_CONFIRM_RESPONSE,
    (_e, requestId: string, allowed: boolean) => {
      getOrchestrator()?.resolveConfirm(requestId, allowed)
      return { requestId, allowed }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CHAT_ASK_RESPONSE,
    (_e, requestId: string, answer: string, skipped: boolean) => {
      getOrchestrator()?.resolveAsk(requestId, answer, skipped)
      return { requestId, answer, skipped }
    }
  )

  // 悬浮球快捷操作：新建会话 — 通知渲染进程触发新建
  setCreateSessionCallback(() => {
    safeSend(IPC_CHANNELS.FLOATING_BALL_ACTION, 'newSession')
  })

  // 悬浮球快捷操作：停止当前任务
  setStopTaskCallback(() => {
    if (activeSessionId) {
      orchestrator.abort(activeSessionId)
    }
  })
}
