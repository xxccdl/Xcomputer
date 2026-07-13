import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import { aiService } from '../ai/ai-service'
import { sessionsStore } from '../store/sessions'
import { getOrchestrator, addRemoteListener, removeRemoteListener } from '../orchestrator/task-orchestrator'
import { getWidgetWindow } from '../windows/widget-window'
import { logger } from '../utils/logger'
import type { StepEvent } from '@shared/types'

/** 简单对话消息（内存中维护，widget 生命周期内有效） */
interface SimpleMessage {
  role: 'user' | 'assistant'
  content: string
}

// widget 内存对话历史（隐藏时清空）
let widgetMessages: SimpleMessage[] = []
let chatAbortController: AbortController | null = null

// 当前活跃任务状态（通过 remote listener 追踪）
let activeTaskSessionId: string | null = null
let taskRunning = false

/** 清空 widget 对话状态（窗口隐藏时由 index.ts 调用） */
export function resetWidgetChat(): void {
  widgetMessages = []
  if (chatAbortController) {
    chatAbortController.abort()
    chatAbortController = null
  }
}

export function registerWidgetIpc(mainWindow: BrowserWindow): void {

  /** 安全发送 IPC 到 widget 窗口 */
  function sendToWidget(channel: string, ...args: unknown[]): void {
    const win = getWidgetWindow()
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }

  // 注册 remote listener：转发任务事件到 widget 窗口
  const taskEventListener = (channel: string, data: unknown): void => {
    try {
      if (channel === IPC_CHANNELS.CHAT_STEP) {
        const step = data as StepEvent
        if (step?.sessionId) {
          activeTaskSessionId = step.sessionId
          taskRunning = true
        }
        sendToWidget(IPC_CHANNELS.WIDGET_TASK_STEP, data)
      } else if (channel === IPC_CHANNELS.CHAT_DONE) {
        taskRunning = false
        sendToWidget(IPC_CHANNELS.WIDGET_TASK_DONE, data)
      } else if (channel === IPC_CHANNELS.CHAT_ERROR) {
        taskRunning = false
        sendToWidget(IPC_CHANNELS.WIDGET_TASK_ERROR, data)
      }
    } catch (err) {
      logger.error('[Widget IPC] task event listener error:', err)
    }
  }
  addRemoteListener(taskEventListener)

  // --- 对话相关 ---

  ipcMain.handle(IPC_CHANNELS.WIDGET_CHAT_SEND, async (_e, text: string) => {
    if (!text?.trim()) return
    // 如果上一次对话还在进行，先中断
    if (chatAbortController) {
      chatAbortController.abort()
    }

    widgetMessages.push({ role: 'user', content: text })
    chatAbortController = new AbortController()

    try {
      // 构造 aiService.chat 需要的消息格式
      const chatMessages = widgetMessages.map((m) => ({
        role: m.role,
        content: m.content
      }))

      const response = await aiService.chat(
        chatMessages,
        (delta) => {
          sendToWidget(IPC_CHANNELS.WIDGET_CHAT_DELTA, delta)
        },
        chatAbortController.signal
      )

      widgetMessages.push({ role: 'assistant', content: response })
      sendToWidget(IPC_CHANNELS.WIDGET_CHAT_DONE, response)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      // 用户中断时不报错，静默处理
      if (chatAbortController?.signal.aborted) {
        // 保留已接收的部分作为 assistant 回复
        logger.info('[Widget] 对话被用户中断')
      } else {
        sendToWidget(IPC_CHANNELS.WIDGET_CHAT_ERROR, errorMsg)
      }
    } finally {
      chatAbortController = null
    }
  })

  ipcMain.handle(IPC_CHANNELS.WIDGET_CHAT_STOP, async () => {
    if (chatAbortController) {
      chatAbortController.abort()
    }
  })

  // --- 任务进度相关 ---

  ipcMain.handle(IPC_CHANNELS.WIDGET_GET_TASK_STATE, async () => {
    if (!activeTaskSessionId) {
      return { sessionId: null, steps: [], isRunning: false }
    }
    try {
      const steps = await sessionsStore.getSteps(activeTaskSessionId)
      return {
        sessionId: activeTaskSessionId,
        steps,
        isRunning: taskRunning
      }
    } catch (err) {
      logger.error('[Widget] getTaskState 失败:', err)
      return { sessionId: activeTaskSessionId, steps: [], isRunning: taskRunning }
    }
  })

  ipcMain.handle(IPC_CHANNELS.WIDGET_STOP_TASK, async () => {
    if (activeTaskSessionId) {
      const orchestrator = getOrchestrator()
      if (orchestrator) {
        orchestrator.abort(activeTaskSessionId)
        logger.info(`[Widget] 已停止任务: ${activeTaskSessionId}`)
      }
    }
  })

  // --- 窗口控制 ---

  ipcMain.on(IPC_CHANNELS.WIDGET_HIDE, () => {
    const win = getWidgetWindow()
    if (win && !win.isDestroyed() && win.isVisible()) {
      win.hide()
    }
  })

  // 应用退出时清理 remote listener
  mainWindow.on('closed', () => {
    removeRemoteListener(taskEventListener)
  })
}
