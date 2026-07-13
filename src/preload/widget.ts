import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

// 内联 IPC 通道名（避免与主 preload 共享 chunk 导致 sandbox 加载失败）
const IPC = {
  WIDGET_CHAT_SEND: 'widget:chatSend',
  WIDGET_CHAT_STOP: 'widget:chatStop',
  WIDGET_CHAT_DELTA: 'widget:chatDelta',
  WIDGET_CHAT_DONE: 'widget:chatDone',
  WIDGET_CHAT_ERROR: 'widget:chatError',
  WIDGET_GET_TASK_STATE: 'widget:getTaskState',
  WIDGET_TASK_STEP: 'widget:taskStep',
  WIDGET_TASK_DONE: 'widget:taskDone',
  WIDGET_TASK_ERROR: 'widget:taskError',
  WIDGET_HIDE: 'widget:hide',
  WIDGET_STOP_TASK: 'widget:stopTask'
} as const

type Listener<T> = (payload: T) => void
type Unsubscribe = () => void

interface TaskStepInfo {
  id: string
  sessionId: string
  type: string
  status: string
  content?: string
  toolName?: string
  toolArgs?: string
  toolResult?: string
  startedAt?: number
  finishedAt?: number
  error?: string
}

interface TaskState {
  sessionId: string | null
  steps: TaskStepInfo[]
  isRunning: boolean
}

const widgetApi = {
  /** 发送对话消息（简单模式，无 agent） */
  chatSend(text: string): Promise<void> {
    return ipcRenderer.invoke(IPC.WIDGET_CHAT_SEND, text)
  },
  /** 中断当前对话 */
  chatStop(): Promise<void> {
    return ipcRenderer.invoke(IPC.WIDGET_CHAT_STOP)
  },
  /** 隐藏 widget 窗口 */
  hide(): void {
    ipcRenderer.send(IPC.WIDGET_HIDE)
  },
  /** 查询当前任务进度 */
  getTaskState(): Promise<TaskState> {
    return ipcRenderer.invoke(IPC.WIDGET_GET_TASK_STATE)
  },
  /** 停止主窗口当前任务 */
  stopTask(): Promise<void> {
    return ipcRenderer.invoke(IPC.WIDGET_STOP_TASK)
  },
  /** 监听流式输出增量 */
  onChatDelta(cb: Listener<string>): Unsubscribe {
    const handler = (_e: IpcRendererEvent, delta: string): void => cb(delta)
    ipcRenderer.on(IPC.WIDGET_CHAT_DELTA, handler)
    return () => ipcRenderer.removeListener(IPC.WIDGET_CHAT_DELTA, handler)
  },
  /** 监听对话完成 */
  onChatDone(cb: Listener<string>): Unsubscribe {
    const handler = (_e: IpcRendererEvent, response: string): void => cb(response)
    ipcRenderer.on(IPC.WIDGET_CHAT_DONE, handler)
    return () => ipcRenderer.removeListener(IPC.WIDGET_CHAT_DONE, handler)
  },
  /** 监听对话错误 */
  onChatError(cb: Listener<string>): Unsubscribe {
    const handler = (_e: IpcRendererEvent, error: string): void => cb(error)
    ipcRenderer.on(IPC.WIDGET_CHAT_ERROR, handler)
    return () => ipcRenderer.removeListener(IPC.WIDGET_CHAT_ERROR, handler)
  },
  /** 监听任务步骤更新 */
  onTaskStep(cb: Listener<TaskStepInfo>): Unsubscribe {
    const handler = (_e: IpcRendererEvent, step: TaskStepInfo): void => cb(step)
    ipcRenderer.on(IPC.WIDGET_TASK_STEP, handler)
    return () => ipcRenderer.removeListener(IPC.WIDGET_TASK_STEP, handler)
  },
  /** 监听任务完成 */
  onTaskDone(cb: Listener<{ sessionId: string }>): Unsubscribe {
    const handler = (_e: IpcRendererEvent, payload: { sessionId: string }): void => cb(payload)
    ipcRenderer.on(IPC.WIDGET_TASK_DONE, handler)
    return () => ipcRenderer.removeListener(IPC.WIDGET_TASK_DONE, handler)
  },
  /** 监听任务出错 */
  onTaskError(cb: Listener<{ sessionId: string; error: string }>): Unsubscribe {
    const handler = (_e: IpcRendererEvent, payload: { sessionId: string; error: string }): void => cb(payload)
    ipcRenderer.on(IPC.WIDGET_TASK_ERROR, handler)
    return () => ipcRenderer.removeListener(IPC.WIDGET_TASK_ERROR, handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('widgetApi', widgetApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.widgetApi = widgetApi
}

export type WidgetAPI = typeof widgetApi
